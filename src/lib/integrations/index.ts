// Registro central de integraciones.
// En MVP todos los adaptadores son NoOp — ninguna integración externa activa.
// Para habilitar una integración: reemplazar el adaptador NoOp con la implementación real
// e inyectarlo aquí antes de exportar.

export { dianAdapter, emitirFacturaDian } from "./dian";
export { notificationsAdapter, notificarVenta, notificarInventarioBajo } from "./notifications";
export { printerAdapter, imprimirRecibo, imprimirCierreCaja } from "./printers";
export { paymentsAdapter, procesarPagoExterno } from "./payments";
export { safeIntegrationCall } from "./types";
export type {
  SaleData,
  ProductData,
  CashRegisterData,
  IntegrationResult,
} from "./types";
export type { DianAdapter, DianEstado, DianFacturaResult } from "./dian";
export type { NotificationsAdapter } from "./notifications";
export type { PrinterAdapter } from "./printers";
export type { PaymentsAdapter, EstadoPago, PagoResult } from "./payments";
