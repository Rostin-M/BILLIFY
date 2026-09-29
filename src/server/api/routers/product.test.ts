import { describe, expect, it } from "vitest";

import { callerFor, createProduct, createShop, db } from "../../../../tests/integration/helpers";

const baseInput = { name: "Gaseosa 400ml", price: 2500, stock: 24 };

describe("product.create y update", () => {
  it("crea el producto con auditoría", async () => {
    const { owner } = await createShop();

    const { id, message } = await callerFor(owner).product.create({
      ...baseInput,
      cost: 1500,
      barcode: "7702004003508",
      category: "Bebidas",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    expect(message).toBe("Producto creado correctamente.");
    await expect(db.product.findUnique({ where: { id } })).resolves.toMatchObject({
      name: "Gaseosa 400ml",
      stock: 24,
      trackStock: true,
      cost: 1500,
      category: "Bebidas",
    });
    await expect(db.auditLog.count({ where: { action: "CREATE_PRODUCT", entityId: id } })).resolves.toBe(1);
  });

  it("los productos de monto libre o por peso no controlan stock", async () => {
    const { owner } = await createShop();
    const caller = callerFor(owner);

    const open = await caller.product.create({ ...baseInput, name: "Recarga", openPrice: true });
    const weighted = await caller.product.create({ ...baseInput, name: "Queso", soldByWeight: true });

    for (const { id } of [open, weighted]) {
      await expect(db.product.findUnique({ where: { id } })).resolves.toMatchObject({ trackStock: false, stock: 0 });
    }
    await expect(caller.product.create({ ...baseInput, openPrice: true, soldByWeight: true })).rejects.toThrow(
      /monto libre/,
    );
  });

  it("no permite códigos de barras repetidos en el negocio", async () => {
    const { owner, business } = await createShop();
    const other = await createShop();
    const existing = await createProduct(business.id, { barcode: "123" });

    await expect(callerFor(owner).product.create({ ...baseInput, barcode: "123" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    // Otro negocio puede usar el mismo código.
    await expect(callerFor(other.owner).product.create({ ...baseInput, barcode: "123" })).resolves.toBeTruthy();
    // Actualizar el mismo producto conservando su código es válido.
    await expect(
      callerFor(owner).product.update({ ...baseInput, id: existing.id, barcode: "123", price: 3000 }),
    ).resolves.toEqual({ message: "Producto actualizado correctamente." });
  });

  it("update rechaza productos de otro negocio y solo lo hace el dueño", async () => {
    const { owner, cashier, business } = await createShop();
    const other = await createShop();
    const product = await createProduct(business.id);

    await expect(callerFor(other.owner).product.update({ ...baseInput, id: product.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(callerFor(cashier).product.update({ ...baseInput, id: product.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await callerFor(owner).product.update({ ...baseInput, id: product.id, name: "Nuevo nombre" });
    await expect(db.product.findUnique({ where: { id: product.id } })).resolves.toMatchObject({ name: "Nuevo nombre" });
  });

  it("rechaza fechas de vencimiento pasadas", async () => {
    const { owner } = await createShop();
    await expect(
      callerFor(owner).product.create({ ...baseInput, expiresAt: new Date("2020-01-01") }),
    ).rejects.toThrow(/futuro/);
  });
});

describe("product.list, search y permissions", () => {
  it("oculta el costo a los cajeros", async () => {
    const { owner, cashier, business } = await createShop();
    await createProduct(business.id, { cost: 700 });

    await expect(callerFor(owner).product.list()).resolves.toEqual([expect.objectContaining({ cost: 700 })]);
    await expect(callerFor(cashier).product.list()).resolves.toEqual([expect.objectContaining({ cost: null })]);
  });

  it("search devuelve solo activos, primero los más vendidos", async () => {
    const { owner, business } = await createShop();
    const aguila = await createProduct(business.id, { name: "Águila", stock: 100 });
    const cafe = await createProduct(business.id, { name: "Café", stock: 100 });
    await createProduct(business.id, { name: "Aaa inactivo", isActive: false });
    await callerFor(owner).sale.create({ items: [{ productId: cafe.id, quantity: 5 }] });

    const results = await callerFor(owner).product.search();

    expect(results.map((p) => p.id)).toEqual([cafe.id, aguila.id]);
  });

  it("los cajeros editan precios solo si el negocio lo permite", async () => {
    const { owner, cashier, business } = await createShop();
    const product = await createProduct(business.id, { name: "Pan", price: 500 });

    await expect(callerFor(owner).product.permissions()).resolves.toEqual({ canEditPrices: true });
    await expect(callerFor(cashier).product.permissions()).resolves.toEqual({ canEditPrices: false });
    await expect(callerFor(cashier).product.updatePrice({ productId: product.id, price: 600 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    await db.business.update({ where: { id: business.id }, data: { cashiersCanEditPrices: true } });
    await expect(callerFor(cashier).product.updatePrice({ productId: product.id, price: 600 })).resolves.toEqual({
      message: 'Precio de "Pan" actualizado correctamente.',
    });
    await expect(db.auditLog.findFirst({ where: { action: "UPDATE_PRICE" } })).resolves.toMatchObject({
      detail: expect.objectContaining({ precioAnterior: 500, precioNuevo: 600 }) as unknown,
    });
    await expect(callerFor(owner).product.updatePrice({ productId: "no-existe", price: 1 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("product.adjustStock y consultas de movimientos", () => {
  it("ajusta el stock en ambos sentidos y deja trazabilidad", async () => {
    const { cashier, business } = await createShop();
    const product = await createProduct(business.id, { stock: 10 });
    const caller = callerFor(cashier);

    await expect(caller.product.adjustStock({ productId: product.id, quantity: 5, note: "Compra" })).resolves.toEqual({
      newStock: 15,
      message: "Stock incrementado en 5. Nuevo total: 15.",
    });
    await expect(caller.product.adjustStock({ productId: product.id, quantity: -3 })).resolves.toEqual({
      newStock: 12,
      message: "Stock reducido en 3. Nuevo total: 12.",
    });
    await expect(caller.product.adjustStock({ productId: product.id, quantity: -100 })).rejects.toThrow(
      /Stock insuficiente/,
    );

    const movements = await caller.product.listMovements({ productId: product.id });
    expect(movements.map((m) => m.quantity).sort((a, b) => a - b)).toEqual([-3, 5]);
    await expect(db.auditLog.count({ where: { action: "ADJUST_STOCK" } })).resolves.toBe(2);
  });

  it("lista las ventas completadas de un producto", async () => {
    const { owner, business } = await createShop();
    const product = await createProduct(business.id);
    const kept = await callerFor(owner).sale.create({ items: [{ productId: product.id, quantity: 1 }] });
    const voided = await callerFor(owner).sale.create({ items: [{ productId: product.id, quantity: 2 }] });
    await callerFor(owner).sale.void({ saleId: voided.id, reason: "Error" });

    const sales = await callerFor(owner).product.listProductSales({ productId: product.id });

    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({ quantity: 1 });
    expect(kept.id).toBeTruthy();
  });

  it("no expone movimientos ni ventas de productos ajenos", async () => {
    const { business } = await createShop();
    const other = await createShop();
    const product = await createProduct(business.id);

    await expect(callerFor(other.owner).product.listMovements({ productId: product.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(callerFor(other.owner).product.listProductSales({ productId: product.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("product.setActive", () => {
  it("activa y desactiva con auditoría", async () => {
    const { owner, business } = await createShop();
    const other = await createShop();
    const product = await createProduct(business.id);
    const caller = callerFor(owner);

    await expect(caller.product.setActive({ productId: product.id, isActive: false })).resolves.toEqual({
      message: "Producto desactivado correctamente.",
    });
    await expect(caller.product.setActive({ productId: product.id, isActive: true })).resolves.toEqual({
      message: "Producto activado correctamente.",
    });
    await expect(db.auditLog.count({ where: { entityId: product.id } })).resolves.toBe(2);
    await expect(
      callerFor(other.owner).product.setActive({ productId: product.id, isActive: false }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
