import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { createShop, db, setSubscription } from "../../../../../tests/integration/helpers";
import { signedWompiEvent, WOMPI_TEST_CONFIG } from "../../../../../tests/wompiEvents";

// La ruta usa la pasarela activa: aquí, Wompi con secretos de prueba.
vi.mock("~/server/subscription/gateway", async (importOriginal) => {
  const original = await importOriginal<typeof import("~/server/subscription/gateway")>();
  const { WompiGateway } = await import("~/server/subscription/gateway/wompi");
  return { ...original, getPaymentGateway: () => new WompiGateway(WOMPI_TEST_CONFIG) };
});

const { POST } = await import("./route");

const DAY_MS = 24 * 60 * 60 * 1000;

function webhook(body: string, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest("https://billify.test/api/webhooks/wompi", {
      method: "POST",
      body,
      headers: { "content-type": "application/json", ...headers },
    }),
  );
}

/** Negocio con la prueba vencida y un pago Wompi pendiente del plan Básico. */
async function pendingPayment() {
  const { business, owner } = await createShop();
  const sub = await setSubscription(business.id, {
    plan: "BUSINESS",
    status: "TRIAL",
    trialEndsAt: new Date(Date.now() - DAY_MS),
    currentPeriodStart: null,
    currentPeriodEnd: null,
  });
  const payment = await db.subscriptionPayment.create({
    data: {
      subscriptionId: sub.id,
      businessId: business.id,
      reference: "BLF-TEST-000001",
      provider: "wompi",
      kind: "PERIOD",
      plan: "BASIC",
      billingCycle: "MONTHLY",
      amountInCents: 2_990_000,
      createdById: owner.id,
    },
  });
  return { business, payment };
}

const approved = (reference: string, amount = 2_990_000) => ({
  id: "12345-1760000000-00001",
  status: "APPROVED",
  reference,
  amount_in_cents: amount,
});

describe("POST /api/webhooks/wompi", () => {
  it("con firma válida aprueba el pago y reactiva la suscripción", async () => {
    const { payment } = await pendingPayment();

    const res = await webhook(signedWompiEvent(approved(payment.reference)));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ outcome: "approved" });
    await expect(db.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id } })).resolves.toMatchObject({
      status: "APPROVED",
      providerTransactionId: "12345-1760000000-00001",
    });
    const sub = await db.subscription.findFirstOrThrow();
    expect(sub.status).toBe("ACTIVE");
    expect(sub.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 27 * DAY_MS);
  });

  it("webhook duplicado: el reenvío responde 200 sin volver a extender el período", async () => {
    const { payment } = await pendingPayment();
    const body = signedWompiEvent(approved(payment.reference));

    await webhook(body);
    const endAfterFirst = (await db.subscription.findFirstOrThrow()).currentPeriodEnd;
    const res = await webhook(body);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ duplicate: true });
    await expect(db.subscription.findFirstOrThrow()).resolves.toMatchObject({ currentPeriodEnd: endAfterFirst });
    await expect(db.paymentWebhookEvent.count()).resolves.toBe(1);
  });

  it("firma inválida → 401 y no toca nada", async () => {
    const { payment } = await pendingPayment();

    const res = await webhook(signedWompiEvent(approved(payment.reference), "secreto-falso"));

    expect(res.status).toBe(401);
    await expect(db.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id } })).resolves.toMatchObject({
      status: "PENDING",
    });
    await expect(db.paymentWebhookEvent.count()).resolves.toBe(0);
  });

  it("pago rechazado: queda DECLINED y el negocio sigue bloqueado", async () => {
    const { payment } = await pendingPayment();

    const res = await webhook(signedWompiEvent({ ...approved(payment.reference), status: "DECLINED" }));

    expect(res.status).toBe(200);
    await expect(db.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id } })).resolves.toMatchObject({
      status: "DECLINED",
    });
    await expect(db.subscription.findFirstOrThrow()).resolves.toMatchObject({ currentPeriodEnd: null });
  });

  it("una aprobación que llega después de un rechazo (reintento en Wompi) sí se aplica", async () => {
    const { payment } = await pendingPayment();
    await webhook(signedWompiEvent({ ...approved(payment.reference), status: "DECLINED" }));

    await webhook(signedWompiEvent({ ...approved(payment.reference), id: "12345-1760000000-00002" }));

    await expect(db.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id } })).resolves.toMatchObject({
      status: "APPROVED",
    });
  });

  it("monto distinto al esperado: no activa nada", async () => {
    const { payment } = await pendingPayment();

    const res = await webhook(signedWompiEvent(approved(payment.reference, 100)));

    await expect(res.json()).resolves.toMatchObject({ outcome: "amount_mismatch" });
    await expect(db.subscription.findFirstOrThrow()).resolves.toMatchObject({ currentPeriodEnd: null });
  });

  it("referencia desconocida: responde 200 para que Wompi no reintente, sin efectos", async () => {
    await pendingPayment();
    const res = await webhook(signedWompiEvent(approved("BLF-OTRA-999999")));
    await expect(res.json()).resolves.toMatchObject({ outcome: "unknown_reference" });
  });

  it("rechaza cuerpos demasiado grandes", async () => {
    const res = await webhook("x".repeat(70 * 1024));
    expect(res.status).toBe(413);
  });
});
