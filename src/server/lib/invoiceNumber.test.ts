import type { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bogotaYear, formatInvoiceNumber, nextInvoiceNumber } from "./invoiceNumber";

function txWith(...results: { last_number: number }[][]) {
  const queryRaw = vi.fn();
  for (const r of results) queryRaw.mockResolvedValueOnce(r);
  return { tx: { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient, queryRaw };
}

describe("formatInvoiceNumber", () => {
  it("rellena el consecutivo a 5 dígitos", () => {
    expect(formatInvoiceNumber(2026, 17)).toBe("F-2026-00017");
    expect(formatInvoiceNumber(2026, 123456)).toBe("F-2026-123456");
  });
});

describe("bogotaYear", () => {
  it("usa el año de Bogotá en el cambio de año", () => {
    expect(bogotaYear(new Date("2027-01-01T03:00:00Z"))).toBe(2026);
    expect(bogotaYear(new Date("2027-01-01T05:00:00Z"))).toBe(2027);
  });
});

describe("nextInvoiceNumber", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("usa el consecutivo existente del año", async () => {
    const { tx, queryRaw } = txWith([{ last_number: 42 }]);
    await expect(nextInvoiceNumber(tx, "b1")).resolves.toBe("F-2026-00042");
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("crea el consecutivo del año si no existe", async () => {
    const { tx, queryRaw } = txWith([], [{ last_number: 1 }]);
    await expect(nextInvoiceNumber(tx, "b1")).resolves.toBe("F-2026-00001");
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it("lanza si no logra reservar un número", async () => {
    const { tx } = txWith([], []);
    await expect(nextInvoiceNumber(tx, "b1")).rejects.toThrow("No se pudo reservar el número de factura.");
  });
});
