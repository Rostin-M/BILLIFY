import { describe, expect, it } from "vitest";

import { resolveInvoiceContact } from "./invoiceContact";

describe("resolveInvoiceContact", () => {
  it("usa el dato del dueño", () => {
    expect(resolveInvoiceContact("OWNER", "owner@x.co", "negocio@x.co")).toBe("owner@x.co");
  });

  it("usa el dato del negocio", () => {
    expect(resolveInvoiceContact("BUSINESS", "owner@x.co", "negocio@x.co")).toBe("negocio@x.co");
  });

  it("no muestra contacto con NONE", () => {
    expect(resolveInvoiceContact("NONE", "owner@x.co", "negocio@x.co")).toBeNull();
  });
});
