import { describe, expect, it } from "vitest";

import { getPeriodRangeBogota } from "~/server/lib/bogotaTime";
import { callerFor, createProduct, createShop, db } from "../../../../tests/integration/helpers";

describe("dashboard.summary", () => {
  it("resume ventas, inventario y caja del período", async () => {
    const { owner, cashier, business } = await createShop();
    const cerveza = await createProduct(business.id, { name: "Cerveza", price: 4000, stock: 20 });
    const vino = await createProduct(business.id, { name: "Vino", price: 30000, stock: 3 });
    await createProduct(business.id, { name: "Agotado", stock: 0 });
    await createProduct(business.id, { name: "Inactivo", isActive: false });
    await createProduct(business.id, { name: "Servicio", trackStock: false, stock: 0 });

    await callerFor(cashier).cashRegister.open({ openingBalance: 10000 });
    await callerFor(cashier).cashRegister.addMovement({ type: "EXPENSE", amount: 2000, description: "Hielo" });
    const caller = callerFor(cashier);
    await caller.sale.create({ items: [{ productId: cerveza.id, quantity: 5 }] });
    await caller.sale.create({ items: [{ productId: vino.id, quantity: 1 }], paymentMethod: "CARD" });
    const voided = await caller.sale.create({ items: [{ productId: cerveza.id, quantity: 1 }] });
    await callerFor(owner).sale.void({ saleId: voided.id, reason: "Error" });

    const summary = await callerFor(owner).dashboard.summary({ period: "week" });

    expect(summary.sales).toMatchObject({
      count: 2,
      total: 50000,
      voided: 1,
      byMethod: { CASH: 20000, CARD: 30000, TRANSFER: 0, CREDIT: 0 },
    });
    expect(summary.sales.byDay).toHaveLength(7);
    expect(summary.sales.byDay.reduce((s, d) => s + d.total, 0)).toBe(50000);
    expect(summary.topProducts[0]).toEqual({ name: "Cerveza", quantitySold: 5, revenue: 20000 });
    expect(summary.inventory).toEqual({
      totalActive: 4,
      lowStock: 1,
      outOfStock: 1,
      outOfStockNames: ["Agotado"],
    });
    expect(summary.cashRegister).toMatchObject({
      isOpen: true,
      currentBalance: 28000,
      manualIncome: 0,
      manualExpense: 2000,
      lastClosedAt: null,
    });
  });

  it("sin caja abierta muestra el último cierre y compara con el período anterior", async () => {
    const { owner, business } = await createShop();
    const product = await createProduct(business.id, { price: 1000 });
    await callerFor(owner).cashRegister.open({ openingBalance: 5000 });
    await callerFor(owner).cashRegister.close({});
    // Venta movida a la mitad del período anterior (misma duración justo antes de "hoy").
    const sale = await callerFor(owner).sale.create({ items: [{ productId: product.id, quantity: 1 }] });
    const { from, to } = getPeriodRangeBogota("today");
    const previousMidpoint = new Date(from.getTime() - (to.getTime() - from.getTime()) / 2 - 1);
    await db.sale.update({ where: { id: sale.id }, data: { createdAt: previousMidpoint } });

    const summary = await callerFor(owner).dashboard.summary({});

    expect(summary.cashRegister).toMatchObject({ isOpen: false, currentBalance: null, lastClosingBalance: 5000 });
    expect(summary.sales.count).toBe(0);
    expect(summary.comparison.sales).toEqual({ count: 1, total: 1000 });
  });
});
