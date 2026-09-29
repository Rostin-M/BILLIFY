import { NextResponse, type NextRequest } from "next/server";

import type { Prisma } from "@prisma/client";

import { db } from "~/server/db";
import { getPaymentGateway } from "~/server/subscription/gateway";
import { processGatewayTransaction } from "~/server/subscription/payments";

/** Los eventos de Wompi pesan pocos KB; nada más grande se procesa. */
const MAX_BODY_BYTES = 64 * 1024;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Webhook de eventos de Wompi (URL de eventos en el panel de Wompi).
 * - Valida la firma (checksum SHA256 con WOMPI_EVENTS_SECRET): sin firma válida → 401.
 * - Idempotente: cada evento se registra con clave única (transacción:estado);
 *   un reenvío ya procesado responde 200 sin volver a aplicar nada.
 * - Responde 200 a eventos válidos aunque no apliquen, para que Wompi no reintente;
 *   500 solo si falla el procesamiento (Wompi reintenta).
 */
export async function POST(req: NextRequest) {
  const gateway = getPaymentGateway();
  if (gateway.provider !== "wompi") return json({ error: "Webhook desactivado" }, 404);

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return json({ error: "Cuerpo demasiado grande" }, 413);
  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return json({ error: "Cuerpo demasiado grande" }, 413);

  const parsed = gateway.parseWebhook(raw, req.headers);
  if (!parsed.ok) {
    if (parsed.reason === "ignored") return json({ received: true, ignored: true });
    if (parsed.reason === "invalid_signature") {
      console.warn("[webhook:wompi] firma inválida");
      return json({ error: "Firma inválida" }, 401);
    }
    return json({ error: "Evento inválido" }, 400);
  }

  const provider = gateway.provider;
  const { eventKey, transaction } = parsed;

  const event = await db.paymentWebhookEvent.upsert({
    where: { provider_eventKey: { provider, eventKey } },
    create: { provider, eventKey, payload: JSON.parse(raw) as Prisma.InputJsonValue },
    update: {},
    select: { id: true, processedAt: true },
  });
  if (event.processedAt) return json({ received: true, duplicate: true });

  try {
    const result = await processGatewayTransaction(db, transaction);
    await db.paymentWebhookEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date(), outcome: result.outcome },
    });
    if (result.outcome === "amount_mismatch" || result.outcome === "voided_after_approval") {
      console.warn(`[webhook:wompi] ${result.outcome} ref=${transaction.reference}`);
    }
    return json({ received: true, outcome: result.outcome });
  } catch (err) {
    console.error("[webhook:wompi] error procesando", err instanceof Error ? err.message : err);
    return json({ error: "Error procesando el evento" }, 500);
  }
}
