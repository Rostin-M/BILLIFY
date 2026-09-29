import "server-only";

import { env } from "~/env";

import { MockGateway } from "./mock";
import type { PaymentGateway } from "./types";
import { WompiGateway } from "./wompi";

export type { GatewayTransaction, PaymentGateway } from "./types";

/**
 * Pasarela activa según PAYMENTS_PROVIDER. Para cobrar de verdad con Wompi:
 *   PAYMENTS_PROVIDER=wompi
 *   WOMPI_PUBLIC_KEY=pub_prod_...        (pub_test_... = sandbox)
 *   WOMPI_INTEGRITY_SECRET=prod_integrity_...
 *   WOMPI_EVENTS_SECRET=prod_events_...
 * y en el panel de Wompi, URL de eventos: https://<tu-dominio>/api/webhooks/wompi
 */
export function getPaymentGateway(): PaymentGateway {
  if (env.PAYMENTS_PROVIDER === "wompi") {
    const { WOMPI_PUBLIC_KEY, WOMPI_INTEGRITY_SECRET, WOMPI_EVENTS_SECRET } = env;
    if (!WOMPI_PUBLIC_KEY || !WOMPI_INTEGRITY_SECRET || !WOMPI_EVENTS_SECRET) {
      throw new Error(
        "PAYMENTS_PROVIDER=wompi requiere WOMPI_PUBLIC_KEY, WOMPI_INTEGRITY_SECRET y WOMPI_EVENTS_SECRET",
      );
    }
    return new WompiGateway({
      publicKey: WOMPI_PUBLIC_KEY,
      integritySecret: WOMPI_INTEGRITY_SECRET,
      eventsSecret: WOMPI_EVENTS_SECRET,
    });
  }
  return new MockGateway();
}

/** ¿Se pueden simular pagos? Nunca en producción salvo que se autorice explícitamente. */
export function isMockPaymentsEnabled(): boolean {
  if (env.PAYMENTS_PROVIDER !== "mock") return false;
  return env.NODE_ENV !== "production" || env.PAYMENTS_ALLOW_MOCK_IN_PRODUCTION === "true";
}
