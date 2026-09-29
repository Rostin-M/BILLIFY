// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { act, renderHook, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { queueSale, type PendingSale, type SyncFn } from "~/lib/offlineQueue";
import { useOfflineQueue } from "./useOfflineQueue";

const owner = { userId: "u1", businessId: "b1" };
const saleInput = { items: [{ productId: "p1", quantity: 2 }], paymentMethod: "CASH" as const };

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  setOnline(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useOfflineQueue", () => {
  it("encola ventas sin conexión y las sincroniza al volver la red", async () => {
    setOnline(false);
    const syncFn = vi.fn<SyncFn>(async () => undefined);
    const { result } = renderHook(() => useOfflineQueue(syncFn, owner));
    expect(result.current.isOnline).toBe(false);

    await act(() => result.current.addToQueue(saleInput));
    expect(result.current.pendingCount).toBe(1);
    expect(syncFn).not.toHaveBeenCalled();

    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(result.current.isOnline).toBe(true);
    expect(result.current.isSyncing).toBe(false);
    expect(syncFn).toHaveBeenCalledWith(expect.objectContaining({ items: saleInput.items, paymentMethod: "CASH" }));
  });

  it("al montar con conexión reenvía las ventas pendientes y reporta errores", async () => {
    await queueSale({ ...saleInput, ...owner, localId: "a", createdAt: new Date().toISOString() });
    const syncFn = vi.fn<SyncFn>(async () => {
      throw new Error("Stock insuficiente");
    });

    const { result } = renderHook(() => useOfflineQueue(syncFn, owner));

    await waitFor(() => expect(result.current.syncErrors).toHaveLength(1));
    expect(result.current.syncErrors[0]!.message).toBe("Stock insuficiente");
    expect(result.current.pendingCount).toBe(1);
  });

  it("muestra y descarta ventas heredadas sin dueño", async () => {
    const legacy = { ...saleInput, localId: "old", createdAt: new Date().toISOString() } as PendingSale;
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open("billify_offline", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("pending_sales", { keyPath: "localId" });
      req.onsuccess = () => resolve(req.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("pending_sales", "readwrite");
      tx.objectStore("pending_sales").put(legacy);
      tx.oncomplete = () => resolve();
    });
    db.close();
    setOnline(false);

    const { result } = renderHook(() => useOfflineQueue(vi.fn<SyncFn>(), owner));

    await waitFor(() => expect(result.current.legacySales).toHaveLength(1));
    expect(result.current.legacySales[0]).toMatchObject({ localId: "old", itemCount: 1, paymentMethod: "CASH" });

    await act(() => result.current.discardLegacy());
    expect(result.current.legacySales).toEqual([]);
  });

  it("marca la pérdida de conexión y deja de escuchar al desmontar", async () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { result, unmount } = renderHook(() => useOfflineQueue(vi.fn<SyncFn>(), owner));
    await waitFor(() => expect(result.current.isSyncing).toBe(false));

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current.isOnline).toBe(false);

    unmount();
    expect(remove).toHaveBeenCalledWith("online", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("offline", expect.any(Function));
  });

  it("sin IndexedDB no falla y reporta cero pendientes", async () => {
    // @ts-expect-error: simula un navegador sin IndexedDB
    globalThis.indexedDB = undefined;

    const { result } = renderHook(() => useOfflineQueue(vi.fn<SyncFn>(), owner));

    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    await act(() => result.current.processQueue());
    expect(result.current.syncErrors).toEqual([]);
  });
});
