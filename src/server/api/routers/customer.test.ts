import { describe, expect, it } from "vitest";

import {
  callerFor,
  createCustomer,
  createProduct,
  createShop,
  db,
  newKey,
} from "../../../../tests/integration/helpers";

/** Registra una venta a crédito por `total` para el cliente. */
async function creditSale(user: { id: string }, productId: string, customerId: string, quantity = 1) {
  return callerFor(user).sale.create({
    items: [{ productId, quantity }],
    paymentMethod: "CREDIT",
    customerId,
  });
}

describe("customer.create, update y setActive", () => {
  it("el cajero crea clientes al vuelo y el correo vacío se guarda como null", async () => {
    const { cashier } = await createShop();

    const result = await callerFor(cashier).customer.create({ name: "  Juan Pérez ", email: "", phone: "3001234567" });

    expect(result).toMatchObject({ name: "Juan Pérez", message: "Cliente creado correctamente." });
    await expect(db.customer.findUnique({ where: { id: result.id } })).resolves.toMatchObject({
      email: null,
      phone: "3001234567",
    });
    await expect(db.auditLog.count({ where: { action: "CREATE_CUSTOMER" } })).resolves.toBe(1);
  });

  it("valida el correo", async () => {
    const { cashier } = await createShop();
    await expect(callerFor(cashier).customer.create({ name: "Ana", email: "no-es-correo" })).rejects.toThrow(
      /correo no es válido/,
    );
  });

  it("solo el dueño edita y activa/desactiva, y solo clientes propios", async () => {
    const { owner, cashier, business } = await createShop();
    const other = await createShop();
    const customer = await createCustomer(business.id);
    const update = { id: customer.id, name: "Nombre Nuevo", email: "nuevo@correo.com" };

    await expect(callerFor(cashier).customer.update(update)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(other.owner).customer.update(update)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(callerFor(owner).customer.update(update)).resolves.toEqual({
      message: "Cliente actualizado correctamente.",
    });
    await expect(callerFor(owner).customer.setActive({ customerId: customer.id, isActive: false })).resolves.toEqual({
      message: "Cliente desactivado correctamente.",
    });
    await expect(callerFor(owner).customer.setActive({ customerId: customer.id, isActive: true })).resolves.toEqual({
      message: "Cliente activado correctamente.",
    });
    await expect(
      callerFor(other.owner).customer.setActive({ customerId: customer.id, isActive: false }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(db.customer.findUnique({ where: { id: customer.id } })).resolves.toMatchObject({
      name: "Nombre Nuevo",
      email: "nuevo@correo.com",
      isActive: true,
    });
  });
});

describe("customer.search y list", () => {
  it("busca por nombre, documento o teléfono entre los activos", async () => {
    const { cashier, business } = await createShop();
    await createCustomer(business.id, { name: "María López", document: "1010", phone: "3110000000" });
    await createCustomer(business.id, { name: "Mario Inactivo", isActive: false });
    await createCustomer(business.id, { name: "Pedro", document: "2020" });
    const search = (q: string) => callerFor(cashier).customer.search({ q });

    await expect(search("mar")).resolves.toEqual([expect.objectContaining({ name: "María López" })]);
    await expect(search("2020")).resolves.toEqual([expect.objectContaining({ name: "Pedro" })]);
    await expect(search("311")).resolves.toHaveLength(1);
    await expect(search("")).resolves.toHaveLength(2);
  });

  it("list calcula la deuda de cada cliente (solo dueño)", async () => {
    const { owner, cashier, business } = await createShop();
    const product = await createProduct(business.id, { price: 10000, stock: 100 });
    const debtor = await createCustomer(business.id, { name: "Deudor" });
    await createCustomer(business.id, { name: "Al día" });
    await creditSale(owner, product.id, debtor.id, 3);
    await callerFor(owner).customer.addPayment({ customerId: debtor.id, amount: 5000 });

    const list = await callerFor(owner).customer.list();

    expect(list.find((c) => c.name === "Deudor")).toMatchObject({ debt: 25000 });
    expect(list.find((c) => c.name === "Al día")).toMatchObject({ debt: 0 });
    await expect(callerFor(cashier).customer.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("customer.addPayment, listDebtors e history", () => {
  it("registra abonos hasta saldar la deuda", async () => {
    const { cashier, business } = await createShop();
    const product = await createProduct(business.id, { price: 10000, stock: 100 });
    const customer = await createCustomer(business.id, { name: "Rosa" });
    await creditSale(cashier, product.id, customer.id, 2);
    const caller = callerFor(cashier);

    await expect(caller.customer.listDebtors()).resolves.toEqual([
      expect.objectContaining({ id: customer.id, debt: 20000 }),
    ]);
    await expect(caller.customer.addPayment({ customerId: customer.id, amount: 5000, note: "Abono" })).resolves.toEqual({
      remainingDebt: 15000,
      message: "Abono registrado. Deuda restante: 15000.",
    });
    await expect(caller.customer.addPayment({ customerId: customer.id, amount: 20000 })).rejects.toThrow(
      "El abono no puede ser mayor a la deuda actual (15000).",
    );
    await expect(caller.customer.addPayment({ customerId: customer.id, amount: 15000 })).resolves.toMatchObject({
      message: "Deuda de Rosa saldada por completo.",
    });
    await expect(caller.customer.addPayment({ customerId: customer.id, amount: 1 })).rejects.toThrow(
      "Este cliente no tiene deuda pendiente.",
    );
    await expect(caller.customer.listDebtors()).resolves.toEqual([]);

    const history = await caller.customer.history({ customerId: customer.id });
    expect(history).toMatchObject({ totalSpent: 20000, creditTotal: 20000, paidTotal: 20000, debt: 0 });
    expect(history.payments).toHaveLength(2);
  });

  it("es idempotente con la misma clave", async () => {
    const { cashier, business } = await createShop();
    const product = await createProduct(business.id, { price: 10000 });
    const customer = await createCustomer(business.id, { name: "Luis" });
    await creditSale(cashier, product.id, customer.id);
    const input = { customerId: customer.id, amount: 4000, idempotencyKey: newKey() };

    await callerFor(cashier).customer.addPayment(input);
    await expect(callerFor(cashier).customer.addPayment(input)).resolves.toEqual({
      remainingDebt: 6000,
      message: "Abono registrado. Deuda restante: 6000.",
    });
    await expect(db.customerPayment.count()).resolves.toBe(1);
  });

  it("no opera sobre clientes de otro negocio", async () => {
    const { business } = await createShop();
    const other = await createShop();
    const customer = await createCustomer(business.id);

    await expect(
      callerFor(other.cashier).customer.addPayment({ customerId: customer.id, amount: 1000 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(callerFor(other.cashier).customer.history({ customerId: customer.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
