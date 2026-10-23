import { beforeEach, describe, expect, it } from "vitest";

import {
  callerFor,
  createCustomer,
  createProduct,
  createShop,
  db,
  newKey,
} from "../../../../tests/integration/helpers";

type Shop = Awaited<ReturnType<typeof createShop>>;

let shop: Shop;
let caller: ReturnType<typeof callerFor>;

/** Negocio con caja abierta (requisito para abrir mesas). */
beforeEach(async () => {
  shop = await createShop({ autoTax: true, taxes: [{ name: "INC", rate: 8, enabled: true }] });
  caller = callerFor(shop.cashier);
  await caller.cashRegister.open({ openingBalance: 0 });
});

async function openTable(name = "Mesa 1") {
  return caller.tableSession.create({ name });
}

async function stockOf(productId: string) {
  return (await db.product.findUniqueOrThrow({ where: { id: productId } })).stock;
}

describe("apertura de mesas y clientes", () => {
  it("exige una caja abierta en el negocio", async () => {
    const other = await createShop();
    await expect(callerFor(other.owner).tableSession.create({ name: "Mesa 1" })).rejects.toThrow(
      "Debes tener una caja abierta para abrir una mesa.",
    );
  });

  it("sugiere el menor número de mesa libre", async () => {
    await expect(caller.tableSession.suggestName()).resolves.toBe("Mesa 1");
    await openTable("Mesa 1");
    await openTable("Mesa 3");
    await openTable("Terraza");
    await expect(caller.tableSession.suggestName()).resolves.toBe("Mesa 2");
  });

  it("abre la mesa con sus clientes en orden; los que no tienen nombre quedan como Cliente N", async () => {
    const table = await caller.tableSession.create({ name: "Mesa 1", guests: ["", "  Juan  ", ""] });

    expect(table.guests.map((g) => g.name)).toEqual(["Cliente 1", "Juan", "Cliente 3"]);
    const [listed] = await caller.tableSession.listActive();
    expect(listed!.guests.map((g) => g.id)).toEqual(table.guests.map((g) => g.id));

    // El siguiente que se agregue sigue la numeración.
    await expect(caller.tableSession.addGuest({ sessionId: table.id })).resolves.toMatchObject({ name: "Cliente 4" });
  });

  it("al abrir, un comensal puede identificarse con un cliente guardado", async () => {
    const registered = await createCustomer(shop.business.id, { name: "Natalia Ruiz" });
    const outsider = await createCustomer((await createShop()).business.id);

    const table = await caller.tableSession.create({
      name: "Mesa 1",
      guests: [{ name: "", customerId: registered.id }, { name: "El del sombrero" }],
    });

    expect(table.guests.map((g) => g.name)).toEqual(["Natalia Ruiz", "El del sombrero"]);
    const guests = await db.tableGuest.findMany({ where: { tableSessionId: table.id }, orderBy: { addedAt: "asc" } });
    expect(guests.map((g) => g.customerId)).toEqual([registered.id, null]);
    await expect(
      caller.tableSession.create({ name: "Mesa 2", guests: [{ name: "X", customerId: outsider.id }] }),
    ).rejects.toThrow("Cliente no encontrado.");

    // Identificarlo después, desde "Renombrar o identificar", y desvincularlo.
    const second = guests[1]!;
    await caller.tableSession.renameGuest({ guestId: second.id, name: "Natalia", customerId: registered.id });
    await expect(db.tableGuest.findUniqueOrThrow({ where: { id: second.id } })).resolves.toMatchObject({ customerId: registered.id });
    await caller.tableSession.renameGuest({ guestId: second.id, name: "Natalia", customerId: null });
    await expect(db.tableGuest.findUniqueOrThrow({ where: { id: second.id } })).resolves.toMatchObject({ customerId: null });
  });

  it("sin clientes la mesa abre vacía, y limita cuántos se crean al abrir", async () => {
    const empty = await openTable();
    expect(empty.guests).toEqual([]);

    await expect(
      caller.tableSession.create({ name: "Mesa 2", guests: Array.from({ length: 31 }, () => "") }),
    ).rejects.toThrow("Máximo 30 clientes al abrir la mesa");
    await expect(db.tableSession.count({ where: { name: "Mesa 2" } })).resolves.toBe(0);
  });

  it("agrega clientes con nombre por defecto y los vincula a clientes registrados", async () => {
    const table = await openTable();
    const registered = await createCustomer(shop.business.id, { document: "555" });

    const anonymous = await caller.tableSession.addGuest({ sessionId: table.id });
    const byDocument = await caller.tableSession.addGuest({ sessionId: table.id, name: "Ana", document: "555" });
    const newCustomer = await caller.tableSession.addGuest({
      sessionId: table.id,
      name: "Beto",
      document: "777",
      phone: "300",
    });
    const linked = await caller.tableSession.addGuest({ sessionId: table.id, customerId: registered.id });

    expect(anonymous.name).toBe("Cliente 1");
    expect(linked.name).toBe("Cliente 4");
    const guests = await db.tableGuest.findMany({ where: { tableSessionId: table.id } });
    const byId = new Map(guests.map((g) => [g.id, g]));
    expect(byId.get(byDocument.id)!.customerId).toBe(registered.id);
    expect(byId.get(linked.id)!.customerId).toBe(registered.id);
    // Con documento nuevo se crea el cliente registrado y el comensal queda vinculado a él.
    expect(byId.get(newCustomer.id)!.customerId).not.toBeNull();
    await expect(db.customer.findFirst({ where: { document: "777" } })).resolves.toMatchObject({
      name: "Beto",
      phone: "300",
    });
    await expect(caller.tableSession.addGuest({ sessionId: table.id, customerId: "no-existe" })).rejects.toThrow(
      "Cliente no encontrado.",
    );
    await expect(caller.tableSession.addGuest({ sessionId: "no-existe" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("renombra y quita clientes sin pedidos", async () => {
    const table = await openTable();
    const guest = await caller.tableSession.addGuest({ sessionId: table.id });

    await expect(caller.tableSession.renameGuest({ guestId: guest.id, name: "Carlos" })).resolves.toEqual({
      message: "Cliente renombrado.",
    });
    await expect(caller.tableSession.removeGuest({ guestId: guest.id })).resolves.toEqual({
      message: "Cliente eliminado de la mesa.",
    });
    await expect(caller.tableSession.renameGuest({ guestId: guest.id, name: "X" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(caller.tableSession.removeGuest({ guestId: guest.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("rondas", () => {
  it("descuenta stock al pedir, es idempotente y aparece en la mesa activa", async () => {
    const product = await createProduct(shop.business.id, { price: 5400, stock: 10, taxSlots: [0] });
    const table = await openTable();
    const guest = await caller.tableSession.addGuest({ sessionId: table.id, name: "Ana" });
    const input = { guestId: guest.id, items: [{ productId: product.id, quantity: 2 }], idempotencyKey: newKey() };

    const order = await caller.tableSession.addOrder(input);
    const retry = await caller.tableSession.addOrder(input);

    expect(retry.id).toBe(order.id);
    expect(order.total).toBe(10800);
    expect(await stockOf(product.id)).toBe(8);
    const [active] = await caller.tableSession.listActive();
    expect(active!.guests[0]!.orders[0]).toMatchObject({ subtotal: 10000, taxAmount: 800, total: 10800 });
  });

  it("no deja quitar a un cliente con pedidos ni pedir productos inválidos", async () => {
    const product = await createProduct(shop.business.id);
    const inactive = await createProduct(shop.business.id, { isActive: false });
    const table = await openTable();
    const guest = await caller.tableSession.addGuest({ sessionId: table.id });
    await caller.tableSession.addOrder({ guestId: guest.id, items: [{ productId: product.id, quantity: 1 }] });

    await expect(caller.tableSession.removeGuest({ guestId: guest.id })).rejects.toThrow(
      "Elimina los pedidos del cliente antes de quitarlo de la mesa.",
    );
    await expect(
      caller.tableSession.addOrder({ guestId: guest.id, items: [{ productId: inactive.id, quantity: 1 }] }),
    ).rejects.toThrow("Uno o más productos no son válidos o están inactivos.");
    await expect(
      caller.tableSession.addOrder({ guestId: "no-existe", items: [{ productId: product.id, quantity: 1 }] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("mueve una ronda a otro cliente de la misma mesa", async () => {
    const product = await createProduct(shop.business.id);
    const table = await openTable();
    const other = await openTable("Mesa 2");
    const ana = await caller.tableSession.addGuest({ sessionId: table.id, name: "Ana" });
    const beto = await caller.tableSession.addGuest({ sessionId: table.id, name: "Beto" });
    const stranger = await caller.tableSession.addGuest({ sessionId: other.id, name: "Extraño" });
    const order = await caller.tableSession.addOrder({ guestId: ana.id, items: [{ productId: product.id, quantity: 1 }] });

    await expect(caller.tableSession.moveOrder({ orderId: order.id, toGuestId: ana.id })).resolves.toEqual({
      message: "El pedido ya pertenece a ese cliente.",
    });
    await expect(caller.tableSession.moveOrder({ orderId: order.id, toGuestId: beto.id })).resolves.toEqual({
      message: "Pedido movido a Beto.",
    });
    await expect(caller.tableSession.moveOrder({ orderId: order.id, toGuestId: stranger.id })).rejects.toThrow(
      "El cliente destino no pertenece a esta mesa.",
    );
    await expect(caller.tableSession.moveOrder({ orderId: "no-existe", toGuestId: beto.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("editar una ronda ajusta el stock solo por la diferencia y recalcula el total", async () => {
    const cerveza = await createProduct(shop.business.id, { price: 5400, stock: 10, taxSlots: [0] });
    const gaseosa = await createProduct(shop.business.id, { price: 2160, stock: 10, taxSlots: [0] });
    const papas = await createProduct(shop.business.id, { price: 3240, stock: 5, taxSlots: [0] });
    const table = await openTable();
    const guest = await caller.tableSession.addGuest({ sessionId: table.id, name: "Ana" });
    const order = await caller.tableSession.addOrder({
      guestId: guest.id,
      items: [{ productId: cerveza.id, quantity: 3 }, { productId: gaseosa.id, quantity: 1 }],
    });
    const items = await db.tableOrderItem.findMany({ where: { tableOrderId: order.id } });
    const cervezaLine = items.find((i) => i.productId === cerveza.id)!;

    // Una cerveza menos, sin la gaseosa y con papas nuevas.
    const edit = { orderId: order.id, keep: [{ itemId: cervezaLine.id, quantity: 2 }], add: [{ productId: papas.id, quantity: 2 }], note: "sin sal" };
    const updated = await caller.tableSession.updateOrder(edit);

    expect(updated.total).toBe(5400 * 2 + 3240 * 2);
    expect(await stockOf(cerveza.id)).toBe(8);
    expect(await stockOf(gaseosa.id)).toBe(10);
    expect(await stockOf(papas.id)).toBe(3);
    const [active] = await caller.tableSession.listActive();
    expect(active!.guests[0]!.orders[0]).toMatchObject({ note: "sin sal", taxAmount: 1280, subtotal: 16000 });
    await expect(db.auditLog.count({ where: { action: "EDIT_TABLE_ORDER" } })).resolves.toBe(1);

    // Cancelar después devuelve exactamente lo que quedó descontado.
    await caller.tableSession.removeOrder({ orderId: order.id });
    expect(await stockOf(cerveza.id)).toBe(10);
    expect(await stockOf(papas.id)).toBe(5);
  });

  it("editar una ronda valida stock, ronda vacía y líneas de otra versión", async () => {
    const product = await createProduct(shop.business.id, { stock: 3 });
    const table = await openTable();
    const guest = await caller.tableSession.addGuest({ sessionId: table.id });
    const order = await caller.tableSession.addOrder({ guestId: guest.id, items: [{ productId: product.id, quantity: 2 }] });
    const [line] = await db.tableOrderItem.findMany({ where: { tableOrderId: order.id } });

    await expect(caller.tableSession.updateOrder({ orderId: order.id, keep: [], add: [] })).rejects.toThrow(
      "La ronda quedaría vacía",
    );
    await expect(
      caller.tableSession.updateOrder({ orderId: order.id, keep: [{ itemId: line!.id, quantity: 4 }], add: [] }),
    ).rejects.toThrow("Stock insuficiente");
    expect(await stockOf(product.id)).toBe(1);
    await expect(
      caller.tableSession.updateOrder({ orderId: order.id, keep: [{ itemId: "otra", quantity: 1 }], add: [] }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Subir a 3 usa la unidad que quedaba.
    await caller.tableSession.updateOrder({ orderId: order.id, keep: [{ itemId: line!.id, quantity: 3 }], add: [] });
    expect(await stockOf(product.id)).toBe(0);
  });

  it("eliminar una ronda devuelve el stock y queda auditada", async () => {
    const product = await createProduct(shop.business.id, { stock: 10 });
    const table = await openTable();
    const guest = await caller.tableSession.addGuest({ sessionId: table.id });
    const order = await caller.tableSession.addOrder({ guestId: guest.id, items: [{ productId: product.id, quantity: 4 }] });

    await expect(caller.tableSession.removeOrder({ orderId: order.id })).resolves.toEqual({
      message: "Pedido eliminado y stock restaurado.",
    });
    expect(await stockOf(product.id)).toBe(10);
    await expect(db.auditLog.count({ where: { action: "REMOVE_TABLE_ORDER" } })).resolves.toBe(1);
    await expect(caller.tableSession.removeOrder({ orderId: order.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("cobro de mesa", () => {
  async function tableWithOrders() {
    const product = await createProduct(shop.business.id, { price: 10800, stock: 50, taxSlots: [0] });
    const table = await openTable();
    const ana = await caller.tableSession.addGuest({ sessionId: table.id, name: "Ana" });
    const beto = await caller.tableSession.addGuest({ sessionId: table.id, name: "Beto" });
    await caller.tableSession.addOrder({ guestId: ana.id, items: [{ productId: product.id, quantity: 1 }] });
    await caller.tableSession.addOrder({ guestId: ana.id, items: [{ productId: product.id, quantity: 2 }] });
    await caller.tableSession.addOrder({ guestId: beto.id, items: [{ productId: product.id, quantity: 1 }] });
    return { product, table, ana, beto };
  }

  it("cobra cada grupo como una venta con factura opcional y cierra la mesa", async () => {
    const { table, ana, beto } = await tableWithOrders();

    const result = await caller.tableSession.checkout({
      sessionId: table.id,
      groups: [
        { guestIds: [ana.id], paymentMethod: "CASH", invoice: true },
        { guestIds: [beto.id], paymentMethod: "CARD", note: "Pagó con tarjeta" },
      ],
    });

    expect(result).toMatchObject({ tableClosed: true, message: 'Mesa "Mesa 1" cerrada. 2 venta(s) generada(s).' });
    const sales = await db.sale.findMany({ include: { items: true }, orderBy: { total: "desc" } });
    expect(sales[0]).toMatchObject({
      saleType: "TABLE",
      paymentMethod: "CASH",
      subtotal: 30000,
      taxAmount: 2400,
      total: 32400,
      note: "Mesa: Mesa 1 · Ana",
    });
    expect(sales[0]!.invoiceNumber).toMatch(/^F-\d{4}-00001$/);
    expect(sales[0]!.items).toEqual([expect.objectContaining({ quantity: 3, stockDeducted: 3 })]);
    expect(sales[1]).toMatchObject({ paymentMethod: "CARD", invoiceNumber: null, note: "Pagó con tarjeta" });
    await expect(db.tableSession.findUnique({ where: { id: table.id } })).resolves.toMatchObject({ status: "CLOSED" });
  });

  it("cobrar todo cierra la mesa aunque queden clientes sin pedidos (salen con ella)", async () => {
    const { table, ana, beto } = await tableWithOrders();
    const waiting = await caller.tableSession.addGuest({ sessionId: table.id, name: "Carla" });
    const [before] = await caller.tableSession.listActive();
    expect(before!._count.sales).toBe(0);

    const result = await caller.tableSession.checkout({
      sessionId: table.id,
      groups: [{ guestIds: [ana.id, beto.id], paymentMethod: "CASH" }],
    });

    expect(result).toMatchObject({ tableClosed: true, message: 'Mesa "Mesa 1" cerrada. 1 venta(s) generada(s).' });
    await expect(db.tableGuest.findUnique({ where: { id: waiting.id } })).resolves.toBeNull();
    await expect(caller.tableSession.listActive()).resolves.toEqual([]);
  });

  it("cobro parcial y con keepGuests deja la mesa abierta", async () => {
    const { table, ana, beto } = await tableWithOrders();

    const partial = await caller.tableSession.checkout({
      sessionId: table.id,
      groups: [{ guestIds: [ana.id], paymentMethod: "CASH" }],
    });
    const kept = await caller.tableSession.checkout({
      sessionId: table.id,
      keepGuests: true,
      groups: [{ guestIds: [beto.id], paymentMethod: "CASH" }],
    });

    expect(partial.message).toBe("Cobro parcial registrado. 1 venta(s) generada(s).");
    expect(kept.message).toBe("Cobro registrado. Los clientes permanecen en mesa. 1 venta(s) generada(s).");
    const [listed] = await caller.tableSession.listActive();
    expect(listed!._count.sales).toBe(2);
    await expect(db.tableGuest.findUnique({ where: { id: beto.id } })).resolves.toBeTruthy();
    // Beto sigue en la mesa pero sin rondas: cobrarle otra vez no es posible.
    await expect(
      caller.tableSession.checkout({ sessionId: table.id, groups: [{ guestIds: [beto.id], paymentMethod: "CASH" }] }),
    ).rejects.toThrow(/ya fue cobrada/);
    await expect(caller.tableSession.close({ sessionId: table.id })).resolves.toEqual({ message: 'Mesa "Mesa 1" cerrada.' });
  });

  it("es idempotente: reintentar el mismo cobro no genera ventas nuevas", async () => {
    const { table, ana, beto } = await tableWithOrders();
    const input = {
      sessionId: table.id,
      idempotencyKey: newKey(),
      groups: [{ guestIds: [ana.id, beto.id], paymentMethod: "CASH" as const }],
    };

    const first = await caller.tableSession.checkout(input);
    const retry = await caller.tableSession.checkout(input);

    expect(retry.sales).toEqual(first.sales);
    expect(retry.message).toBe(first.message);
    await expect(db.sale.count()).resolves.toBe(1);
  });

  it("valida grupos repetidos, crédito sin cliente y comprobantes", async () => {
    const { table, ana, beto } = await tableWithOrders();
    const checkout = (groups: Parameters<typeof caller.tableSession.checkout>[0]["groups"]) =>
      caller.tableSession.checkout({ sessionId: table.id, groups });

    await expect(
      checkout([
        { guestIds: [ana.id], paymentMethod: "CASH" },
        { guestIds: [ana.id], paymentMethod: "CARD" },
      ]),
    ).rejects.toThrow("Un cliente aparece en múltiples grupos de pago.");
    await expect(checkout([{ guestIds: [ana.id], paymentMethod: "CREDIT" }])).rejects.toThrow(
      /el grupo necesita un cliente registrado/,
    );
    await expect(checkout([{ guestIds: [ana.id], paymentMethod: "TRANSFER", receiptPath: "otro/x.png" }])).rejects.toThrow(
      "El comprobante adjunto no es válido.",
    );

    const customer = await createCustomer(shop.business.id);
    await db.tableGuest.update({ where: { id: ana.id }, data: { customerId: customer.id } });
    await expect(checkout([{ guestIds: [ana.id, beto.id], paymentMethod: "CREDIT" }])).rejects.toThrow(
      "Todos los de un grupo fiado deben ser el mismo cliente registrado.",
    );
    await expect(checkout([{ guestIds: [ana.id], paymentMethod: "CREDIT" }])).resolves.toMatchObject({
      sales: [expect.objectContaining({ total: 32400 })],
    });
    await expect(db.sale.findFirst()).resolves.toMatchObject({ customerId: customer.id, paymentMethod: "CREDIT" });
  });

  it("no cobra a un cliente que ya salió de la mesa (cuenta ya cobrada)", async () => {
    const { table, ana, beto } = await tableWithOrders();
    await caller.tableSession.checkout({ sessionId: table.id, groups: [{ guestIds: [ana.id], paymentMethod: "CASH" }] });

    await expect(
      caller.tableSession.checkout({
        sessionId: table.id,
        groups: [{ guestIds: [ana.id, beto.id], paymentMethod: "CASH" }],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("ya fue cobrada") as unknown });
    await expect(db.sale.count()).resolves.toBe(1);
  });

  it("no cobra mesas inexistentes ni ya cerradas", async () => {
    const { table, ana } = await tableWithOrders();
    await caller.tableSession.cancel({ sessionId: table.id });

    await expect(
      caller.tableSession.checkout({ sessionId: table.id, groups: [{ guestIds: [ana.id], paymentMethod: "CASH" }] }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      caller.tableSession.checkout({ sessionId: "no-existe", groups: [{ guestIds: [ana.id], paymentMethod: "CASH" }] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("cierre y cancelación de mesa", () => {
  it("no cierra con pedidos pendientes; cancelar devuelve el stock", async () => {
    const product = await createProduct(shop.business.id, { stock: 10 });
    const table = await openTable();
    const guest = await caller.tableSession.addGuest({ sessionId: table.id });
    await caller.tableSession.addOrder({ guestId: guest.id, items: [{ productId: product.id, quantity: 3 }] });

    await expect(caller.tableSession.close({ sessionId: table.id })).rejects.toThrow(
      "Hay clientes con pedidos pendientes. Cóbralos primero antes de cerrar la mesa.",
    );
    await expect(caller.tableSession.cancel({ sessionId: table.id })).resolves.toEqual({
      message: 'Mesa "Mesa 1" cancelada. Stock restaurado.',
    });
    expect(await stockOf(product.id)).toBe(10);
    await expect(db.auditLog.findFirst({ where: { action: "CANCEL_TABLE" } })).resolves.toMatchObject({
      detail: expect.objectContaining({ orderCount: 1 }) as unknown,
    });
    await expect(caller.tableSession.cancel({ sessionId: table.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.tableSession.close({ sessionId: table.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
