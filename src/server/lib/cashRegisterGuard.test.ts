import type { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assertCashRegisterNotStale, resolveSaleCashRegisterId } from "./cashRegisterGuard";

function dbWithRegisters(...registers: ({ openedAt: Date } | null)[]) {
  const findFirst = vi.fn();
  for (const r of registers) findFirst.mockResolvedValueOnce(r);
  return { db: { cashRegister: { findFirst } } as unknown as Prisma.TransactionClient, findFirst };
}

function txWithRows(...results: { id: string }[][]) {
  const queryRaw = vi.fn();
  for (const r of results) queryRaw.mockResolvedValueOnce(r);
  return { tx: { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient, queryRaw };
}

describe("assertCashRegisterNotStale", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 10 a. m. del 10/mar en Bogotá
    vi.setSystemTime(new Date("2026-03-10T15:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("no hace nada si no hay caja abierta", async () => {
    const { db, findFirst } = dbWithRegisters(null, null);
    await expect(assertCashRegisterNotStale(db, "b1", "u1")).resolves.toBeUndefined();
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it("permite una caja abierta hoy (hora de Bogotá)", async () => {
    const { db, findFirst } = dbWithRegisters({ openedAt: new Date("2026-03-10T05:30:00Z") });
    await expect(assertCashRegisterNotStale(db, "b1", "u1")).resolves.toBeUndefined();
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("bloquea si la caja del negocio viene de un día anterior", async () => {
    // 11 p. m. del 9/mar en Bogotá, aunque en UTC ya sea 10/mar
    const { db } = dbWithRegisters(null, { openedAt: new Date("2026-03-10T04:00:00Z") });
    await expect(assertCashRegisterNotStale(db, "b1", "u1")).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("resolveSaleCashRegisterId", () => {
  it("prefiere la caja propia del vendedor", async () => {
    const { tx, queryRaw } = txWithRows([{ id: "own" }]);
    await expect(resolveSaleCashRegisterId(tx, "b1", "u1")).resolves.toBe("own");
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("usa la única caja abierta del negocio", async () => {
    const { tx } = txWithRows([], [{ id: "shared" }]);
    await expect(resolveSaleCashRegisterId(tx, "b1", "u1")).resolves.toBe("shared");
  });

  it("no adivina si hay varias cajas abiertas o ninguna", async () => {
    await expect(
      resolveSaleCashRegisterId(txWithRows([], [{ id: "a" }, { id: "b" }]).tx, "b1", "u1"),
    ).resolves.toBeNull();
    await expect(resolveSaleCashRegisterId(txWithRows([], []).tx, "b1", "u1")).resolves.toBeNull();
  });
});
