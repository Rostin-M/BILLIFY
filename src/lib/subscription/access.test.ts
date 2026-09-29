import { describe, expect, it } from "vitest";

import { acceptsOfflineSale, addDays, computeAccess, type SubscriptionDates } from "./access";
import { GRACE_DAYS, OFFLINE_SYNC_TOLERANCE_MS } from "./catalog";

const NOW = new Date("2026-10-15T15:00:00Z");
const HOUR = 60 * 60 * 1000;

const trial = (endsAt: Date | null): SubscriptionDates => ({
  plan: "BUSINESS",
  trialEndsAt: endsAt,
  currentPeriodEnd: null,
  canceledAt: null,
});

const paid = (endsAt: Date, canceledAt: Date | null = null): SubscriptionDates => ({
  plan: "BASIC",
  trialEndsAt: addDays(endsAt, -40),
  currentPeriodEnd: endsAt,
  canceledAt,
});

describe("computeAccess — prueba gratis", () => {
  it("da acceso completo mientras la prueba está vigente", () => {
    const access = computeAccess(trial(addDays(NOW, 3)), NOW);
    expect(access).toMatchObject({ phase: "TRIAL", mode: "FULL", daysLeft: 3 });
  });

  it("al terminar la prueba pasa directo a solo lectura, sin gracia", () => {
    const endsAt = new Date(NOW.getTime() - HOUR);
    const access = computeAccess(trial(endsAt), NOW);
    expect(access).toMatchObject({ phase: "READ_ONLY", mode: "READ_ONLY", blockedAt: endsAt });
  });

  it("sin fecha de fin falla cerrado", () => {
    expect(computeAccess(trial(null), NOW).mode).toBe("READ_ONLY");
  });
});

describe("computeAccess — período pagado (vencimiento)", () => {
  it("vigente → ACTIVE", () => {
    expect(computeAccess(paid(addDays(NOW, 10)), NOW)).toMatchObject({ phase: "ACTIVE", mode: "FULL", daysLeft: 10 });
  });

  it("vencido hace 1 día → gracia con acceso completo", () => {
    const access = computeAccess(paid(addDays(NOW, -1)), NOW);
    expect(access).toMatchObject({ phase: "PAST_DUE", mode: "FULL", graceDaysLeft: GRACE_DAYS - 1 });
  });

  it("el bloqueo ocurre exactamente al terminar la gracia", () => {
    const endsAt = addDays(NOW, -GRACE_DAYS);
    const justBefore = new Date(NOW.getTime() - 1);
    expect(computeAccess(paid(endsAt), justBefore).mode).toBe("FULL");
    expect(computeAccess(paid(endsAt), NOW)).toMatchObject({ phase: "READ_ONLY", blockedAt: NOW });
  });

  it("cancelada: acceso hasta el fin del período y luego solo lectura sin gracia", () => {
    const endsAt = addDays(NOW, 2);
    expect(computeAccess(paid(endsAt, NOW), NOW)).toMatchObject({ phase: "CANCELED", mode: "FULL" });
    expect(computeAccess(paid(endsAt, NOW), addDays(endsAt, 1))).toMatchObject({ phase: "READ_ONLY" });
  });
});

describe("acceptsOfflineSale", () => {
  const blockedAccess = computeAccess(trial(NOW), NOW); // bloqueado justo ahora
  const later = (ms: number) => new Date(NOW.getTime() + ms);

  it("acepta una venta hecha antes del bloqueo que llega dentro de la tolerancia", () => {
    expect(
      acceptsOfflineSale({
        access: blockedAccess,
        offlineCreatedAt: new Date(NOW.getTime() - HOUR),
        now: later(2 * HOUR),
        toleranceMs: OFFLINE_SYNC_TOLERANCE_MS,
      }),
    ).toBe(true);
  });

  it("rechaza una venta hecha después del bloqueo", () => {
    expect(
      acceptsOfflineSale({
        access: blockedAccess,
        offlineCreatedAt: later(HOUR),
        now: later(2 * HOUR),
        toleranceMs: OFFLINE_SYNC_TOLERANCE_MS,
      }),
    ).toBe(false);
  });

  it("rechaza una venta anterior al bloqueo si llega pasado el día de tolerancia", () => {
    expect(
      acceptsOfflineSale({
        access: blockedAccess,
        offlineCreatedAt: new Date(NOW.getTime() - HOUR),
        now: later(OFFLINE_SYNC_TOLERANCE_MS + HOUR),
        toleranceMs: OFFLINE_SYNC_TOLERANCE_MS,
      }),
    ).toBe(false);
  });

  it("rechaza fechas del futuro (reloj del dispositivo manipulado)", () => {
    expect(
      acceptsOfflineSale({
        access: computeAccess(trial(addDays(NOW, -1)), NOW),
        offlineCreatedAt: later(HOUR),
        now: NOW,
        toleranceMs: OFFLINE_SYNC_TOLERANCE_MS,
      }),
    ).toBe(false);
  });
});
