import { describe, expect, it } from "vitest";

import { callerFor, createShop, createUser, db } from "../../../tests/integration/helpers";

describe("middlewares de autorización", () => {
  it("rechaza llamadas sin sesión", async () => {
    await expect(callerFor(null).product.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rechaza sesiones vencidas (más de 24 h)", async () => {
    const { owner } = await createShop();
    const loginAt = Date.now() - 25 * 60 * 60 * 1000;
    await expect(callerFor(owner, { loginAt }).product.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rechaza usuarios inactivos o con sessionVersion distinta", async () => {
    const { owner, cashier } = await createShop();
    await db.user.update({ where: { id: cashier.id }, data: { isActive: false } });
    await db.user.update({ where: { id: owner.id }, data: { sessionVersion: 1 } });

    await expect(callerFor(cashier).product.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(callerFor({ id: owner.id, sessionVersion: 0 }).product.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("solo permite el router auth mientras se deba cambiar la contraseña", async () => {
    const { cashier } = await createShop();
    await db.user.update({ where: { id: cashier.id }, data: { mustChangePassword: true } });

    await expect(callerFor(cashier).product.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Debes cambiar tu contraseña",
    });
  });

  it("exige negocio asociado y rol de dueño donde corresponde", async () => {
    const orphan = await createUser({ businessId: null, role: "OWNER" });
    const { cashier } = await createShop();

    await expect(callerFor(orphan).product.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(orphan).sale.exportForPeriod({ period: "today" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(callerFor(cashier).sale.exportForPeriod({ period: "today" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Solo el propietario puede realizar esta acción.",
    });
  });
});
