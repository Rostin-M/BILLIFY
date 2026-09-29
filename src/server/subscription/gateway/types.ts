/**
 * Contrato común de las pasarelas de pago de la suscripción. El resto del
 * backend solo conoce estos tipos: cambiar de pasarela (o pasar de la simulada a
 * Wompi) no toca la lógica de cobro.
 */

export type GatewayProvider = "wompi" | "mock";

export type GatewayTransactionStatus = "APPROVED" | "DECLINED" | "VOIDED" | "ERROR" | "PENDING";

/** Transacción normalizada, venga de un webhook o de una consulta a la API. */
export type GatewayTransaction = {
  provider: GatewayProvider;
  transactionId: string;
  reference: string;
  status: GatewayTransactionStatus;
  amountInCents: number;
  currency: string;
  statusMessage: string | null;
};

export type CheckoutInput = {
  reference: string;
  amountInCents: number;
  currency: "COP";
  customerEmail: string | null;
  /** URL absoluta a la que la pasarela devuelve al cliente. */
  redirectUrl: string;
};

export type WebhookParseResult =
  | { ok: true; eventKey: string; transaction: GatewayTransaction }
  /** `ignored`: evento válido pero que no nos interesa (se responde 200). */
  | { ok: false; reason: "invalid_signature" | "malformed" | "ignored" };

export interface PaymentGateway {
  readonly provider: GatewayProvider;
  /** URL a la que se envía al cliente para pagar. */
  createCheckoutUrl(input: CheckoutInput): string;
  /** Valida la firma del webhook y lo normaliza. Nunca confía en el cuerpo sin firma. */
  parseWebhook(rawBody: string, headers: Headers): WebhookParseResult;
  /** Consulta el estado real de una transacción (al volver del checkout o en el cron). */
  getTransaction(transactionId: string): Promise<GatewayTransaction | null>;
}
