import { describe, expect, it } from "vitest";

import { callerFor, createShop, db, setSubscription } from "../../../../tests/integration/helpers";

const settings = {
  name: "Tienda Don Pepe",
  address: "Calle 1 # 2-3",
  phone: "6011234567",
  email: "  Ventas@DonPepe.CO ",
  ownerPhone: "3001112233",
  invoicePhoneSource: "BUSINESS" as const,
  invoiceEmailSource: "BUSINESS" as const,
  invoiceTaxDetail: "PER_ITEM" as const,
  taxes: [{ name: "IVA", rate: 19, enabled: true }],
  autoTax: true,
  maxCashRegisters: 3,
  categories: ["Bebidas", "Panadería"],
  produceModuleEnabled: true,
  cashiersCanEditPrices: true,
};

describe("business settings", () => {
  it("guarda la configuración y la devuelve con los datos del dueño", async () => {
    const { owner, business } = await createShop();
    await setSubscription(business.id, { plan: "PRO" }); // 3 cajas: el plan Pro permite hasta 4
    const caller = callerFor(owner);

    await expect(caller.business.updateSettings(settings)).resolves.toEqual({
      message: "Configuración guardada correctamente.",
    });

    await expect(caller.business.getSettings()).resolves.toMatchObject({
      id: business.id,
      name: "Tienda Don Pepe",
      email: "ventas@donpepe.co",
      taxes: settings.taxes,
      autoTax: true,
      maxCashRegisters: 3,
      categories: ["Bebidas", "Panadería"],
      cashiersCanEditPrices: true,
      ownerPhone: "3001112233",
      ownerEmail: owner.email,
    });
    await expect(db.auditLog.count({ where: { action: "UPDATE_BUSINESS_SETTINGS" } })).resolves.toBe(1);
  });

  it("conserva el permiso de precios si el cliente no lo envía", async () => {
    const { owner, business } = await createShop({ cashiersCanEditPrices: true });
    await setSubscription(business.id, { plan: "PRO" });
    const { cashiersCanEditPrices: _omit, ...withoutPermission } = settings;

    await callerFor(owner).business.updateSettings(withoutPermission);

    await expect(db.business.findUnique({ where: { id: business.id } })).resolves.toMatchObject({
      cashiersCanEditPrices: true,
    });
  });

  it("exige los datos de contacto que se mostrarán en la factura", async () => {
    const { owner } = await createShop();
    const caller = callerFor(owner);
    const base = { name: "Tienda" };

    await expect(caller.business.updateSettings({ ...base, invoicePhoneSource: "BUSINESS" })).rejects.toThrow(
      /teléfono del negocio/,
    );
    await expect(caller.business.updateSettings({ ...base, invoicePhoneSource: "OWNER" })).rejects.toThrow(
      /teléfono personal/,
    );
    await expect(caller.business.updateSettings({ ...base, invoiceEmailSource: "BUSINESS" })).rejects.toThrow(
      /correo del negocio/,
    );
    await expect(
      caller.business.updateSettings({ ...base, taxes: [{ name: "X", rate: 150, enabled: true }] }),
    ).rejects.toThrow(/100%/);
  });

  it("solo el dueño accede a la configuración", async () => {
    const { cashier } = await createShop();
    await expect(callerFor(cashier).business.getSettings()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
