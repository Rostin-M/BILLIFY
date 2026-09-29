import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { adjustStock, stockToRestore } from "./inventory";

function makeTx(opts: { updated: number; product?: { name: string; stock: number } | null }) {
  const product = {
    updateMany: vi.fn().mockResolvedValue({ count: opts.updated }),
    findFirst: vi.fn().mockResolvedValue(opts.product ?? null),
  };
  const inventoryMovement = { create: vi.fn().mockResolvedValue({}) };
  const tx = { product, inventoryMovement } as unknown as Prisma.TransactionClient;
  return { tx, product, inventoryMovement };
}

const base = { productId: "p1", businessId: "b1", userId: "u1" };

describe("adjustStock", () => {
  it("descuenta con condición de stock suficiente y registra el movimiento", async () => {
    const { tx, product, inventoryMovement } = makeTx({ updated: 1, product: { name: "Pan", stock: 7 } });

    const result = await adjustStock({ tx, ...base, quantity: -3, reason: "SALE" });

    expect(result).toEqual({ newStock: 7, previousStock: 10 });
    expect(product.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", businessId: "b1", stock: { gte: 3 } },
      data: { stock: { increment: -3 } },
    });
    expect(inventoryMovement.create).toHaveBeenCalledWith({
      data: {
        businessId: "b1",
        productId: "p1",
        userId: "u1",
        quantity: -3,
        reason: "SALE",
        note: null,
        stockAfter: 7,
      },
    });
  });

  it("las entradas no exigen stock mínimo y guardan la nota", async () => {
    const { tx, product, inventoryMovement } = makeTx({ updated: 1, product: { name: "Pan", stock: 15 } });

    await adjustStock({ tx, ...base, quantity: 5, reason: "MANUAL_ADJUSTMENT", note: "Compra" });

    expect(product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p1", businessId: "b1" } }),
    );
    expect(inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ note: "Compra", stockAfter: 15 }) as unknown,
    });
  });

  it("lanza NOT_FOUND si el producto no es del negocio", async () => {
    const { tx } = makeTx({ updated: 0, product: null });
    await expect(adjustStock({ tx, ...base, quantity: -1, reason: "SALE" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("lanza BAD_REQUEST con el stock disponible si no alcanza", async () => {
    const { tx, inventoryMovement } = makeTx({ updated: 0, product: { name: "Pan", stock: 2 } });
    await expect(adjustStock({ tx, ...base, quantity: -5, reason: "SALE" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: 'Stock insuficiente para "Pan". Disponible: 2.',
    });
    expect(inventoryMovement.create).not.toHaveBeenCalled();
  });
});

describe("stockToRestore", () => {
  const product = { trackStock: true, openPrice: false, soldByWeight: false };

  it("devuelve exactamente lo descontado cuando está registrado", () => {
    expect(stockToRestore({ quantity: 5, stockDeducted: 2, product })).toBe(2);
    expect(stockToRestore({ quantity: 5, stockDeducted: 0, product })).toBe(0);
  });

  it("filas históricas: la cantidad si el producto controla stock", () => {
    expect(stockToRestore({ quantity: 4, stockDeducted: null, product })).toBe(4);
  });

  it("filas históricas: 0 para productos sin stock, monto libre o por peso", () => {
    expect(stockToRestore({ quantity: 4, stockDeducted: null, product: { ...product, trackStock: false } })).toBe(0);
    expect(stockToRestore({ quantity: 4, stockDeducted: null, product: { ...product, openPrice: true } })).toBe(0);
    expect(stockToRestore({ quantity: 4, stockDeducted: null, product: { ...product, soldByWeight: true } })).toBe(0);
  });
});
