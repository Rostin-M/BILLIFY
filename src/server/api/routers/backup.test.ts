import { describe, expect, it } from "vitest";

import { backupFileSchema, type BackupFileInput } from "~/lib/backup/format";
import { pendingSince } from "~/server/backup/export";
import {
  callerFor,
  createCustomer,
  createProduct,
  createShop,
  db,
  setSubscription,
} from "../../../../tests/integration/helpers";

/** Deuda = ventas a crédito completadas − abonos (misma regla que customer.ts). */
async function debtOf(businessId: string, customerId: string) {
  const [sales, paid] = await Promise.all([
    db.sale.aggregate({
      where: {
        businessId,
        customerId,
        paymentMethod: "CREDIT",
        status: "COMPLETED",
      },
      _sum: { total: true },
    }),
    db.customerPayment.aggregate({
      where: { businessId, customerId },
      _sum: { amount: true },
    }),
  ]);
  return (sales._sum.total ?? 0) - (paid._sum.amount ?? 0);
}

/** Negocio con dos productos y tres clientes: uno debe, otro no fió y otro ya pagó todo. */
async function shopWithData() {
  const shop = await createShop();
  const caller = callerFor(shop.owner);
  const tinto = await createProduct(shop.business.id, {
    name: "Tinto",
    price: 2000,
    stock: 10,
    barcode: "770123",
    brand: "Sello Rojo",
  });
  await createProduct(shop.business.id, {
    name: "Avena vieja",
    price: 3000,
    stock: 0,
    isActive: false,
  });
  const debtor = await createCustomer(shop.business.id, {
    name: "Don Jairo",
    document: "1010",
    phone: "3001112233",
  });
  await createCustomer(shop.business.id, {
    name: "Sin fiado",
    document: "2020",
  });
  const settled = await createCustomer(shop.business.id, {
    name: "Al día",
    document: "3030",
  });

  await caller.sale.create({
    items: [{ productId: tinto.id, quantity: 2 }],
    paymentMethod: "CREDIT",
    customerId: debtor.id,
  });
  await caller.customer.addPayment({
    customerId: debtor.id,
    amount: 1500,
    paymentMethod: "TRANSFER",
    note: "Primer abono",
  });
  await caller.sale.create({
    items: [{ productId: tinto.id, quantity: 1 }],
    paymentMethod: "CREDIT",
    customerId: settled.id,
  });
  await caller.customer.addPayment({
    customerId: settled.id,
    amount: 2000,
    paymentMethod: "TRANSFER",
  });

  return { ...shop, tinto, debtor, settled };
}

