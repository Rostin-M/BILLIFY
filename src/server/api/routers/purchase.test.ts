import { beforeEach, describe, expect, it } from "vitest";

import {
  callerFor,
  createProduct,
  createShop,
  createUser,
  db,
  newKey,
} from "../../../../tests/integration/helpers";

type Shop = Awaited<ReturnType<typeof createShop>>;

let shop: Shop;
let caller: ReturnType<typeof callerFor>;

beforeEach(async () => {
  shop = await createShop();
  caller = callerFor(shop.cashier);
  await caller.cashRegister.open({ openingBalance: 100000 });
});

async function stockOf(productId: string) {
  return (await db.product.findUniqueOrThrow({ where: { id: productId } })).stock;
}

async function balanceOf() {
  const movements = await db.cashMovement.findMany({ select: { type: true, amount: true } });
  return movements.reduce((s, m) => s + (m.type === "EXPENSE" ? -m.amount : m.amount), 0);
}

describe("proveedores", () => {
  it("crea proveedores sin duplicar nombres y reactiva los archivados", async () => {
    const created = await caller.supplier.create({ name: "Fritos Natalia", phone: "3001234567" });

    await expect(caller.supplier.create({ name: "fritos natalia" })).rejects.toMatchObject({ code: "CONFLICT" });
    await callerFor(shop.owner).supplier.setActive({ id: created.id, isActive: false });
    await expect(caller.supplier.list()).resolves.toEqual([]);

    const again = await caller.supplier.create({ name: "Fritos Natalia" });
    expect(again.id).toBe(created.id);
    await expect(caller.supplier.list()).resolves.toMatchObject([{ name: "Fritos Natalia", balance: 0, purchaseCount: 0 }]);
  });

  it("solo el dueño edita y archiva", async () => {
    const supplier = await caller.supplier.create({ name: "Gaseosas" });
    await expect(caller.supplier.update({ id: supplier.id, name: "Postobón" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(shop.owner).supplier.update({ id: supplier.id, name: "Postobón" })).resolves.toEqual({
      message: "Proveedor actualizado.",
    });
  });

  it("una salida de caja puede quedar a nombre del proveedor, con nota", async () => {
    const supplier = await caller.supplier.create({ name: "Hielo El Polo" });

    await caller.cashRegister.addMovement({
      type: "EXPENSE",
      amount: 8000,
      description: "Bolsas de hielo",
      note: "Llegó tarde",
      supplierId: supplier.id,
    });

    const history = await caller.supplier.history({ supplierId: supplier.id });
    expect(history.movements).toMatchObject([{ amount: 8000, description: "Bolsas de hielo", note: "Llegó tarde" }]);
    expect(await balanceOf()).toBe(92000);
  });
});

describe("compras", () => {
  it("suma al inventario, guarda el costo y paga en efectivo desde la caja", async () => {
    const supplier = await caller.supplier.create({ name: "Fritos Natalia" });
    const papas = await createProduct(shop.business.id, { stock: 2, cost: 1000 });
    const libre = await createProduct(shop.business.id, { stock: 0, openPrice: true });
    const input = {
      supplierId: supplier.id,
      items: [{ productId: papas.id, quantity: 24, unitCost: 1200 }, { productId: libre.id, quantity: 1, unitCost: 5000 }],
      paidNow: 33800,
      paymentMethod: "CASH" as const,
      idempotencyKey: newKey(),
    };

    const result = await caller.purchase.create(input);
    const retry = await caller.purchase.create(input);

    expect(retry.id).toBe(result.id);
    expect(result).toMatchObject({ total: 33800, balance: 0, message: "Compra registrada y pagada." });
    expect(await stockOf(papas.id)).toBe(26);
    expect(await stockOf(libre.id)).toBe(0);
    await expect(db.product.findUniqueOrThrow({ where: { id: papas.id } })).resolves.toMatchObject({ cost: 1200 });
    expect(await balanceOf()).toBe(100000 - 33800);
    await expect(db.cashMovement.findFirst({ where: { type: "EXPENSE" } })).resolves.toMatchObject({
      description: "Compra a Fritos Natalia",
      supplierId: supplier.id,
    });
    await expect(db.inventoryMovement.count({ where: { reason: "PURCHASE" } })).resolves.toBe(1);
  });

  it("a crédito: queda el saldo pendiente con fecha y se abona después", async () => {
    const supplier = await caller.supplier.create({ name: "Distribuidora" });
    const product = await createProduct(shop.business.id, { stock: 0 });

    const purchase = await caller.purchase.create({
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: 10, unitCost: 5000 }],
      paidNow: 20000,
      paymentMethod: "TRANSFER",
      dueDate: "2026-11-05",
    });

    expect(purchase.balance).toBe(30000);
    expect(await balanceOf()).toBe(100000);
    await expect(caller.purchase.payablesSummary()).resolves.toMatchObject({ total: 30000, count: 1 });
    await expect(caller.supplier.list()).resolves.toMatchObject([{ balance: 30000, purchaseCount: 1 }]);
    const [pending] = await caller.purchase.list({ pendingOnly: true });
    expect(pending).toMatchObject({ id: purchase.id, paid: 20000, balance: 30000 });
    expect(pending!.dueDate).not.toBeNull();

    await expect(caller.purchase.addPayment({ purchaseId: purchase.id, amount: 40000 })).rejects.toThrow(
      "El pago no puede ser mayor a lo que se debe",
    );
    await expect(caller.purchase.addPayment({ purchaseId: purchase.id, amount: 10000 })).resolves.toMatchObject({ balance: 20000 });
    expect(await balanceOf()).toBe(90000);
    await caller.purchase.addPayment({ purchaseId: purchase.id, amount: 20000, paymentMethod: "TRANSFER" });

    await expect(caller.purchase.list({ pendingOnly: true })).resolves.toEqual([]);
    await expect(caller.purchase.addPayment({ purchaseId: purchase.id, amount: 1 })).rejects.toThrow("Esta compra ya está pagada.");
    await expect(db.auditLog.count({ where: { action: "CREATE_SUPPLIER_PAYMENT" } })).resolves.toBe(2);
  });

  it("valida total, saldo sin proveedor y pago en efectivo mayor a la caja", async () => {
    const product = await createProduct(shop.business.id);

    await expect(caller.purchase.create({ items: [], paidNow: 0 })).rejects.toThrow("Agrega los productos que llegaron");
    await expect(
      caller.purchase.create({ items: [{ productId: product.id, quantity: 1, unitCost: 1000 }], paidNow: 500 }),
    ).rejects.toThrow("elige el proveedor");
    await expect(
      caller.purchase.create({ items: [{ productId: product.id, quantity: 1, unitCost: 1000 }], paidNow: 2000 }),
    ).rejects.toThrow("El pago no puede ser mayor al total");
    await expect(caller.purchase.create({ items: [], amount: 150000, paidNow: 150000 })).rejects.toThrow("La salida es mayor al efectivo");

    await expect(db.purchase.count()).resolves.toBe(0);
    expect(await stockOf(product.id)).toBe(10);
  });

  it("sin productos del catálogo, registra el total; el cajero sin permiso de caja no paga en efectivo", async () => {
    const noCash = await createUser({ businessId: shop.business.id, role: "CASHIER", canManageCash: false });

    await expect(
      callerFor(noCash).purchase.create({ items: [], amount: 20000, paidNow: 20000, paymentMethod: "CASH" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      callerFor(noCash).purchase.create({ items: [], amount: 20000, paidNow: 20000, paymentMethod: "TRANSFER" }),
    ).resolves.toMatchObject({ total: 20000, balance: 0 });
  });

  it("repite la última compra al proveedor", async () => {
    const supplier = await caller.supplier.create({ name: "Panadería" });
    const pan = await createProduct(shop.business.id, { name: "Pan" });
    await expect(caller.purchase.lastForSupplier({ supplierId: supplier.id })).resolves.toBeNull();

    await caller.purchase.create({ supplierId: supplier.id, items: [{ productId: pan.id, quantity: 30, unitCost: 400 }], paidNow: 12000 });

    await expect(caller.purchase.lastForSupplier({ supplierId: supplier.id })).resolves.toMatchObject({
      items: [{ productId: pan.id, name: "Pan", quantity: 30, unitCost: 400 }],
    });
  });

  it("no ve compras ni proveedores de otro negocio", async () => {
    const other = await createShop();
    const foreign = await callerFor(other.owner).supplier.create({ name: "Ajeno" });

    await expect(caller.supplier.history({ supplierId: foreign.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.purchase.create({ supplierId: foreign.id, items: [], amount: 1000, paidNow: 0 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
