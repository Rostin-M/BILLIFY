import { afterEach, describe, expect, it, vi } from "vitest";

import { hasOpenCashRegister } from "~/app/_components/sessionExpiryActions";
import { auth } from "~/server/auth";
import { createShop, createUser, db } from "../../../tests/integration/helpers";
import { requirePlatformAdminPage } from "./platformAdmin";
import { requireApiUser, requirePageUser } from "./requirePageUser";

// redirect() de Next lanza para cortar el render; aquí se captura el destino.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

function signIn(user: { id: string } | null) {
  vi.mocked(auth).mockResolvedValue(
    (user ? { user: { id: user.id, loginAt: Date.now(), sessionVersion: 0 }, expires: "" } : null) as unknown as never,
  );
}

afterEach(() => {
  vi.mocked(auth).mockReset();
  vi.unstubAllEnvs();
});

const ADMIN_EMAIL = "admin@billify.test";
const createAdmin = (email = ADMIN_EMAIL) => createUser({ businessId: null, role: "SUPERADMIN", email });

describe("requirePageUser", () => {
  it("devuelve el usuario activo con datos frescos de la BD", async () => {
    const { owner, business } = await createShop();
    signIn(owner);

    await expect(requirePageUser()).resolves.toMatchObject({ id: owner.id, role: "OWNER", businessId: business.id });
    await expect(requirePageUser({ roles: ["OWNER"] })).resolves.toMatchObject({ id: owner.id });
  });

  it("redirige al login, al cambio de contraseña o por rol", async () => {
    const { cashier } = await createShop();

    signIn(null);
    await expect(requirePageUser()).rejects.toThrow("REDIRECT:/auth/login");

    signIn(cashier);
    await expect(requirePageUser({ roles: ["OWNER"] })).rejects.toThrow("REDIRECT:/");
    await expect(requirePageUser({ roles: ["OWNER"], fallback: "/ventas" })).rejects.toThrow("REDIRECT:/ventas");

    await db.user.update({ where: { id: cashier.id }, data: { mustChangePassword: true } });
    await expect(requirePageUser()).rejects.toThrow("REDIRECT:/auth/cambiar-contrasena");
  });
});

describe("administrador de la plataforma", () => {
  it("requirePlatformAdminPage devuelve al administrador válido", async () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", ADMIN_EMAIL);
    const admin = await createAdmin();
    signIn(admin);

    await expect(requirePlatformAdminPage()).resolves.toMatchObject({
      id: admin.id,
      role: "SUPERADMIN",
      businessId: null,
      email: ADMIN_EMAIL,
    });
  });

  it("requirePlatformAdminPage redirige al login, al cambio de contraseña o al inicio", async () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", ADMIN_EMAIL);
    const admin = await createAdmin();
    const { owner, cashier } = await createShop();

    signIn(null);
    await expect(requirePlatformAdminPage()).rejects.toThrow("REDIRECT:/auth/login");

    for (const user of [owner, cashier]) {
      signIn(user);
      await expect(requirePlatformAdminPage()).rejects.toThrow("REDIRECT:/");
    }

    await db.user.update({ where: { id: admin.id }, data: { mustChangePassword: true } });
    signIn(admin);
    await expect(requirePlatformAdminPage()).rejects.toThrow("REDIRECT:/auth/cambiar-contrasena");
  });

  it("sin la lista, o con el correo fuera de ella, el SUPERADMIN no tiene sesión", async () => {
    const admin = await createAdmin();
    signIn(admin);

    // Sin PLATFORM_ADMIN_EMAILS.
    await expect(requirePlatformAdminPage()).rejects.toThrow("REDIRECT:/auth/login");
    await expect(requireApiUser()).resolves.toBeNull();

    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "otro@billify.test");
    await expect(requirePlatformAdminPage()).rejects.toThrow("REDIRECT:/auth/login");
    await expect(requirePageUser()).rejects.toThrow("REDIRECT:/auth/login");
  });

  it("requirePageUser saca al administrador de las páginas de negocio", async () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", ADMIN_EMAIL);
    const admin = await createAdmin();
    signIn(admin);

    await expect(requirePageUser()).rejects.toThrow("REDIRECT:/admin");
    await expect(requirePageUser({ roles: ["OWNER"] })).rejects.toThrow("REDIRECT:/admin");
    await expect(requirePageUser({ roles: ["OWNER", "CASHIER"], fallback: "/ventas" })).rejects.toThrow(
      "REDIRECT:/admin",
    );
    // Sin negocio: tampoco tiene caja.
    await expect(hasOpenCashRegister()).resolves.toBe(false);
  });
});

describe("requireApiUser", () => {
  it("devuelve null sin sesión o con cambio de contraseña pendiente", async () => {
    const { cashier } = await createShop();

    signIn(null);
    await expect(requireApiUser()).resolves.toBeNull();

    signIn(cashier);
    await expect(requireApiUser()).resolves.toMatchObject({ id: cashier.id });

    await db.user.update({ where: { id: cashier.id }, data: { mustChangePassword: true } });
    await expect(requireApiUser()).resolves.toBeNull();
  });
});

describe("hasOpenCashRegister", () => {
  it("indica si el usuario tiene su propia caja abierta", async () => {
    const { business, owner, cashier } = await createShop();
    const orphan = await createUser({ businessId: null });
    await db.cashRegister.create({ data: { businessId: business.id, userId: cashier.id, openingBalance: 0 } });

    signIn(cashier);
    await expect(hasOpenCashRegister()).resolves.toBe(true);
    signIn(owner);
    await expect(hasOpenCashRegister()).resolves.toBe(false);
    signIn(orphan);
    await expect(hasOpenCashRegister()).resolves.toBe(false);
    signIn(null);
    await expect(hasOpenCashRegister()).resolves.toBe(false);
  });
});
