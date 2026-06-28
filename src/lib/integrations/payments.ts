// Contrato v1 — Pasarelas de pago externas
// Candidatos: Wompi, PayU, Mercado Pago (Colombia).
// NOTA: los métodos CASH/CARD/CREDIT/TRANSFER del core no requieren integración;
// este adaptador es para pagos digitales en línea en flujos futuros.

import { type IntegrationResult, safeIntegrationCall } from "./types";

export type EstadoPago = "APROBADO" | "RECHAZADO" | "PENDIENTE" | "NO_PROCESADO";

export type PagoResult = {
  referencia: string;
  estado: EstadoPago;
  fechaProcesado: Date | null;
};

export interface PaymentsAdapter {
  isEnabled(): boolean;
  procesarPago(monto: number, referencia: string, descripcion: string): Promise<IntegrationResult<PagoResult>>;
  consultarEstado(referencia: string): Promise<IntegrationResult<EstadoPago>>;
}

class NoOpPaymentsAdapter implements PaymentsAdapter {
  isEnabled() {
    return false;
  }

  async procesarPago(_monto: number, referencia: string, _descripcion: string): Promise<IntegrationResult<PagoResult>> {
    return { success: true, data: { referencia, estado: "NO_PROCESADO", fechaProcesado: null } };
  }

  async consultarEstado(_referencia: string): Promise<IntegrationResult<EstadoPago>> {
    return { success: true, data: "NO_PROCESADO" };
  }
}

export const paymentsAdapter: PaymentsAdapter = new NoOpPaymentsAdapter();

export async function procesarPagoExterno(
  monto: number,
  referencia: string,
  descripcion: string,
): Promise<IntegrationResult<PagoResult>> {
  return safeIntegrationCall(
    "Payments.procesar",
    () => paymentsAdapter.procesarPago(monto, referencia, descripcion),
    { success: false, error: "Error al contactar pasarela de pagos" },
  );
}
