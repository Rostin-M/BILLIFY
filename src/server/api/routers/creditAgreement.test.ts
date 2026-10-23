import { describe, expect, it, vi } from "vitest";

import { sendCreditAgreementEmail } from "~/server/lib/email";
import {
  callerFor,
  createCustomer,
  createProduct,
  createShop,
  db,
} from "../../../../tests/integration/helpers";

// PNG de 1×1 válido.
const SIGNATURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

async function shopWithRegister(data: Parameters<typeof createShop>[0] = {}) {
  const shop = await createShop(data);
  await callerFor(shop.cashier).cashRegister.open({ openingBalance: 0 });
  return shop;
}

describe("acuerdo de fiado", () => {
  it("el cajero abre la cuenta con firma, límite y plazo, y se envía el PDF por correo", async () => {
    const shop = await shopWithRegister();
    const customer = await createCustomer(shop.business.id, { name: "Ana Pérez" });
    const caller = callerFor(shop.cashier);

    const result = await caller.customer.signCreditAgreement({
      customerId: customer.id,
      creditLimit: 200000,
      creditTermDays: 15,
      signerName: "Ana Pérez",
      signerDocument: "1020304050",
      signature: SIGNATURE,
      email: "ana@example.com",
    });

    expect(result.emailed).toBe(true);
    expect(vi.mocked(sendCreditAgreementEmail)).toHaveBeenCalledWith("ana@example.com", expect.any(Buffer), expect.objectContaining({ customerName: "Ana Pérez" }));
    const agreement = await db.creditAgreement.findUniqueOrThrow({ where: { id: result.id } });
    expect(agreement).toMatchObject({ creditLimit: 200000, creditTermDays: 15, emailedTo: "ana@example.com", signature: SIGNATURE });
    expect(agreement.terms).toContain("Ana Pérez");
    expect(agreement.terms).toContain("15 días");
    await expect(db.customer.findUniqueOrThrow({ where: { id: customer.id } })).resolves.toMatchObject({
      creditLimit: 200000, creditTermDays: 15, email: "ana@example.com", document: "1020304050",
    });

    const account = await caller.customer.creditAccount({ customerId: customer.id });
    expect(account.agreements).toMatchObject([{ id: result.id, signed: true }]);

    const pdf = await caller.customer.creditAgreementPdf({ agreementId: result.id });
    expect(Buffer.from(pdf.base64, "base64").subarray(0, 4).toString()).toBe("%PDF");
    await expect(db.auditLog.count({ where: { action: "SIGN_CREDIT_AGREEMENT" } })).resolves.toBe(1);
  });

  it("con la firma obligatoria no se fía a quien no ha firmado, ni se abre la cuenta sin firma", async () => {
    const shop = await shopWithRegister({ creditSignatureRequired: true });
    const customer = await createCustomer(shop.business.id, { name: "Beto" });
    const product = await createProduct(shop.business.id, { price: 5000 });
    const caller = callerFor(shop.cashier);
    const sale = { items: [{ productId: product.id, quantity: 1 }], paymentMethod: "CREDIT" as const, customerId: customer.id };

    await expect(caller.sale.create(sale)).rejects.toThrow("no ha firmado el acuerdo de fiado");
    await expect(
      caller.customer.signCreditAgreement({ customerId: customer.id, creditLimit: null, creditTermDays: null, signerName: "Beto" }),
    ).rejects.toThrow("exige la firma");

    await caller.customer.signCreditAgreement({
      customerId: customer.id, creditLimit: null, creditTermDays: null, signerName: "Beto", signature: SIGNATURE,
    });
    await expect(caller.sale.create(sale)).resolves.toMatchObject({ total: 5000 });
  });

  it("no fía por encima del monto máximo, en venta rápida ni al cobrar la mesa", async () => {
    const shop = await shopWithRegister();
    const customer = await createCustomer(shop.business.id, { name: "Carla", creditLimit: 12000 });
    const product = await createProduct(shop.business.id, { price: 5000, stock: 50 });
    const caller = callerFor(shop.cashier);

    await caller.sale.create({ items: [{ productId: product.id, quantity: 2 }], paymentMethod: "CREDIT", customerId: customer.id });
    await expect(
      caller.sale.create({ items: [{ productId: product.id, quantity: 1 }], paymentMethod: "CREDIT", customerId: customer.id }),
    ).rejects.toThrow("le puedes fiar hasta");

    const table = await caller.tableSession.create({ name: "Mesa 1", guests: [{ name: "", customerId: customer.id }] });
    await caller.tableSession.addOrder({ guestId: table.guests[0]!.id, items: [{ productId: product.id, quantity: 1 }] });
    await expect(
      caller.tableSession.checkout({ sessionId: table.id, groups: [{ guestIds: [table.guests[0]!.id], paymentMethod: "CREDIT" }] }),
    ).rejects.toThrow("Se pasa del monto máximo");

    await caller.customer.updateCreditTerms({ customerId: customer.id, creditLimit: 20000, creditTermDays: 8 });
    await expect(
      caller.tableSession.checkout({ sessionId: table.id, groups: [{ guestIds: [table.guests[0]!.id], paymentMethod: "CREDIT" }] }),
    ).resolves.toMatchObject({ tableClosed: true });
  });

  it("no expone acuerdos de otro negocio y valida la firma", async () => {
    const shop = await shopWithRegister();
    const other = await shopWithRegister();
    const customer = await createCustomer(other.business.id);
    const otherAgreement = await callerFor(other.cashier).customer.signCreditAgreement({
      customerId: customer.id, creditLimit: null, creditTermDays: null, signerName: "X Y",
    });

    await expect(
      callerFor(shop.cashier).customer.creditAgreementPdf({ agreementId: otherAgreement.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      callerFor(other.cashier).customer.signCreditAgreement({
        customerId: customer.id, creditLimit: null, creditTermDays: null, signerName: "X Y", signature: "data:text/html;base64,PHA+",
      }),
    ).rejects.toThrow("Firma inválida");
  });
});
