import { describe, expect, it } from "vitest";

import { callerFor, createProduct, createShop } from "../../../../tests/integration/helpers";

describe("auditLog", () => {
  it("lista y filtra la auditoría del negocio", async () => {
    const { owner, cashier, business } = await createShop();
    const product = await createProduct(business.id);
    const sale = await callerFor(cashier).sale.create({ items: [{ productId: product.id, quantity: 1 }] });
    await callerFor(owner).sale.void({ saleId: sale.id, reason: "Prueba" });
    const caller = callerFor(owner);

    await expect(caller.auditLog.list({})).resolves.toHaveLength(2);
    await expect(caller.auditLog.list({ action: "VOID_SALE" })).resolves.toEqual([
      expect.objectContaining({ action: "VOID_SALE", entityId: sale.id, user: expect.objectContaining({ name: owner.name }) as unknown }),
    ]);
    await expect(caller.auditLog.list({ limit: 1 })).resolves.toHaveLength(1);
    await expect(callerFor(cashier).auditLog.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("exporta los movimientos de caja del período", async () => {
    const { owner, cashier } = await createShop();
    await callerFor(cashier).cashRegister.open({ openingBalance: 30000 });
    await callerFor(cashier).cashRegister.addMovement({ type: "INCOME", amount: 1000, description: "Base extra" });

    const movements = await callerFor(owner).auditLog.exportCashPeriod({ period: "today" });

    expect(movements.map((m) => m.type)).toEqual(["OPENING", "INCOME"]);
  });
});

describe("admin.dbStats", () => {
  it("cuenta los registros del negocio", async () => {
    const { owner, business } = await createShop();
    await createProduct(business.id);
    await createProduct(business.id);

    const stats = await callerFor(owner).admin.dbStats();

    expect(stats.tablas).toMatchObject({ productos: 2, ventas: 0, clientes: 0 });
    expect(stats.verificadoEn).toBeInstanceOf(Date);
  });
});
