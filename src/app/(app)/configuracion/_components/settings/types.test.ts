import { describe, expect, it } from "vitest";

import {
  SECTIONS,
  formFromData,
  isSectionDirty,
  isSectionId,
  parseTaxes,
  pickSection,
  type BusinessData,
} from "./types";

const data: BusinessData = {
  id: "b1",
  name: "Tienda",
  document: "900",
  address: null,
  phone: "601",
  email: null,
  invoicePhoneSource: "BUSINESS",
  invoiceEmailSource: "NONE",
  invoiceTaxDetail: "SUMMARY",
  ownerPhone: null,
  ownerEmail: "owner@x.co",
  taxes: [{ name: "IVA", rate: 19, enabled: true }],
  autoTax: true,
  plan: "MVP",
  maxCashRegisters: 2,
  logoUrl: null,
  categories: ["Bebidas"],
  produceModuleEnabled: false,
  cashiersCanEditPrices: false,
};

const section = (id: string) => SECTIONS.find((s) => s.id === id)!;

describe("parseTaxes", () => {
  it("completa los tres espacios con nombres por defecto", () => {
    expect(parseTaxes(data.taxes)).toEqual([
      { name: "IVA", rate: "19", enabled: true },
      { name: "INC", rate: "0", enabled: false },
      { name: "", rate: "0", enabled: false },
    ]);
  });

  it("tolera datos que no son arreglo", () => {
    expect(parseTaxes(null).map((t) => t.name)).toEqual(["IVA", "INC", ""]);
  });
});

describe("formFromData", () => {
  it("convierte nulos en cadenas vacías y números en texto", () => {
    expect(formFromData(data)).toMatchObject({
      address: "",
      phone: "601",
      email: "",
      ownerPhone: "",
      maxCashRegisters: "2",
      categories: ["Bebidas"],
    });
  });
});

describe("secciones", () => {
  it("isSectionId reconoce solo secciones existentes", () => {
    expect(isSectionId("caja")).toBe(true);
    expect(isSectionId("otra")).toBe(false);
    expect(isSectionId(null)).toBe(false);
  });

  it("isSectionDirty solo mira los campos de la sección", () => {
    const saved = formFromData(data);
    const edited = { ...saved, name: "Nuevo nombre" };

    expect(isSectionDirty(section("negocio"), edited, saved)).toBe(true);
    expect(isSectionDirty(section("caja"), edited, saved)).toBe(false);
    expect(isSectionDirty(section("plan"), edited, saved)).toBe(false);
  });

  it("pickSection copia solo los campos de la sección", () => {
    const saved = formFromData(data);
    const edited = { ...saved, name: "Nuevo", maxCashRegisters: "5" };

    const result = pickSection(section("caja"), saved, edited);

    expect(result.maxCashRegisters).toBe("5");
    expect(result.name).toBe("Tienda");
  });
});
