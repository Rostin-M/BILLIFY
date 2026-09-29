import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sendEmployeeWelcomeEmail } from "~/server/lib/email";
import { callerFor, createShop, db } from "../../../../tests/integration/helpers";

const employeeInput = { name: "Laura Gómez", document: "10203040", email: "  Laura@Tienda.CO " };

describe("user.createEmployee", () => {
  afterEach(() => vi.mocked(sendEmployeeWelcomeEmail).mockClear());

  it("genera una contraseña temporal que el empleado debe cambiar", async () => {
    const { owner, business } = await createShop();

    const result = await callerFor(owner).user.createEmployee(employeeInput);

    expect(result.message).toBe("Empleado creado correctamente.");
    expect(result.temporaryPassword).toMatch(/^[A-Za-z2-9]{12}$/);
    const employee = await db.user.findUniqueOrThrow({ where: { id: result.id } });
    expect(employee).toMatchObject({
      email: "laura@tienda.co",
      role: "CASHIER",
      businessId: business.id,
      mustChangePassword: true,
      isActive: true,
    });
    await expect(bcrypt.compare(result.temporaryPassword!, employee.passwordHash!)).resolves.toBe(true);
    expect(sendEmployeeWelcomeEmail).toHaveBeenCalledWith(
      "laura@tienda.co",
      "Laura Gómez",
      owner.name,
      business.name,
      "laura@tienda.co",
    );
    await expect(db.auditLog.count({ where: { action: "CREATE_EMPLOYEE" } })).resolves.toBe(1);
  });

  it("usa la contraseña indicada por el dueño sin devolverla", async () => {
    const { owner } = await createShop();

    const result = await callerFor(owner).user.createEmployee({ ...employeeInput, password: "ClaveSegura123" });

    expect(result.temporaryPassword).toBeNull();
    const employee = await db.user.findUniqueOrThrow({ where: { id: result.id } });
    await expect(bcrypt.compare("ClaveSegura123", employee.passwordHash!)).resolves.toBe(true);
  });

  it("rechaza correos repetidos y contraseñas débiles; solo el dueño crea empleados", async () => {
    const { owner, cashier } = await createShop();
    const caller = callerFor(owner);
    await caller.user.createEmployee(employeeInput);

    await expect(caller.user.createEmployee(employeeInput)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(caller.user.createEmployee({ ...employeeInput, email: "otro@x.co", password: "corta" })).rejects.toThrow(
      /mínimo 10 caracteres/,
    );
    await expect(callerFor(cashier).user.createEmployee(employeeInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("gestión de empleados", () => {
  it("lista solo los cajeros del negocio", async () => {
    const { owner, cashier } = await createShop();
    await createShop();

    await expect(callerFor(owner).user.list()).resolves.toEqual([expect.objectContaining({ id: cashier.id })]);
  });

  it("restablece la contraseña, cierra sesiones y registra el evento", async () => {
    const { owner, cashier } = await createShop();
    await db.user.update({ where: { id: cashier.id }, data: { failedLogins: 4, lockedUntil: new Date() } });

    const result = await callerFor(owner).user.resetEmployeePassword({ employeeId: cashier.id });

    const updated = await db.user.findUniqueOrThrow({ where: { id: cashier.id } });
    expect(updated).toMatchObject({ mustChangePassword: true, sessionVersion: 1, failedLogins: 0, lockedUntil: null });
    await expect(bcrypt.compare(result.temporaryPassword, updated.passwordHash!)).resolves.toBe(true);
    await expect(db.authEvent.count({ where: { type: "SESSION_REVOKED", userId: cashier.id } })).resolves.toBe(1);
    // La sesión anterior del cajero deja de ser válida.
    await expect(callerFor(cashier).product.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("activa, desactiva y cambia el permiso de caja", async () => {
    const { owner, cashier } = await createShop();
    const caller = callerFor(owner);

    await expect(caller.user.setActive({ employeeId: cashier.id, isActive: false })).resolves.toEqual({
      message: "Empleado desactivado correctamente.",
    });
    await expect(caller.user.setActive({ employeeId: cashier.id, isActive: true })).resolves.toEqual({
      message: "Empleado activado correctamente.",
    });
    await expect(caller.user.setCashManagement({ employeeId: cashier.id, canManageCash: false })).resolves.toEqual({
      message: "Permiso de caja desactivado.",
    });
    await expect(caller.user.setCashManagement({ employeeId: cashier.id, canManageCash: true })).resolves.toEqual({
      message: "Permiso de caja activado.",
    });
    await expect(db.user.findUniqueOrThrow({ where: { id: cashier.id } })).resolves.toMatchObject({
      isActive: true,
      canManageCash: true,
      sessionVersion: 2,
    });
    await expect(db.authEvent.count({ where: { type: "SESSION_REVOKED" } })).resolves.toBe(1);
  });

  it("no gestiona empleados de otro negocio ni al propio dueño", async () => {
    const { owner } = await createShop();
    const other = await createShop();
    const caller = callerFor(owner);

    for (const employeeId of [other.cashier.id, owner.id]) {
      await expect(caller.user.resetEmployeePassword({ employeeId })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(caller.user.setActive({ employeeId, isActive: false })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(caller.user.setCashManagement({ employeeId, canManageCash: false })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    }
  });
});
