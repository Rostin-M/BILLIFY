// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { signOut } from "next-auth/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pendingSalesBeforeSignOut, signOutAndClear } from "./clientSignOut";
import { queueSale, type SyncFn } from "./offlineQueue";

vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const owner = { userId: "u1", businessId: "b1" };

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
}

async function queueOne() {
  await queueSale({
    ...owner,
    localId: crypto.randomUUID(),
    items: [{ productId: "p1", quantity: 1 }],
    paymentMethod: "CASH",
    createdAt: new Date().toISOString(),
  });
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  setOnline(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(signOut).mockClear();
});

describe("pendingSalesBeforeSignOut", () => {
  it("intenta sincronizar antes de salir y devuelve lo que sigue pendiente", async () => {
    await queueOne();
    await queueOne();
    const syncFn = vi.fn<SyncFn>().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("falló"));

    await expect(pendingSalesBeforeSignOut(owner, syncFn)).resolves.toBe(1);
    expect(syncFn).toHaveBeenCalledTimes(2);
  });

  it("sin conexión o sin syncFn solo cuenta las pendientes", async () => {
    await queueOne();
    const syncFn = vi.fn<SyncFn>();
    setOnline(false);

    await expect(pendingSalesBeforeSignOut(owner, syncFn)).resolves.toBe(1);
    await expect(pendingSalesBeforeSignOut(owner)).resolves.toBe(1);
    expect(syncFn).not.toHaveBeenCalled();
  });

  it("devuelve 0 si IndexedDB no está disponible", async () => {
    // @ts-expect-error: simula un navegador sin IndexedDB
    globalThis.indexedDB = undefined;
    await expect(pendingSalesBeforeSignOut(owner)).resolves.toBe(0);
  });
});

describe("signOutAndClear", () => {
  it("borra borradores del negocio y cachés, conserva otras claves y cierra sesión", async () => {
    localStorage.setItem("billify_quick_cart", "[1]");
    localStorage.setItem("billify_invoice_note", "nota");
    localStorage.setItem("theme", "dark");
    sessionStorage.setItem("x", "1");
    const deleted: string[] = [];
    vi.stubGlobal("caches", {
      keys: async () => ["v1", "v2"],
      delete: async (key: string) => deleted.push(key) > 0,
    });

    await signOutAndClear("/auth/login");

    expect(localStorage.getItem("billify_quick_cart")).toBeNull();
    expect(localStorage.getItem("billify_invoice_note")).toBeNull();
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(sessionStorage).toHaveLength(0);
    expect(deleted).toEqual(["v1", "v2"]);
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/auth/login" });
  });

  it("cierra sesión aunque el almacenamiento esté bloqueado", async () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "clear").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.stubGlobal("caches", {
      keys: async () => {
        throw new Error("sin permiso");
      },
    });

    await signOutAndClear("/");

    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
  });
});
