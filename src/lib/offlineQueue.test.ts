import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FOREIGN_SALE_TTL_MS,
  countOwnPendingSales,
  discardLegacySales,
  isLegacy,
  isOwnedBy,
  loadQueueFor,
  queueSale,
  removePendingSale,
  replayPendingSales,
  type PendingSale,
  type SyncFn,
} from "./offlineQueue";

const me = { userId: "u1", businessId: "b1" };
const other = { userId: "u2", businessId: "b1" };

let seq = 0;
function sale(owner: { userId?: string; businessId?: string } | null, createdAt = new Date()): PendingSale {
  seq += 1;
  return {
    localId: `local-${seq}`,
    items: [{ productId: "p1", quantity: 1 }],
    paymentMethod: "CASH",
    idempotencyKey: `key-${seq}`,
    createdAt: createdAt.toISOString(),
    ...(owner ?? {}),
  };
}

/** Guarda una entrada sin pasar por queueSale (p. ej. de versiones antiguas, sin dueño). */
async function putRaw(entry: PendingSale) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("billify_offline", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("pending_sales", { keyPath: "localId" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error!);
  });
  await new Promise<void>((resolve) => {
    const tx = db.transaction("pending_sales", "readwrite");
    tx.objectStore("pending_sales").put(entry);
    tx.oncomplete = () => resolve();
  });
  db.close();
}

beforeEach(() => {
  // Base IndexedDB nueva y vacía para cada test.
  globalThis.indexedDB = new IDBFactory();
});

describe("dueño de las ventas pendientes", () => {
  it("isOwnedBy e isLegacy", () => {
    expect(isOwnedBy(sale(me), me)).toBe(true);
    expect(isOwnedBy(sale(other), me)).toBe(false);
    expect(isLegacy(sale(null))).toBe(true);
    expect(isLegacy(sale({ userId: "u1" }))).toBe(true);
    expect(isLegacy(sale(me))).toBe(false);
  });

  it("queueSale exige usuario y negocio", async () => {
    await expect(queueSale(sale(null))).rejects.toThrow("La venta pendiente debe indicar usuario y negocio");
  });
});

describe("loadQueueFor", () => {
  it("separa las propias de las heredadas y oculta las de otros usuarios", async () => {
    const mine = sale(me, new Date("2026-01-01T10:00:00Z"));
    const mineEarlier = sale(me, new Date("2026-01-01T09:00:00Z"));
    await queueSale(mine);
    await queueSale(mineEarlier);
    await queueSale(sale(other));
    const legacy = sale(null);
    await putRaw(legacy);

    const { own, legacy: legacyList } = await loadQueueFor(me);

    expect(own.map((s) => s.localId)).toEqual([mineEarlier.localId, mine.localId]);
    expect(legacyList.map((s) => s.localId)).toEqual([legacy.localId]);
    await expect(countOwnPendingSales(me)).resolves.toBe(2);
    // Las del otro usuario siguen guardadas para cuando vuelva a iniciar sesión.
    await expect(countOwnPendingSales(other)).resolves.toBe(1);
  });

  it("descarta las ajenas o sin dueño con más de 72 h, nunca las propias", async () => {
    const old = new Date(Date.now() - FOREIGN_SALE_TTL_MS - 60_000);
    await queueSale(sale(me, old));
    await queueSale(sale(other, old));
    await putRaw(sale(null, old));
    await putRaw({ ...sale(null), createdAt: "fecha ilegible" });

    const { own, legacy } = await loadQueueFor(me);

    expect(own).toHaveLength(1);
    expect(legacy).toHaveLength(0);
    await expect(countOwnPendingSales(other)).resolves.toBe(0);
  });

  it("removePendingSale y discardLegacySales borran entradas", async () => {
    const mine = sale(me);
    await queueSale(mine);
    await putRaw(sale(null));
    await putRaw(sale(null));

    await expect(discardLegacySales()).resolves.toBe(2);
    await removePendingSale(mine.localId);

    await expect(loadQueueFor(me)).resolves.toEqual({ own: [], legacy: [] });
  });
});

describe("replayPendingSales", () => {
  it("reenvía solo las propias, en orden y sin metadatos locales", async () => {
    const first = sale(me, new Date("2026-01-01T08:00:00Z"));
    const second = { ...sale(me, new Date("2026-01-01T09:00:00Z")), note: "fiado", customerId: "c1" };
    await queueSale(second);
    await queueSale(first);
    await queueSale(sale(other));
    const syncFn = vi.fn<SyncFn>(async () => undefined);

    await expect(replayPendingSales(me, syncFn)).resolves.toEqual([]);

    expect(syncFn.mock.calls.map(([input]) => input)).toEqual([
      { items: first.items, paymentMethod: "CASH", idempotencyKey: first.idempotencyKey, customerId: undefined, note: undefined, receiptPath: undefined },
      { items: second.items, paymentMethod: "CASH", idempotencyKey: second.idempotencyKey, customerId: "c1", note: "fiado", receiptPath: undefined },
    ]);
    await expect(countOwnPendingSales(me)).resolves.toBe(0);
    await expect(countOwnPendingSales(other)).resolves.toBe(1);
  });

  it("conserva las que fallan y reporta el error", async () => {
    await queueSale(sale(me));
    await queueSale(sale(me));
    const syncFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Stock insuficiente"))
      .mockRejectedValueOnce("sin mensaje");

    const errors = await replayPendingSales(me, syncFn);

    expect(errors.map((e) => e.message)).toEqual(["Stock insuficiente", "Error al sincronizar"]);
    expect(errors[0]!.time).toMatch(/\d/);
    await expect(countOwnPendingSales(me)).resolves.toBe(2);
  });

  it("no ejecuta dos sincronizaciones a la vez", async () => {
    await queueSale(sale(me));
    let release!: () => void;
    const syncFn = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));

    const a = replayPendingSales(me, syncFn);
    const b = replayPendingSales(me, syncFn);
    await vi.waitFor(() => expect(syncFn).toHaveBeenCalledTimes(1));
    release();

    expect(await a).toBe(await b);
    expect(syncFn).toHaveBeenCalledTimes(1);
  });
});
