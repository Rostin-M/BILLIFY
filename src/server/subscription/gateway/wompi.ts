import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import type {
  CheckoutInput,
  GatewayTransaction,
  GatewayTransactionStatus,
  PaymentGateway,
  WebhookParseResult,
} from "./types";

/**
 * Wompi (Bancolombia): Web Checkout + eventos firmados.
 *
 * - Checkout: https://checkout.wompi.co/p/ con firma de integridad
 *   SHA256(referencia + montoEnCentavos + moneda + secretoDeIntegridad).
 * - Eventos: SHA256(valores de `signature.properties` + `timestamp` + secretoDeEventos)
 *   debe coincidir con `signature.checksum`.
 * - API: GET /v1/transactions/:id (sandbox si la llave pública es pub_test_).
 *
 * Referencia: docs.wompi.co (Widget & Checkout Web, Eventos). Antes de salir a
 * producción, confirma estos formatos en la documentación vigente de Wompi.
 */

export type WompiConfig = {
  publicKey: string;
  integritySecret: string;
  eventsSecret: string;
  fetchImpl?: typeof fetch;
};

const CHECKOUT_URL = "https://checkout.wompi.co/p/";

const STATUS_MAP: Record<string, GatewayTransactionStatus> = {
  APPROVED: "APPROVED",
  DECLINED: "DECLINED",
  VOIDED: "VOIDED",
  ERROR: "ERROR",
  PENDING: "PENDING",
};

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function integritySignature(reference: string, amountInCents: number, currency: string, secret: string): string {
  return sha256Hex(`${reference}${amountInCents}${currency}${secret}`);
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a.toLowerCase(), "utf8");
  const right = Buffer.from(b.toLowerCase(), "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Lee "transaction.amount_in_cents" dentro de `data`. */
function readPath(root: unknown, path: string): unknown {
  let node: unknown = root;
  for (const key of path.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

function normalizeTransaction(raw: unknown): GatewayTransaction | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const status = typeof t.status === "string" ? STATUS_MAP[t.status] : undefined;
  if (
    typeof t.id !== "string" ||
    typeof t.reference !== "string" ||
    typeof t.amount_in_cents !== "number" ||
    typeof t.currency !== "string" ||
    !status
  ) {
    return null;
  }
  return {
    provider: "wompi",
    transactionId: t.id,
    reference: t.reference,
    status,
    amountInCents: t.amount_in_cents,
    currency: t.currency,
    statusMessage: typeof t.status_message === "string" ? t.status_message.slice(0, 300) : null,
  };
}

export class WompiGateway implements PaymentGateway {
  readonly provider = "wompi" as const;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: WompiConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private get apiBase(): string {
    return this.config.publicKey.startsWith("pub_prod_")
      ? "https://production.wompi.co/v1"
      : "https://sandbox.wompi.co/v1";
  }

  createCheckoutUrl(input: CheckoutInput): string {
    const params = new URLSearchParams({
      "public-key": this.config.publicKey,
      currency: input.currency,
      "amount-in-cents": String(input.amountInCents),
      reference: input.reference,
      "signature:integrity": integritySignature(
        input.reference,
        input.amountInCents,
        input.currency,
        this.config.integritySecret,
      ),
      "redirect-url": input.redirectUrl,
    });
    if (input.customerEmail) params.set("customer-data:email", input.customerEmail);
    return `${CHECKOUT_URL}?${params.toString()}`;
  }

  parseWebhook(rawBody: string, headers: Headers): WebhookParseResult {
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: "malformed" };
    }
    if (!body || typeof body !== "object") return { ok: false, reason: "malformed" };
    const event = body as Record<string, unknown>;
    const signature = event.signature as { properties?: unknown; checksum?: unknown } | undefined;
    const timestamp = event.timestamp;

    if (
      !signature ||
      !Array.isArray(signature.properties) ||
      !signature.properties.every((p) => typeof p === "string") ||
      typeof signature.checksum !== "string" ||
      (typeof timestamp !== "number" && typeof timestamp !== "string")
    ) {
      return { ok: false, reason: "malformed" };
    }

    const values = signature.properties.map((p: string) => {
      const v = readPath(event.data, p);
      return typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v) : "";
    });
    const expected = sha256Hex(`${values.join("")}${String(timestamp)}${this.config.eventsSecret}`);
    const headerChecksum = headers.get("x-event-checksum");

    if (!safeEqualHex(expected, signature.checksum)) return { ok: false, reason: "invalid_signature" };
    // Si Wompi envía también la cabecera, debe coincidir con el cuerpo.
    if (headerChecksum && !safeEqualHex(expected, headerChecksum)) return { ok: false, reason: "invalid_signature" };

    if (event.event !== "transaction.updated") return { ok: false, reason: "ignored" };

    const transaction = normalizeTransaction(readPath(event.data, "transaction"));
    if (!transaction) return { ok: false, reason: "malformed" };

    return { ok: true, eventKey: `${transaction.transactionId}:${transaction.status}`, transaction };
  }

  async getTransaction(transactionId: string): Promise<GatewayTransaction | null> {
    // Los ids de Wompi son alfanuméricos con guiones; nada más llega a la URL.
    if (!/^[A-Za-z0-9-]{1,80}$/.test(transactionId)) return null;
    const res = await this.fetchImpl(`${this.apiBase}/transactions/${transactionId}`, {
      headers: { Authorization: `Bearer ${this.config.publicKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: unknown };
    return normalizeTransaction(json.data);
  }
}
