import { afterEach, describe, expect, it, vi } from "vitest";

import { isPlatformAdmin, parsePlatformAdminEmails, type PlatformAdminCandidate } from "./platformAdminPolicy";

const admin: PlatformAdminCandidate = { role: "SUPERADMIN", businessId: null, email: "admin@billify.co" };

afterEach(() => vi.unstubAllEnvs());

describe("parsePlatformAdminEmails", () => {
  it("separa por comas, recorta espacios y pasa a minúsculas", () => {
    expect([...parsePlatformAdminEmails(" Admin@Billify.co ,otro@x.co,, ")]).toEqual(["admin@billify.co", "otro@x.co"]);
  });

  it("sin valor devuelve una lista vacía", () => {
    expect(parsePlatformAdminEmails(undefined).size).toBe(0);
    expect(parsePlatformAdminEmails("").size).toBe(0);
    expect(parsePlatformAdminEmails(" , ").size).toBe(0);
  });
});

describe("isPlatformAdmin", () => {
  it("acepta un SUPERADMIN sin negocio cuyo correo está en la lista (sin distinguir mayúsculas)", () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "otro@x.co, ADMIN@billify.co");

    expect(isPlatformAdmin(admin)).toBe(true);
    expect(isPlatformAdmin({ ...admin, email: " Admin@Billify.CO " })).toBe(true);
  });

  it("falla cerrado sin la variable o con la variable vacía", () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", undefined);
    expect(isPlatformAdmin(admin)).toBe(false);

    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "");
    expect(isPlatformAdmin(admin)).toBe(false);
    // Un correo vacío nunca coincide con una entrada vacía de la lista.
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", ",");
    expect(isPlatformAdmin({ ...admin, email: "" })).toBe(false);
  });

  it("rechaza si falla cualquiera de las dos llaves", () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "admin@billify.co");

    expect(isPlatformAdmin(null)).toBe(false);
    expect(isPlatformAdmin({ ...admin, email: "intruso@billify.co" })).toBe(false);
    expect(isPlatformAdmin({ ...admin, email: null })).toBe(false);
    // El correo está en la lista, pero la cuenta no es SUPERADMIN o tiene negocio.
    expect(isPlatformAdmin({ ...admin, role: "OWNER" })).toBe(false);
    expect(isPlatformAdmin({ ...admin, role: "CASHIER" })).toBe(false);
    expect(isPlatformAdmin({ ...admin, businessId: "b1" })).toBe(false);
    // Coincidencia exacta: ni subcadenas ni dominios parecidos.
    expect(isPlatformAdmin({ ...admin, email: "admin@billify.co.evil.test" })).toBe(false);
    expect(isPlatformAdmin({ ...admin, email: "xadmin@billify.co" })).toBe(false);
  });
});
