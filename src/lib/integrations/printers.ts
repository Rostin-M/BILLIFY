// Contrato v1 — Impresoras (recibos y cierres de caja)
// Candidatos: impresoras térmicas ESC/POS vía Star Micronics SDK o QZ Tray (browser).

import { type CashRegisterData, type SaleData, safeIntegrationCall } from "./types";

export interface PrinterAdapter {
  isEnabled(): boolean;
  imprimirRecibo(sale: SaleData): Promise<void>;
  imprimirCierreCaja(register: CashRegisterData): Promise<void>;
}

class NoOpPrinterAdapter implements PrinterAdapter {
  isEnabled() {
    return false;
  }

  async imprimirRecibo(_sale: SaleData) {
    return;
  }

  async imprimirCierreCaja(_register: CashRegisterData) {
    return;
  }
}

export const printerAdapter: PrinterAdapter = new NoOpPrinterAdapter();

export async function imprimirRecibo(sale: SaleData): Promise<void> {
  await safeIntegrationCall(
    "Printer.recibo",
    () => printerAdapter.imprimirRecibo(sale),
    undefined,
  );
}

export async function imprimirCierreCaja(register: CashRegisterData): Promise<void> {
  await safeIntegrationCall(
    "Printer.cierreCaja",
    () => printerAdapter.imprimirCierreCaja(register),
    undefined,
  );
}
