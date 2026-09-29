import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendInvoiceEmail } from "~/server/lib/email";
import {
  callerFor,
  createBusiness,
  createCustomer,
  createProduct,
  createShop,
  createUser,
  db,
  newKey,
} from "../../../../tests/integration/helpers";

const createSignedUrl = vi.fn();
vi.mock("~/lib/supabase-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/supabase-server")>()),
  createSupabaseServiceClient: () => ({ storage: { from: () => ({ createSignedUrl }) } }),
}));

const IVA = [{ name: "IVA", rate: 19, enabled: true }];
const receiptPathFor = (businessId: string) =>
  `${businessId}/1700000000000-123e4567-e89b-12d3-a456-426614174000.png`;

describe("sale.create", () => {
  it("registra una venta rápida, descuenta stock y deja auditoría", async () => {
    const { business, cashier } = await createShop();
    const product = await createProduct(business.id, { price: 2500, stock: 10 });

    const result = await callerFor(cashier).sale.create({ items: [{ productId: product.id, quantity: 3 }] });

    expect(result).toMatchObject({ total: 7500, invoiceNumber: null, message: "Venta registrada correctamente." });
    const sale = await db.sale.findUniqueOrThrow({ where: { id: result.id }, include: { items: true } });
    expect(sale).toMatchObject({ saleType: "QUICK", paymentMethod: "CASH", subtotal: 7500, taxAmount: 0 });
    expect(sale.items[0]).toMatchObject({ quantity: 3, stockDeducted: 3 });
    await expect(db.product.findUnique({ where: { id: product.id } })).resolves.toMatchObject({ stock: 7 });
    await expect(db.inventoryMovement.count({ where: { productId: product.id, reason: "SALE" } })).resolves.toBe(1);
    await expect(db.auditLog.count({ where: { action: "CREATE_SALE", entityId: result.id } })).resolves.toBe(1);
  });

  it("factura con consecutivo e impuestos incluidos en el precio", async () => {
    const { business, owner } = await createShop({ autoTax: true, taxes: IVA });
    const product = await createProduct(business.id, { price: 11900, taxSlots: [0] });

    const first = await callerFor(owner).sale.create({
      saleType: "INVOICED",
      items: [{ productId: product.id, quantity: 1 }],
    });
    const second = await callerFor(owner).sale.create({
      saleType: "INVOICED",
      items: [{ productId: product.id, quantity: 1 }],
    });

    const year = new Date().getUTCFullYear();
    expect(first.invoiceNumber).toMatch(new RegExp(`^F-(${year}|${year - 1})-00001$`));
    expect(second.invoiceNumber).toMatch(/-00002$/);
    expect(first.message).toBe(`Factura ${first.invoiceNumber} registrada correctamente.`);
    const sale = await db.sale.findUniqueOrThrow({ where: { id: first.id }, include: { items: true } });
    expect(sale).toMatchObject({ subtotal: 10000, taxAmount: 1900, total: 11900 });
    expect(sale.items[0]!.taxLines).toEqual([{ name: "IVA", rate: 19, amount: 1900 }]);
  });

  it("no descuenta stock de productos sin control, por peso o de monto libre", async () => {
    const { business, owner } = await createShop();
    const untracked = await createProduct(business.id, { trackStock: false, stock: 5 });
    const weighted = await createProduct(business.id, { soldByWeight: true, price: 18000, stock: 5 });
    const open = await createProduct(business.id, { openPrice: true, stock: 5 });

    const result = await callerFor(owner).sale.create({
      items: [
        { productId: untracked.id, quantity: 2 },
        { productId: weighted.id, quantity: 1, weightKg: 0.265 },
        { productId: open.id, quantity: 1, customAmount: 3000 },
      ],
    });

    expect(result.total).toBe(2000 + 4800 + 3000);
    const stocks = await db.product.findMany({ where: { businessId: business.id }, select: { stock: true } });
    expect(stocks.every((p) => p.stock === 5)).toBe(true);
  });

  it("asigna la venta a la caja abierta del vendedor", async () => {
    const { business, cashier } = await createShop();
    const product = await createProduct(business.id);
    const register = await db.cashRegister.create({
      data: { businessId: business.id, userId: cashier.id, openingBalance: 0 },
    });

    const result = await callerFor(cashier).sale.create({ items: [{ productId: product.id, quantity: 1 }] });

    await expect(db.sale.findUnique({ where: { id: result.id } })).resolves.toMatchObject({
      cashRegisterId: register.id,
    });
  });

  it("es idempotente: la misma clave no registra la venta dos veces", async () => {
    const { business, cashier } = await createShop();
    const product = await createProduct(business.id, { stock: 10 });
    const input = { items: [{ productId: product.id, quantity: 2 }], idempotencyKey: newKey() };

    const first = await callerFor(cashier).sale.create(input);
    const retry = await callerFor(cashier).sale.create(input);

    expect(retry.id).toBe(first.id);
    await expect(db.sale.count()).resolves.toBe(1);
    await expect(db.product.findUnique({ where: { id: product.id } })).resolves.toMatchObject({ stock: 8 });
  });

  it("valida crédito, cliente, comprobante, productos y stock", async () => {
    const { business, cashier } = await createShop();
    const other = await createBusiness();
    const product = await createProduct(business.id, { stock: 1 });
    const inactive = await createProduct(business.id, { isActive: false });
    const foreignProduct = await createProduct(other.id);
    const foreignCustomer = await createCustomer(other.id);
    const caller = callerFor(cashier);
    const items = [{ productId: product.id, quantity: 1 }];

    await expect(caller.sale.create({ items, paymentMethod: "CREDIT" })).rejects.toThrow(
      "Las ventas a crédito requieren seleccionar un cliente registrado.",
    );
    await expect(caller.sale.create({ items, customerId: foreignCustomer.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      caller.sale.create({ items, paymentMethod: "TRANSFER", receiptPath: receiptPathFor(other.id) }),
    ).rejects.toThrow("El comprobante adjunto no es válido.");
    for (const productId of [inactive.id, foreignProduct.id]) {
      await expect(caller.sale.create({ items: [{ productId, quantity: 1 }] })).rejects.toThrow(
        "Uno o más productos no son válidos o están inactivos.",
      );
    }
    await expect(caller.sale.create({ items: [{ productId: product.id, quantity: 2 }] })).rejects.toThrow(
      /Stock insuficiente/,
    );
    await expect(db.sale.count()).resolves.toBe(0);
  });

  it("acepta crédito con cliente y transferencia con comprobante propio", async () => {
    const { business, cashier } = await createShop();
    const product = await createProduct(business.id);
    const customer = await createCustomer(business.id);
    const caller = callerFor(cashier);
    const items = [{ productId: product.id, quantity: 1 }];

    const credit = await caller.sale.create({ items, paymentMethod: "CREDIT", customerId: customer.id });
    const transfer = await caller.sale.create({
      items,
      paymentMethod: "TRANSFER",
      receiptPath: receiptPathFor(business.id),
      note: "  pago por Nequi  ",
    });

    await expect(db.sale.findUnique({ where: { id: credit.id } })).resolves.toMatchObject({ customerId: customer.id });
    await expect(db.sale.findUnique({ where: { id: transfer.id } })).resolves.toMatchObject({
      receiptPath: receiptPathFor(business.id),
      note: "pago por Nequi",
    });
  });

  it("bloquea ventas si la caja quedó abierta desde un día anterior", async () => {
    const { business, cashier } = await createShop();
    const product = await createProduct(business.id);
    await db.cashRegister.create({
      data: {
        businessId: business.id,
        userId: cashier.id,
        openingBalance: 0,
        openedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    });

    await expect(
      callerFor(cashier).sale.create({ items: [{ productId: product.id, quantity: 1 }] }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("sale.list y exportForPeriod", () => {
  it("lista solo las ventas del día y del propio negocio", async () => {
    const { business, owner } = await createShop();
    const other = await createShop();
    const product = await createProduct(business.id);
    const otherProduct = await createProduct(other.business.id);
    await callerFor(owner).sale.create({ items: [{ productId: product.id, quantity: 1 }] });
    await callerFor(other.owner).sale.create({ items: [{ productId: otherProduct.id, quantity: 1 }] });

    const today = await callerFor(owner).sale.list({});
    const lastYear = await callerFor(owner).sale.list({ date: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) });
    const exported = await callerFor(owner).sale.exportForPeriod({ period: "month" });

    expect(today).toHaveLength(1);
    expect(today[0]!.items).toHaveLength(1);
    expect(lastYear).toHaveLength(0);
    expect(exported).toHaveLength(1);
  });
});

describe("sale.void", () => {
  it("anula la venta, devuelve el stock y registra auditoría", async () => {
    const { business, owner, cashier } = await createShop();
    const product = await createProduct(business.id, { stock: 10 });
    const sale = await callerFor(cashier).sale.create({ items: [{ productId: product.id, quantity: 4 }] });

    const result = await callerFor(owner).sale.void({ saleId: sale.id, reason: "Cliente devolvió" });

    expect(result.message).toMatch(/anulada/);
    await expect(db.sale.findUnique({ where: { id: sale.id } })).resolves.toMatchObject({
      status: "VOIDED",
      voidReason: "Cliente devolvió",
    });
    await expect(db.product.findUnique({ where: { id: product.id } })).resolves.toMatchObject({ stock: 10 });
    await expect(db.auditLog.count({ where: { action: "VOID_SALE" } })).resolves.toBe(1);
  });

  it("no anula dos veces, ventas ajenas ni permite hacerlo a un cajero", async () => {
    const { business, owner, cashier } = await createShop();
    const other = await createShop();
    const product = await createProduct(business.id);
    const sale = await callerFor(owner).sale.create({ items: [{ productId: product.id, quantity: 1 }] });

    await callerFor(owner).sale.void({ saleId: sale.id, reason: "Error de digitación" });

    await expect(callerFor(owner).sale.void({ saleId: sale.id, reason: "Otra vez" })).rejects.toThrow(
      "Solo se pueden anular ventas en estado completado.",
    );
    await expect(callerFor(other.owner).sale.void({ saleId: sale.id, reason: "Ajena" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(callerFor(cashier).sale.void({ saleId: sale.id, reason: "Cajero" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("sale.getReceiptUrl", () => {
  beforeEach(() => createSignedUrl.mockReset());

  it("firma el comprobante propio", async () => {
    const { business, cashier } = await createShop();
    const product = await createProduct(business.id);
    const sale = await callerFor(cashier).sale.create({
      items: [{ productId: product.id, quantity: 1 }],
      paymentMethod: "TRANSFER",
      receiptPath: receiptPathFor(business.id),
    });
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://firmada" }, error: null });

    await expect(callerFor(cashier).sale.getReceiptUrl({ saleId: sale.id })).resolves.toEqual({
      url: "https://firmada",
    });
    expect(createSignedUrl).toHaveBeenCalledWith(receiptPathFor(business.id), 300);
  });

  it("falla sin comprobante o si Supabase no firma", async () => {
    const { business, cashier } = await createShop();
    const product = await createProduct(business.id);
    const plain = await callerFor(cashier).sale.create({ items: [{ productId: product.id, quantity: 1 }] });
    const withReceipt = await callerFor(cashier).sale.create({
      items: [{ productId: product.id, quantity: 1 }],
      paymentMethod: "TRANSFER",
      receiptPath: receiptPathFor(business.id),
    });
    createSignedUrl.mockResolvedValue({ data: null, error: new Error("storage caído") });

    await expect(callerFor(cashier).sale.getReceiptUrl({ saleId: plain.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(callerFor(cashier).sale.getReceiptUrl({ saleId: withReceipt.id })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });
});

describe("sale.sendInvoiceEmail", () => {
  afterEach(() => vi.mocked(sendInvoiceEmail).mockClear());

  it("genera el PDF y lo envía al cliente", async () => {
    const { business, owner } = await createShop({
      autoTax: true,
      taxes: IVA,
      invoiceTaxDetail: "PER_ITEM",
      invoiceEmailSource: "OWNER",
    });
    const product = await createProduct(business.id, { price: 11900, taxSlots: [0] });
    const customer = await createCustomer(business.id, { document: "123" });
    const sale = await callerFor(owner).sale.create({
      saleType: "INVOICED",
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 2 }],
    });

    const result = await callerFor(owner).sale.sendInvoiceEmail({
      saleId: sale.id,
      customerEmail: "  Cliente@Correo.COM ",
    });

    expect(result.message).toBe(`Factura ${sale.invoiceNumber} enviada a cliente@correo.com.`);
    const [to, invoiceNumber, businessName, pdf] = vi.mocked(sendInvoiceEmail).mock.calls[0]!;
    expect([to, invoiceNumber, businessName]).toEqual(["cliente@correo.com", sale.invoiceNumber, business.name]);
    expect(Buffer.from(pdf).subarray(0, 4).toString()).toBe("%PDF");
  });

  it("rechaza ventas sin factura, anuladas o inexistentes", async () => {
    const { business, owner } = await createShop();
    const product = await createProduct(business.id);
    const quick = await callerFor(owner).sale.create({ items: [{ productId: product.id, quantity: 1 }] });
    const invoiced = await callerFor(owner).sale.create({
      saleType: "INVOICED",
      items: [{ productId: product.id, quantity: 1 }],
    });
    await callerFor(owner).sale.void({ saleId: invoiced.id, reason: "Anulada" });
    const send = (saleId: string) =>
      callerFor(owner).sale.sendInvoiceEmail({ saleId, customerEmail: "c@correo.com" });

    await expect(send(quick.id)).rejects.toThrow("Solo se pueden enviar por correo las ventas con número de factura.");
    await expect(send(invoiced.id)).rejects.toThrow("No se puede enviar una factura anulada.");
    await expect(send("no-existe")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(sendInvoiceEmail).not.toHaveBeenCalled();
  });

  it("aplica el límite de envíos por usuario", async () => {
    const { business } = await createShop();
    const sender = await createUser({ businessId: business.id, role: "CASHIER" });
    await db.rateLimit.create({
      data: {
        key: `invoice-mail:user:${sender.id}`,
        count: 20,
        windowStart: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await expect(
      callerFor(sender).sale.sendInvoiceEmail({ saleId: "x", customerEmail: "c@correo.com" }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});
