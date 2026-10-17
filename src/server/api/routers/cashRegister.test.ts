import { describe, expect, it } from "vitest";

import {
  callerFor,
  createCustomer,
  createProduct,
  createShop,
  createUser,
  db,
  newKey,
} from "../../../../tests/integration/helpers";

async function openRegister(user: { id: string }, openingBalance = 50000) {
  return callerFor(user).cashRegister.open({ openingBalance });
}

describe("cashRegister.open", () => {
  it("abre la caja con su movimiento de fondo inicial y auditoría", async () => {
    const { cashier } = await createShop();

    const result = await openRegister(cashier, 80000);

    expect(result.message).toBe("Caja abierta correctamente.");
    await expect(db.cashRegister.findUnique({ where: { id: result.id } })).resolves.toMatchObject({
      status: "OPEN",
      openingBalance: 80000,
    });
    await expect(db.cashMovement.findFirst({ where: { cashRegisterId: result.id } })).resolves.toMatchObject({
      type: "OPENING",
      amount: 80000,
    });
    await expect(db.auditLog.count({ where: { action: "OPEN_CASH_REGISTER" } })).resolves.toBe(1);
  });

  it("no permite dos cajas del mismo usuario ni superar el máximo del negocio", async () => {
    const { owner, cashier } = await createShop();
    await openRegister(cashier);

    await expect(openRegister(cashier)).rejects.toThrow("Ya tienes una caja abierta.");
    await expect(openRegister(owner)).rejects.toThrow("Se alcanzó el límite de 1 caja abiertas simultáneamente.");
  });

  it("permite varias cajas si el negocio lo configura", async () => {
    const { business, owner, cashier } = await createShop({ maxCashRegisters: 2 });
    const extra = await createUser({ businessId: business.id, role: "CASHIER" });
    await openRegister(owner);
    await openRegister(cashier);

    await expect(openRegister(extra)).rejects.toThrow("Se alcanzó el límite de 2 cajas abiertas simultáneamente.");
  });

  it("exige el permiso de gestionar caja a los cajeros", async () => {
    const { business } = await createShop();
    const noCash = await createUser({ businessId: business.id, role: "CASHIER", canManageCash: false });

    await expect(openRegister(noCash)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(noCash).cashRegister.getActive()).resolves.toEqual({ noCashAccess: true });
  });
});