describe("backup.export", () => {
  it("exporta productos con su último precio y clientes, con fiados solo si deben", async () => {
    const { owner, debtor } = await shopWithData();

    const backup = await callerFor(owner).backup.export();

    expect(backupFileSchema.safeParse(backup).success).toBe(true);
    expect(backup.products.map((p) => p.name)).toEqual([
      "Avena vieja",
      "Tinto",
    ]);
    expect(backup.products.find((p) => p.name === "Tinto")).toMatchObject({
      price: 2000,
      stock: 7,
      barcode: "770123",
    });

    const jairo = backup.customers.find((c) => c.ref === debtor.id)!;
    expect(jairo).toMatchObject({ document: "1010", phone: "3001112233" });
    expect(jairo.credit).toMatchObject({ balance: 2500 });
    expect(jairo.credit!.sales).toHaveLength(1);
    expect(jairo.credit!.sales[0]!.items[0]).toMatchObject({
      name: "Tinto",
      quantity: 2,
      price: 2000,
    });
    expect(jairo.credit!.payments).toEqual([
      expect.objectContaining({
        amount: 1500,
        method: "TRANSFER",
        note: "Primer abono",
      }),
    ]);
    expect(jairo.credit!.pendingSince).toBe(jairo.credit!.sales[0]!.date);
    expect(
      backup.customers.find((c) => c.name === "Al día")!.credit,
    ).toBeNull();
    expect(
      backup.customers.find((c) => c.name === "Sin fiado")!.credit,
    ).toBeNull();
  });

  it("solo el propietario puede exportar e importar", async () => {
    const { cashier } = await createShop();
    await expect(callerFor(cashier).backup.export()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      callerFor(cashier).backup.import({ file: {} }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("backup.import", () => {
  it("carga el respaldo en otro negocio con los fiados cuadrados, y repetirlo no duplica", async () => {
    const source = await shopWithData();
    const backup = await callerFor(source.owner).backup.export();
    const target = await createShop();
    const caller = callerFor(target.owner);

    await expect(caller.backup.import({ file: backup })).resolves.toEqual({
      products: { created: 2, updated: 0 },
      customers: { created: 3, updated: 0 },
      credit: { sales: 1, payments: 1, skipped: 0 },
    });

    const tinto = await db.product.findFirstOrThrow({
      where: { businessId: target.business.id, barcode: "770123" },
    });
    expect(tinto).toMatchObject({ name: "Tinto", price: 2000, stock: 7, brand: "Sello Rojo" });
    // Las marcas de los productos cargados quedan en la lista del negocio.
    await expect(
      db.business.findUnique({ where: { id: target.business.id } }),
    ).resolves.toMatchObject({ brands: ["Sello Rojo"] });
    const jairo = await db.customer.findFirstOrThrow({
      where: { businessId: target.business.id, document: "1010" },
    });
    await expect(debtOf(target.business.id, jairo.id)).resolves.toBe(2500);
    const sale = await db.sale.findFirstOrThrow({
      where: { customerId: jairo.id },
      include: { items: true },
    });
    expect(sale.createdAt.toISOString()).toBe(
      backup.customers.find((c) => c.ref === source.debtor.id)!.credit!
        .sales[0]!.date,
    );
    expect(sale.items[0]).toMatchObject({
      productId: tinto.id,
      stockDeducted: 0,
    });

    // Segunda carga del mismo archivo: actualiza, no crea ni repite fiados.
    await expect(caller.backup.import({ file: backup })).resolves.toEqual({
      products: { created: 0, updated: 2 },
      customers: { created: 0, updated: 3 },
      credit: { sales: 0, payments: 0, skipped: 2 },
    });
    await expect(debtOf(target.business.id, jairo.id)).resolves.toBe(2500);
    await expect(
      db.product.count({ where: { businessId: target.business.id } }),
    ).resolves.toBe(2);
    await expect(
      db.auditLog.count({ where: { action: "IMPORT_BACKUP" } }),
    ).resolves.toBe(2);
  });

  it("en el mismo negocio actualiza los datos sin duplicar fiados y deja el ajuste de stock en el historial", async () => {
    const shop = await shopWithData();
    const backup = await callerFor(shop.owner).backup.export();
    const edited: BackupFileInput = {
      ...backup,
      products: backup.products.map((p) =>
        p.name === "Tinto" ? { ...p, price: 2500, stock: 50 } : p,
      ),
    };

    const summary = await callerFor(shop.owner).backup.import({ file: edited });

    expect(summary).toMatchObject({
      products: { created: 0, updated: 2 },
      credit: { sales: 0, payments: 0, skipped: 2 },
    });
    await expect(
      db.product.findUniqueOrThrow({ where: { id: shop.tinto.id } }),
    ).resolves.toMatchObject({
      price: 2500,
      stock: 50,
    });
    await expect(
      db.inventoryMovement.findFirstOrThrow({
        where: { productId: shop.tinto.id, reason: "IMPORT" },
      }),
    ).resolves.toMatchObject({ quantity: 43, stockAfter: 50 });
    await expect(debtOf(shop.business.id, shop.debtor.id)).resolves.toBe(2500);
  });

  it("empareja primero por código de barras, no repite códigos y conserva los datos que el archivo no trae", async () => {
    const source = await shopWithData();
    const backup = await callerFor(source.owner).backup.export();
    const target = await createShop();
    const local = await createProduct(target.business.id, { name: "Tinto", barcode: "111", stock: 1 });
    const gaseosa = await createProduct(target.business.id, { name: "Gaseosa", barcode: "770123" });
    const leche = await createProduct(target.business.id, { name: "Leche", barcode: "222" });
    const jairo = await createCustomer(target.business.id, { name: "Don Jairo", document: null, phone: "1" });
    const tinto = backup.products.find((p) => p.name === "Tinto")!;
    const file: BackupFileInput = {
      ...backup,
      products: [
        ...backup.products,
        { ...tinto, ref: "doble", name: "Tinto doble", barcode: "111" },
        { ...tinto, ref: "leche", name: "Leche", barcode: null },
        { ...tinto, ref: "deslactosada", name: "Leche deslactosada", barcode: "222" },
      ],
      customers: backup.customers.map((c) => (c.name === "Al día" ? { ...c, document: null } : c)),
    };

    const summary = await callerFor(target.owner).backup.import({ file });

    expect(summary.products).toEqual({ created: 2, updated: 3 });
    await expect(db.product.findUniqueOrThrow({ where: { id: gaseosa.id } })).resolves.toMatchObject({ name: "Tinto", barcode: "770123" });
    await expect(db.product.findUniqueOrThrow({ where: { id: local.id } })).resolves.toMatchObject({ name: "Tinto doble", barcode: "111" });
    // Sin código en el archivo, "Leche" conserva el suyo; el nuevo que trae ese código entra sin código.
    await expect(db.product.findUniqueOrThrow({ where: { id: leche.id } })).resolves.toMatchObject({ barcode: "222" });
    await expect(
      db.product.findFirstOrThrow({ where: { businessId: target.business.id, name: "Leche deslactosada" } }),
    ).resolves.toMatchObject({ barcode: null });
    await expect(db.customer.findUniqueOrThrow({ where: { id: jairo.id } })).resolves.toMatchObject({ document: "1010", phone: "3001112233" });
    await expect(
      db.customer.findFirstOrThrow({ where: { businessId: target.business.id, name: "Al día" } }),
    ).resolves.toMatchObject({ document: null });
  });

  it("respeta el límite de productos del plan sin dejar nada a medias", async () => {
    const target = await createShop();
    await setSubscription(target.business.id, { plan: "BASIC" });
    const file: BackupFileInput = {
      format: "billify-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      business: { name: "Otro", document: "1" },
      products: Array.from({ length: 501 }, (_, i) => ({
        ref: `p${i}`,
        name: `Producto ${i}`,
        price: 1000,
      })),
      customers: [{ ref: "c1", name: "Cliente" }],
    };

    const importing = callerFor(target.owner).backup.import({ file });
    await expect(importing).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(importing).rejects.toThrow("permite 500");
    await expect(
      db.product.count({ where: { businessId: target.business.id } }),
    ).resolves.toBe(0);
    await expect(
      db.customer.count({ where: { businessId: target.business.id } }),
    ).resolves.toBe(0);
  });

  it("rechaza archivos que no son respaldos o con fiados incoherentes", async () => {
    const { owner } = await createShop();
    const caller = callerFor(owner);

    await expect(
      caller.backup.import({ file: { format: "otro" } }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "El archivo no es un respaldo de BILLIFY.",
    });

    const orphan: BackupFileInput = {
      format: "billify-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      business: { name: "Otro", document: "1" },
      products: [],
      customers: [
        {
          ref: "c1",
          name: "Ana",
          credit: {
            balance: 1000,
            pendingSince: null,
            payments: [],
            sales: [
              {
                ref: "s1",
                date: new Date().toISOString(),
                subtotal: 1000,
                total: 1000,
                items: [
                  {
                    productRef: "no-existe",
                    name: "X",
                    price: 1000,
                    quantity: 1,
                    subtotal: 1000,
                  },
                ],
              },
            ],
          },
        },
      ],
    };
    await expect(caller.backup.import({ file: orphan })).rejects.toThrow(
      "usa un producto que no está en el archivo",
    );
  });
});

describe("pendingSince", () => {
  const d = (day: number) => new Date(Date.UTC(2026, 9, day));

  it("es el primer fiado después de la última vez que el saldo llegó a cero", () => {
    expect(
      pendingSince(
        [
          { date: d(1), total: 1000 },
          { date: d(3), total: 500 },
          { date: d(4), total: 300 },
        ],
        [
          { date: d(2), amount: 1000 },
          { date: d(5), amount: 200 },
        ],
      ),
    ).toEqual(d(3));
  });

  it("es null si la cuenta está saldada", () => {
    expect(
      pendingSince(
        [{ date: d(1), total: 1000 }],
        [{ date: d(2), amount: 1000 }],
      ),
    ).toBeNull();
  });
});
