import { afterEach, describe, expect, it, vi } from "vitest";

import {
  dianAdapter,
  emitirFacturaDian,
  imprimirCierreCaja,
  imprimirRecibo,
  notificarInventarioBajo,
  notificarVenta,
  notificationsAdapter,
  paymentsAdapter,
  printerAdapter,
  procesarPagoExterno,
  safeIntegrationCall,
  type CashRegisterData,
  type SaleData,
} from "./index";

const sale: SaleData = {
  id: "s1",
  invoiceNumber: "F-2026-00001",
  saleType: "INVOICED",
  paymentMethod: "CASH",
  subtotal: 10000,
  taxAmount: 1900,
  total: 11900,
  note: null,
  createdAt: new Date(),
  customer: null,
  items: [{ name: "Pan", quantity: 1, price: 11900, subtotal: 11900 }],
};

const register: CashRegisterData = {
  id: "r1",
  openingBalance: 0,
  closingBalance: 0,
  cashSalesTotal: 0,
  manualBalance: 0,
  openedAt: new Date(),
  closedAt: new Date(),
};

afterEach(() => vi.restoreAllMocks());

describe("adaptadores NoOp del MVP", () => {
  it("ninguna integración externa está habilitada", () => {
    for (const adapter of [dianAdapter, notificationsAdapter, printerAdapter, paymentsAdapter]) {
      expect(adapter.isEnabled()).toBe(false);
    }
  });

  it("DIAN no envía facturas", async () => {
    await expect(emitirFacturaDian(sale)).resolves.toEqual({
      success: true,
      data: { cufe: "", estado: "NO_ENVIADO", fechaValidacion: null },
    });
    await expect(dianAdapter.anularFactura("F-1", "error")).resolves.toEqual({ success: true, data: undefined });
    await expect(dianAdapter.consultarEstado("F-1")).resolves.toEqual({ success: true, data: "NO_ENVIADO" });
  });

  it("pagos externos no se procesan", async () => {
    await expect(procesarPagoExterno(1000, "ref-1", "Venta")).resolves.toEqual({
      success: true,
      data: { referencia: "ref-1", estado: "NO_PROCESADO", fechaProcesado: null },
    });
    await expect(paymentsAdapter.consultarEstado("ref-1")).resolves.toEqual({ success: true, data: "NO_PROCESADO" });
  });

  it("notificaciones e impresión no hacen nada", async () => {
    await expect(notificarVenta(sale, "c@x.co")).resolves.toBeUndefined();
    await expect(notificarInventarioBajo({ id: "p1", name: "Pan", stock: 1, category: null })).resolves.toBeUndefined();
    await expect(notificationsAdapter.enviarRecibo(sale, "c@x.co")).resolves.toBeUndefined();
    await expect(imprimirRecibo(sale)).resolves.toBeUndefined();
    await expect(imprimirCierreCaja(register)).resolves.toBeUndefined();
  });
});

describe("safeIntegrationCall", () => {
  it("devuelve el fallback y registra el error sin romper la operación", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("pasarela caída");

    await expect(safeIntegrationCall("Pagos", () => Promise.reject(failure), "fallback")).resolves.toBe("fallback");
    expect(error).toHaveBeenCalledWith("[Integration:Pagos]", failure);
  });

  it("los adaptadores que fallan devuelven su resultado de error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(dianAdapter, "emitirFactura").mockRejectedValueOnce(new Error("DIAN caída"));
    vi.spyOn(paymentsAdapter, "procesarPago").mockRejectedValueOnce(new Error("timeout"));

    await expect(emitirFacturaDian(sale)).resolves.toEqual({ success: false, error: "Error interno al contactar DIAN" });
    await expect(procesarPagoExterno(1, "r", "d")).resolves.toEqual({
      success: false,
      error: "Error al contactar pasarela de pagos",
    });
  });
});
