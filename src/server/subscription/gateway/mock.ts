import "server-only";

import type { CheckoutInput, GatewayTransaction, PaymentGateway, WebhookParseResult } from "./types";

/**
 * Pasarela simulada: en lugar de ir a Wompi, el checkout abre una página interna
 * (/suscripcion/pago-simulado) donde el dueño elige "aprobar" o "rechazar". Esa
 * decisión entra por el MISMO procesador de pagos que usan los webhooks reales,
 * así que el flujo completo (activar, renovar, reactivar, correos) queda probado.
 *
 * No acepta webhooks: nadie de afuera puede simular un pago.
 */
export class MockGateway implements PaymentGateway {
  readonly provider = "mock" as const;

  createCheckoutUrl(input: CheckoutInput): string {
    const url = new URL(input.redirectUrl);
    url.pathname = "/suscripcion/pago-simulado";
    url.search = new URLSearchParams({ ref: input.reference }).toString();
    return url.toString();
  }

  parseWebhook(): WebhookParseResult {
    return { ok: false, reason: "invalid_signature" };
  }

  getTransaction(): Promise<GatewayTransaction | null> {
    return Promise.resolve(null);
  }
}

export function mockTransactionId(reference: string): string {
  return `mock-${reference}`;
}
