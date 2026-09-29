// Contrato v1 — DIAN (facturación electrónica Colombia)
// Referencia: Resolución DIAN 000042/2020 y normas UBL 2.1
// Implementación real requiere certificado digital + habilitación ante DIAN.

import { type IntegrationResult, type SaleData, safeIntegrationCall } from "./types";

export type DianEstado = "ACEPTADO" | "RECHAZADO" | "PENDIENTE" | "NO_ENVIADO";

export type DianFacturaResult = {
  cufe: string;
  estado: DianEstado;
  fechaValidacion: Date | null;
};

export interface DianAdapter {
  isEnabled(): boolean;
  emitirFactura(sale: SaleData): Promise<IntegrationResult<DianFacturaResult>>;
  anularFactura(invoiceNumber: string, motivo: string): Promise<IntegrationResult>;
  consultarEstado(invoiceNumber: string): Promise<IntegrationResult<DianEstado>>;
}

class NoOpDianAdapter implements DianAdapter {
  isEnabled() {
    return false;
  }

  emitirFactura(_sale: SaleData): Promise<IntegrationResult<DianFacturaResult>> {
    return Promise.resolve({ success: true, data: { cufe: "", estado: "NO_ENVIADO", fechaValidacion: null } });
  }

  anularFactura(_invoiceNumber: string, _motivo: string): Promise<IntegrationResult> {
    return Promise.resolve({ success: true, data: undefined });
  }

  consultarEstado(_invoiceNumber: string): Promise<IntegrationResult<DianEstado>> {
    return Promise.resolve({ success: true, data: "NO_ENVIADO" });
  }
}

export const dianAdapter: DianAdapter = new NoOpDianAdapter();

export async function emitirFacturaDian(sale: SaleData): Promise<IntegrationResult<DianFacturaResult>> {
  return safeIntegrationCall(
    "DIAN.emitirFactura",
    () => dianAdapter.emitirFactura(sale),
    { success: false, error: "Error interno al contactar DIAN" },
  );
}
