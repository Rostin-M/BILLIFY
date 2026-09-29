import { describe, expect, it } from "vitest";

import { NAV_ITEMS, getBottomNavItems, getNavItemsForRole } from "./nav-config";

const hrefs = (items: { href: string }[]) => items.map((i) => i.href);

describe("getNavItemsForRole", () => {
  it("el dueño ve todo el menú", () => {
    expect(getNavItemsForRole("OWNER")).toEqual(NAV_ITEMS);
  });

  it("el cajero no ve las secciones exclusivas del dueño", () => {
    const cashier = hrefs(getNavItemsForRole("CASHIER"));
    expect(cashier).toContain("/ventas");
    expect(cashier).toContain("/fiados");
    for (const ownerOnly of ["/dashboard", "/clientes", "/trazabilidad", "/empleados", "/configuracion", "/suscripcion"]) {
      expect(cashier).not.toContain(ownerOnly);
    }
  });
});

describe("getBottomNavItems", () => {
  it("prioriza el dashboard para el dueño", () => {
    expect(hrefs(getBottomNavItems("OWNER"))).toEqual(["/ventas", "/mesas", "/caja", "/dashboard"]);
  });

  it("muestra inventario en lugar del dashboard al cajero", () => {
    expect(hrefs(getBottomNavItems("CASHIER"))).toEqual(["/ventas", "/mesas", "/caja", "/inventario"]);
  });
});