describe("cashRegister.getActive y listActive", () => {
  it("calcula el saldo con ventas en efectivo y movimientos manuales", async () => {
    const { business, owner, cashier } = await createShop({ cashBlindClose: false });
    const product = await createProduct(business.id, { price: 10000, stock: 100 });
    await openRegister(cashier, 50000);
    const caller = callerFor(cashier);
    await caller.sale.create({ items: [{ productId: product.id, quantity: 2 }] });
    await caller.sale.create({ items: [{ productId: product.id, quantity: 1 }], paymentMethod: "CARD" });
    await caller.cashRegister.addMovement({ type: "INCOME", amount: 5000, description: "Cambio" });
    await caller.cashRegister.addMovement({ type: "EXPENSE", amount: 3000, description: "Hielo" });

    const active = await caller.cashRegister.getActive();

    expect(active).toMatchObject({
      openingBalance: 50000,
      cashSalesTotal: 20000,
      cashSalesCount: 1,
      nonCashSales: [{ paymentMethod: "CARD", total: 10000, count: 1 }],
      manualIncome: 5000,
      manualExpense: 3000,
      currentBalance: 72000,
      isOwnRegister: true,
      closeSettings: { blind: false, byDenomination: false },
    });

    // El dueño sin caja propia ve la del cajero y la lista como caja de otro usuario.
    await expect(callerFor(owner).cashRegister.getActive()).resolves.toMatchObject({ isOwnRegister: false });
    await expect(callerFor(owner).cashRegister.listActive()).resolves.toEqual([
      expect.objectContaining({ manualIncome: 5000, manualExpense: 3000, movementsBalance: 52000 }),
    ]);
  });

  it("cierre ciego: el cajero no recibe el efectivo esperado; el dueño sí", async () => {
    const { business, owner, cashier } = await createShop();
    const product = await createProduct(business.id, { price: 10000, stock: 10 });
    await openRegister(cashier, 50000);
    await callerFor(cashier).sale.create({ items: [{ productId: product.id, quantity: 1 }] });

    await expect(callerFor(cashier).cashRegister.getActive()).resolves.toMatchObject({
      cashSalesTotal: null,
      cashPaymentsTotal: null,
      currentBalance: null,
      cashSalesCount: 1,
      closeSettings: { blind: true },
    });
    await expect(callerFor(owner).cashRegister.getActive()).resolves.toMatchObject({
      cashSalesTotal: 10000,
      currentBalance: 60000,
      closeSettings: { blind: false },
    });
  });

  it("los abonos de fiado en efectivo suman al saldo; los demás quedan aparte", async () => {
    const { business, owner, cashier } = await createShop({ cashBlindClose: false });
    const product = await createProduct(business.id, { price: 10000, stock: 10 });
    const customer = await createCustomer(business.id, { name: "Rosa" });
    await openRegister(cashier, 50000);
    const caller = callerFor(cashier);
    await caller.sale.create({ items: [{ productId: product.id, quantity: 3 }], paymentMethod: "CREDIT", customerId: customer.id });
    await caller.customer.addPayment({ customerId: customer.id, amount: 7000 });
    await caller.customer.addPayment({ customerId: customer.id, amount: 5000, paymentMethod: "TRANSFER" });

    await expect(caller.cashRegister.getActive()).resolves.toMatchObject({
      cashSalesTotal: 0,
      cashPaymentsTotal: 7000,
      cashPaymentsCount: 1,
      nonCashPayments: [{ paymentMethod: "TRANSFER", total: 5000, count: 1 }],
      currentBalance: 57000,
    });
    const summary = await callerFor(owner).dashboard.summary({});
    expect(summary.cashRegister.currentBalance).toBe(57000);
    await expect(caller.cashRegister.close({ countedCash: 57000 })).resolves.toMatchObject({
      closingBalance: 57000,
      difference: 0,
    });
  });

  it("devuelve null si no hay caja abierta", async () => {
    const { owner } = await createShop();
    await expect(callerFor(owner).cashRegister.getActive()).resolves.toBeNull();
  });
});

describe("cashRegister.addMovement", () => {
  it("impide salidas mayores al saldo disponible", async () => {
    const { cashier } = await createShop({ cashBlindClose: false });
    await openRegister(cashier, 10000);

    await expect(
      callerFor(cashier).cashRegister.addMovement({ type: "EXPENSE", amount: 20000, description: "Proveedor" }),
    ).rejects.toThrow(/Saldo insuficiente/);
  });

  it("en cierre ciego el rechazo de la salida no revela el saldo", async () => {
    const { cashier } = await createShop();
    await openRegister(cashier, 10000);

    const error = await callerFor(cashier)
      .cashRegister.addMovement({ type: "EXPENSE", amount: 20000, description: "Proveedor" })
      .catch((e: unknown) => e as Error);
    expect(error.message).toMatch(/mayor al efectivo que debería haber/);
    expect(error.message).not.toMatch(/10\.000/);
  });

  it("es idempotente con la misma clave", async () => {
    const { cashier } = await createShop();
    await openRegister(cashier);
    const input = { type: "INCOME" as const, amount: 1000, description: "Base", idempotencyKey: newKey() };

    await expect(callerFor(cashier).cashRegister.addMovement(input)).resolves.toEqual({
      message: "Entrada registrada correctamente.",
    });
    await callerFor(cashier).cashRegister.addMovement(input);

    await expect(db.cashMovement.count({ where: { type: "INCOME" } })).resolves.toBe(1);
  });

  it("exige caja abierta y permiso de caja", async () => {
    const { business, owner, cashier } = await createShop();
    const noCash = await createUser({ businessId: business.id, role: "CASHIER", canManageCash: false });
    const movement = { type: "INCOME" as const, amount: 1000, description: "Base" };

    await expect(callerFor(owner).cashRegister.addMovement(movement)).rejects.toThrow(
      "No hay caja abierta. Abre la caja primero.",
    );
    await expect(callerFor(cashier).cashRegister.addMovement(movement)).rejects.toThrow(
      "No tienes una caja abierta. Abre tu caja para registrar movimientos.",
    );
    await expect(callerFor(noCash).cashRegister.addMovement(movement)).rejects.toThrow(
      "No tienes permisos para registrar movimientos en caja.",
    );
  });

  it("el dueño registra movimientos en la caja activa del negocio", async () => {
    const { owner, cashier } = await createShop();
    const { id } = await openRegister(cashier);

    await callerFor(owner).cashRegister.addMovement({ type: "INCOME", amount: 2000, description: "Aporte" });

    await expect(db.cashMovement.count({ where: { cashRegisterId: id, type: "INCOME" } })).resolves.toBe(1);
  });
});

