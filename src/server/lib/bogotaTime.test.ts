import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bogotaStartOfDay, fillDayRange, getPeriodRangeBogota, toBogotaDateKey } from "./bogotaTime";

describe("toBogotaDateKey", () => {
  it("usa el día de Bogotá (UTC-5), no el de UTC", () => {
    expect(toBogotaDateKey(new Date("2026-03-10T04:59:59Z"))).toBe("2026-03-09");
    expect(toBogotaDateKey(new Date("2026-03-10T05:00:00Z"))).toBe("2026-03-10");
  });
});

describe("bogotaStartOfDay", () => {
  it("devuelve la medianoche de Bogotá expresada en UTC", () => {
    expect(bogotaStartOfDay(new Date("2026-03-10T02:00:00Z")).toISOString()).toBe(
      "2026-03-09T05:00:00.000Z",
    );
    expect(bogotaStartOfDay(new Date("2026-03-10T23:00:00Z")).toISOString()).toBe(
      "2026-03-10T05:00:00.000Z",
    );
  });
});

describe("getPeriodRangeBogota", () => {
  const now = new Date("2026-03-10T15:30:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("today: desde la medianoche de hoy hasta ahora", () => {
    const { from, to } = getPeriodRangeBogota("today");
    expect(from.toISOString()).toBe("2026-03-10T05:00:00.000Z");
    expect(to).toEqual(now);
  });

  it("week: los últimos 7 días incluyendo hoy", () => {
    expect(getPeriodRangeBogota("week").from.toISOString()).toBe("2026-03-04T05:00:00.000Z");
  });

  it("month: desde el primer día del mes", () => {
    expect(getPeriodRangeBogota("month").from.toISOString()).toBe("2026-03-01T05:00:00.000Z");
  });
});

describe("fillDayRange", () => {
  it("genera una clave por día, incluyendo ambos extremos", () => {
    expect(
      fillDayRange(new Date("2026-02-27T05:00:00Z"), new Date("2026-03-02T10:00:00Z")),
    ).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  });

  it("devuelve vacío si el rango está invertido", () => {
    expect(
      fillDayRange(new Date("2026-03-02T05:00:00Z"), new Date("2026-03-01T05:00:00Z")),
    ).toEqual([]);
  });
});
