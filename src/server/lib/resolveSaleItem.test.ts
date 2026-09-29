import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import {
  assertReceiptPath,
  isValidReceiptPath,
  resolveSaleItem,
  saleItemInputSchema,
  type SellableProduct,
} from "./resolveSaleItem";

const product: SellableProduct = {
  id: "p1",
  name: "Gaseosa",
  unit: "und",
  price: 2500,
  trackStock: true,
  taxSlots: [0],
  openPrice: false,
  soldByWeight: false,
};

const RECEIPT = "biz.1/1700000000000-123e4567-e89b-12d3-a456-426614174000.png";

describe("resolveSaleItem", () => {
  it("producto normal: usa el precio del catálogo y descuenta stock", () => {
    expect(resolveSaleItem(product, { productId: "p1", quantity: 3 })).toEqual({
      productId: "p1",
      name: "Gaseosa",
      unit: "und",
      price: 2500,
      quantity: 3,
      subtotal: 7500,
      taxSlots: [0],
      stockDelta: 3,
    });
  });

  it("producto normal sin control de stock no descuenta", () => {
    const result = resolveSaleItem({ ...product, trackStock: false }, { productId: "p1", quantity: 2 });
    expect(result.stockDelta).toBe(0);
  });

  it("ignora customAmount en productos normales (no confía en el cliente)", () => {
    const result = resolveSaleItem(product, { productId: "p1", quantity: 1, customAmount: 1 });
    expect(result.price).toBe(2500);
  });

  it("venta por peso: redondea hacia arriba a la centena", () => {
    const weighted = { ...product, name: "Queso", price: 18000, soldByWeight: true };
    expect(resolveSaleItem(weighted, { productId: "p1", quantity: 1, weightKg: 0.265 })).toMatchObject({
      name: "Queso (0.265 kg)",
      price: 4800,
      quantity: 1,
      subtotal: 4800,
      stockDelta: 0,
    });
  });

  it("venta por peso sin peso lanza BAD_REQUEST", () => {
    const weighted = { ...product, soldByWeight: true };
    expect(() => resolveSaleItem(weighted, { productId: "p1", quantity: 1 })).toThrow(TRPCError);
    expect(() => resolveSaleItem(weighted, { productId: "p1", quantity: 1, weightKg: 0 })).toThrow(
      'Indica el peso de "Gaseosa".',
    );
  });

  it("monto libre: usa el monto enviado", () => {
    const open = { ...product, openPrice: true };
    expect(resolveSaleItem(open, { productId: "p1", quantity: 5, customAmount: 12000 })).toMatchObject({
      price: 12000,
      quantity: 1,
      subtotal: 12000,
      stockDelta: 0,
    });
  });

  it("monto libre sin monto lanza BAD_REQUEST", () => {
    const open = { ...product, openPrice: true };
    expect(() => resolveSaleItem(open, { productId: "p1", quantity: 1, customAmount: -5 })).toThrow(
      'Indica el monto para "Gaseosa".',
    );
  });
});

describe("rutas de comprobante", () => {
  it("acepta rutas del propio negocio generadas por el endpoint", () => {
    expect(isValidReceiptPath("biz.1", RECEIPT)).toBe(true);
    expect(assertReceiptPath("biz.1", RECEIPT)).toBe(RECEIPT);
  });

  it("rechaza rutas de otro negocio o con formato inválido", () => {
    expect(isValidReceiptPath("biz.2", RECEIPT)).toBe(false);
    // El punto del id se escapa: no actúa como comodín.
    expect(isValidReceiptPath("biz.1", RECEIPT.replace("biz.1", "bizX1"))).toBe(false);
    expect(isValidReceiptPath("biz.1", RECEIPT.replace(".png", ".svg"))).toBe(false);
    expect(isValidReceiptPath("biz.1", `../${RECEIPT}`)).toBe(false);
  });

  it("assertReceiptPath devuelve null sin ruta y lanza con una ruta ajena", () => {
    expect(assertReceiptPath("biz.1", undefined)).toBeNull();
    expect(() => assertReceiptPath("biz.2", RECEIPT)).toThrow("El comprobante adjunto no es válido.");
  });
});

describe("saleItemInputSchema", () => {
  it("valida cantidades y límites", () => {
    expect(saleItemInputSchema.safeParse({ productId: "p1", quantity: 2 }).success).toBe(true);
    expect(saleItemInputSchema.safeParse({ productId: "p1", quantity: 0 }).success).toBe(false);
    expect(saleItemInputSchema.safeParse({ productId: "p1", quantity: 1.5 }).success).toBe(false);
    expect(saleItemInputSchema.safeParse({ productId: "", quantity: 1 }).success).toBe(false);
    expect(
      saleItemInputSchema.safeParse({ productId: "p1", quantity: 1, weightKg: 5000 }).success,
    ).toBe(false);
  });
});