describe("cashRegister.close", () => {
  it("cierra con el saldo calculado y aparece en el historial", async () => {
    const { business, owner, cashier } = await createShop();
    const product = await createProduct(business.id, { price: 5000 });
    await openRegister(cashier, 20000);
    await callerFor(cashier).sale.create({ items: [{ productId: product.id, quantity: 2 }] });

    const result = await callerFor(cashier).cashRegister.close({ countedCash: 30000, closingNote: "Todo cuadra" });

    expect(result).toEqual({
      closingBalance: 30000,
      countedCash: 30000,
      difference: 0,
      message: "Caja cerrada correctamente.",
    });
    const history = await callerFor(owner).cashRegister.listHistory();
    expect(history).toEqual([
      expect.objectContaining({ closingBalance: 30000, countedCash: 30000, closingNote: "Todo cuadra" }),
    ]);
    await expect(callerFor(cashier).cashRegister.close({ countedCash: 0 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("el dueño cierra la caja de otro por id; el cajero no puede", async () => {
    const { owner, cashier } = await createShop();
    const { id } = await openRegister(cashier);

    await expect(callerFor(cashier).cashRegister.close({ registerId: id, countedCash: 50000 })).rejects.toThrow(
      "Solo el propietario puede cerrar la caja de otro empleado.",
    );
    await expect(callerFor(owner).cashRegister.close({ registerId: id, countedCash: 50000 })).resolves.toMatchObject({
      closingBalance: 50000,
    });
  });

  it("el dueño sin caja propia cierra la activa del negocio", async () => {
    const { owner, cashier } = await createShop();
    await openRegister(cashier);

    await callerFor(owner).cashRegister.close({ countedCash: 50000 });

    await expect(db.cashRegister.count({ where: { status: "OPEN" } })).resolves.toBe(0);
  });

  it("no cierra si hay mesas con cuentas pendientes", async () => {
    const { business, cashier } = await createShop();
    await openRegister(cashier);
    const session = await db.tableSession.create({ data: { businessId: business.id, userId: cashier.id, name: "Mesa 1" } });
    const guest = await db.tableGuest.create({ data: { tableSessionId: session.id, name: "Ana" } });
    await db.tableOrder.create({
      data: { tableGuestId: guest.id, tableSessionId: session.id, subtotal: 1000, total: 1000 },
    });

    await expect(callerFor(cashier).cashRegister.close({ countedCash: 50000 })).rejects.toThrow(
      "Hay 1 mesa con cuentas pendientes. Ciérralas o cóbralas antes de cerrar la caja.",
    );
    await expect(callerFor(cashier).cashRegister.countCash({ countedCash: 50000 })).rejects.toThrow(
      "Hay 1 mesa con cuentas pendientes.",
    );
  });

  it("si lo contado no cuadra exige el motivo y guarda la diferencia", async () => {
    const { cashier } = await createShop();
    const { id } = await openRegister(cashier, 50000);

    await expect(callerFor(cashier).cashRegister.close({ countedCash: 46500 })).rejects.toThrow(
      /Faltan \$\s?3\.500\. Escribe el motivo para cerrar la caja\./,
    );
    await expect(callerFor(cashier).cashRegister.close({ countedCash: 51000, closingNote: "   " })).rejects.toThrow(
      /Sobran \$\s?1\.000/,
    );
    await expect(db.cashRegister.count({ where: { status: "OPEN" } })).resolves.toBe(1);

    await expect(
      callerFor(cashier).cashRegister.close({ countedCash: 46500, closingNote: "Vuelto mal dado" }),
    ).resolves.toMatchObject({ closingBalance: 50000, countedCash: 46500, difference: -3500 });
    await expect(db.cashRegister.findUnique({ where: { id } })).resolves.toMatchObject({
      countedCash: 46500,
      closingNote: "Vuelto mal dado",
    });
    const audit = await db.auditLog.findFirst({ where: { action: "CLOSE_CASH_REGISTER" } });
    expect(audit?.detail).toMatchObject({ countedCash: 46500, difference: -3500 });
  });

  it("el conteo previo devuelve lo esperado y la diferencia, y queda en la auditoría", async () => {
    const { cashier } = await createShop();
    await openRegister(cashier, 20000);

    await expect(callerFor(cashier).cashRegister.countCash({ countedCash: 19000 })).resolves.toEqual({
      expected: 20000,
      countedCash: 19000,
      difference: -1000,
    });
    await callerFor(cashier).cashRegister.countCash({ countedCash: 20000 });

    await expect(db.auditLog.count({ where: { action: "CASH_COUNT" } })).resolves.toBe(2);
    await expect(db.cashRegister.count({ where: { status: "OPEN" } })).resolves.toBe(1);
  });

  it("con arqueo activo exige billetes y monedas que sumen el total", async () => {
    const { cashier } = await createShop({ cashCountByDenomination: true });
    const { id } = await openRegister(cashier, 52600);

    await expect(callerFor(cashier).cashRegister.close({ countedCash: 52600 })).rejects.toThrow(
      "Cuenta los billetes y monedas para cerrar la caja.",
    );
    await expect(
      callerFor(cashier).cashRegister.close({ countedCash: 52600, countedBreakdown: { "50000": 1, "2000": 1 } }),
    ).rejects.toThrow("El total no coincide con los billetes y monedas contados.");
    await expect(
      callerFor(cashier).cashRegister.close({ countedCash: 52600, countedBreakdown: { "3000": 1 } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await callerFor(cashier).cashRegister.close({
      countedCash: 52600,
      countedBreakdown: { "50000": 1, "2000": 1, "500": 1, "100": 1, "20000": 0 },
    });
    await expect(db.cashRegister.findUnique({ where: { id } })).resolves.toMatchObject({
      countedCash: 52600,
      countedBreakdown: { "50000": 1, "2000": 1, "500": 1, "100": 1 },
    });
  });
});

describe("cashRegister.getReport", () => {
  it("incluye ventas anuladas, fiados y abonos de la jornada", async () => {
    const { business, owner, cashier } = await createShop();
    const product = await createProduct(business.id, { price: 4000, stock: 50 });
    const customer = await createCustomer(business.id, { name: "Doña Rosa" });
    const { id } = await openRegister(cashier, 10000);
    const caller = callerFor(cashier);
    const voided = await caller.sale.create({ items: [{ productId: product.id, quantity: 1 }] });
    await caller.sale.create({ items: [{ productId: product.id, quantity: 1 }], paymentMethod: "CREDIT", customerId: customer.id });
    await callerFor(owner).sale.void({ saleId: voided.id, reason: "Error" });
    await callerFor(cashier).customer.addPayment({ customerId: customer.id, amount: 2000 });

    const report = await callerFor(owner).cashRegister.getReport({ id });

    // El abono en efectivo entró a esta caja: suma al total (10.000 de fondo + 2.000 del abono).
    expect(report).toMatchObject({ status: "OPEN", cashSalesTotal: 0, cashPaymentsTotal: 2000, totalBalance: 12000 });
    expect(report.voidedSales).toEqual([
      expect.objectContaining({ id: voided.id, voidReason: "Error", voidedByName: owner.name, createdByName: cashier.name }),
    ]);
    expect(report.creditSales).toEqual([expect.objectContaining({ customer: { name: "Doña Rosa" } })]);
    expect(report.payments).toEqual([expect.objectContaining({ amount: 2000 })]);
  });

  it("en cierre ciego el cajero ve el reporte solo después de cerrar", async () => {
    const { cashier } = await createShop();
    const { id } = await openRegister(cashier, 10000);

    await expect(callerFor(cashier).cashRegister.getReport({ id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await callerFor(cashier).cashRegister.close({ countedCash: 10000 });
    await expect(callerFor(cashier).cashRegister.getReport({ id })).resolves.toMatchObject({
      status: "CLOSED",
      countedCash: 10000,
    });
  });

  it("el cajero solo ve reportes de sus propias cajas", async () => {
    const { business, owner, cashier } = await createShop({ maxCashRegisters: 2 });
    const other = await createUser({ businessId: business.id, role: "CASHIER" });
    const { id } = await openRegister(owner);
    await openRegister(other);

    await expect(callerFor(cashier).cashRegister.getReport({ id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
