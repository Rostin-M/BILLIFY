import { describe, expect, it } from "vitest";

import { addDays, computeAccess } from "./access";
import {
  addMonths,
  applyApprovedPayment,
  applyVat,
  type BillingState,
  MIN_CHARGE_COP,
  isStandardPeriod,
  prorateUpgrade,
  quoteCheckout,
} from "./billing";

const NO_VAT = { rate: 0, pricesIncludeVat: true };
const NOW = new Date("2026-10-15T15:00:00Z");

function state(overrides: Partial<BillingState> = {}): BillingState {
  return {
    plan: "BASIC",
    billingCycle: "MONTHLY",
    currentPeriodStart: new Date("2026-10-01T15:00:00Z"),
    currentPeriodEnd: new Date("2026-10-31T15:00:00Z"),
    scheduledFrom: null,
    ...overrides,
  };
}

const accessFor = (s: BillingState, now = NOW, trialEndsAt: Date | null = null) =>
  computeAccess(
    { plan: s.plan, trialEndsAt, currentPeriodEnd: s.currentPeriodEnd, canceledAt: null },
    now,
  );

describe("addMonths", () => {
  it("suma meses de calendario y ajusta fin de mes", () => {
    expect(addMonths(new Date("2026-01-31T12:00:00Z"), 1).toISOString()).toBe("2026-02-28T12:00:00.000Z");
    expect(addMonths(new Date("2026-10-15T15:00:00Z"), 12).toISOString()).toBe("2027-10-15T15:00:00.000Z");
  });
});

describe("applyVat", () => {
  it("sin IVA cobra el precio en centavos", () => {
    expect(applyVat(29_900, NO_VAT)).toEqual({ amountInCents: 2_990_000, vatInCents: 0 });
  });
  it("con IVA incluido separa la porción de IVA sin cambiar el total", () => {
    expect(applyVat(29_900, { rate: 0.19, pricesIncludeVat: true })).toEqual({ amountInCents: 2_990_000, vatInCents: 477_395 });
  });
  it("con IVA aparte lo suma al total", () => {
    expect(applyVat(29_900, { rate: 0.19, pricesIncludeVat: false })).toEqual({ amountInCents: 3_558_100, vatInCents: 568_100 });
  });
});

describe("upgrade a mitad de mes", () => {
  it("cobra la diferencia proporcional a los días restantes, redondeada a 100", () => {
    // 16 de 30 días restantes: (49.900 − 29.900) × 16/30 = 10.666,67 → 10.700
    const amount = prorateUpgrade({
      from: "BASIC",
      to: "BUSINESS",
      cycle: "MONTHLY",
      periodStart: new Date("2026-10-01T15:00:00Z"),
      periodEnd: new Date("2026-10-31T15:00:00Z"),
      now: NOW,
    });
    expect(amount).toBe(10_700);
  });

  it("nunca cobra menos del mínimo", () => {
    const amount = prorateUpgrade({
      from: "BASIC",
      to: "BUSINESS",
      cycle: "MONTHLY",
      periodStart: new Date("2026-10-01T15:00:00Z"),
      periodEnd: new Date("2026-10-31T15:00:00Z"),
      now: new Date("2026-10-31T14:00:00Z"),
    });
    expect(amount).toBe(MIN_CHARGE_COP);
  });

  it("quoteCheckout lo marca como UPGRADE; al aprobarse cambia el plan ya y NO mueve el vencimiento", () => {
    const s = state();
    const quote = quoteCheckout({ state: s, access: accessFor(s), plan: "BUSINESS", cycle: "MONTHLY", vat: NO_VAT, now: NOW });
    expect(quote).toMatchObject({ ok: true, kind: "UPGRADE", baseAmount: 10_700 });

    const applied = applyApprovedPayment({ state: s, access: accessFor(s), kind: "UPGRADE", plan: "BUSINESS", cycle: "MONTHLY", now: NOW });
    expect(applied.update).toEqual({ plan: "BUSINESS" });
    expect(applied.periodEnd).toEqual(s.currentPeriodEnd);
  });

  it("subir de plan cambiando de ciclo se cobra como período completo (aplica al renovar)", () => {
    const s = state();
    const quote = quoteCheckout({ state: s, access: accessFor(s), plan: "PRO", cycle: "ANNUAL", vat: NO_VAT, now: NOW });
    expect(quote).toMatchObject({ ok: true, kind: "PERIOD", baseAmount: 799_000 });
  });
});

describe("applyApprovedPayment — renovaciones", () => {
  it("pagar antes de vencer extiende desde el vencimiento (no pierde días)", () => {
    const s = state();
    const applied = applyApprovedPayment({ state: s, access: accessFor(s), kind: "PERIOD", plan: "BASIC", cycle: "MONTHLY", now: NOW });
    expect(applied.periodStart).toEqual(s.currentPeriodEnd);
    expect(applied.update.currentPeriodEnd?.toISOString()).toBe("2026-11-30T15:00:00.000Z");
  });

  it("pagar en período de gracia extiende desde el vencimiento", () => {
    const s = state({ currentPeriodEnd: addDays(NOW, -1) });
    const applied = applyApprovedPayment({ state: s, access: accessFor(s), kind: "PERIOD", plan: "BASIC", cycle: "MONTHLY", now: NOW });
    expect(applied.periodStart).toEqual(s.currentPeriodEnd);
  });

  it("pagar estando bloqueado empieza desde el pago y reactiva de inmediato", () => {
    const s = state({ currentPeriodEnd: addDays(NOW, -10) });
    const access = accessFor(s);
    expect(access.mode).toBe("READ_ONLY");
    const applied = applyApprovedPayment({ state: s, access, kind: "PERIOD", plan: "BASIC", cycle: "MONTHLY", now: NOW });
    expect(applied.periodStart).toEqual(NOW);
    expect(applied.update.currentPeriodEnd?.toISOString()).toBe("2026-11-15T15:00:00.000Z");
    expect(computeAccess({ plan: "BASIC", trialEndsAt: null, currentPeriodEnd: applied.update.currentPeriodEnd!, canceledAt: null }, NOW).mode).toBe("FULL");
  });

  it("downgrade pagado queda programado para cuando termine el período actual", () => {
    const s = state({ plan: "PRO" });
    const applied = applyApprovedPayment({ state: s, access: accessFor(s), kind: "PERIOD", plan: "BASIC", cycle: "MONTHLY", now: NOW });
    expect(applied.update.plan).toBeUndefined();
    expect(applied.update).toMatchObject({ scheduledPlan: "BASIC", scheduledCycle: "MONTHLY", scheduledFrom: s.currentPeriodEnd });
  });

  it("pagar durante la prueba empieza al terminar la prueba", () => {
    const trialEnds = addDays(NOW, 4);
    const s = state({ plan: "BUSINESS", currentPeriodStart: null, currentPeriodEnd: null });
    const access = accessFor(s, NOW, trialEnds);
    expect(access.phase).toBe("TRIAL");
    const applied = applyApprovedPayment({ state: s, access, kind: "PERIOD", plan: "BUSINESS", cycle: "MONTHLY", now: NOW });
    expect(applied.periodStart).toEqual(trialEnds);
  });

  it("no deja pagar otro período si ya hay un cambio programado pendiente", () => {
    const s = state({ scheduledFrom: addDays(NOW, 5) });
    expect(quoteCheckout({ state: s, access: accessFor(s), plan: "PRO", cycle: "MONTHLY", vat: NO_VAT, now: NOW }).ok).toBe(false);
  });
});

describe("upgrade sobre períodos que no duran un ciclo (activación manual, períodos apilados)", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const upgrade = (cycle: "MONTHLY" | "ANNUAL", periodStart: Date, periodEnd: Date, now = NOW) =>
    prorateUpgrade({ from: "BASIC", to: "PRO", cycle, periodStart, periodEnd, now });

  it("un mes o un año de calendario exactos se siguen prorrateando sobre el ciclo", () => {
    // Octubre completo (31 días), faltan 16 días y 9 horas: 50.000 × 16,375/31 = 26.411 → 26.500
    expect(upgrade("MONTHLY", new Date("2026-10-01T00:00:00Z"), new Date("2026-11-01T00:00:00Z"))).toBe(26_500);
    // Año completo, falta exactamente la mitad... menos un día (2027 no es bisiesto): 500.000 × 182/365 → 249.400
    expect(
      upgrade("ANNUAL", new Date("2026-04-16T15:00:00Z"), new Date("2027-04-16T15:00:00Z"), NOW),
    ).toBe(Math.ceil((500_000 * 183) / 365 / 100) * 100);
    expect(isStandardPeriod(new Date("2026-01-31T10:00:00Z"), new Date("2026-02-28T10:00:00Z"), "MONTHLY")).toBe(true);
    expect(isStandardPeriod(new Date("2026-10-01T15:00:00Z"), new Date("2026-10-31T15:00:00Z"), "MONTHLY")).toBe(false);
    expect(isStandardPeriod(null, NOW, "MONTHLY")).toBe(false);
  });

  it("activación de 366 días en ciclo mensual: cobra por día, no la diferencia de un solo mes", () => {
    // (79.900 − 29.900) / 30 × 366 días = 610.000
    expect(upgrade("MONTHLY", NOW, new Date(NOW.getTime() + 366 * DAY))).toBe(610_000);
    // A mitad de camino: 183 días → 305.000
    expect(upgrade("MONTHLY", new Date(NOW.getTime() - 183 * DAY), new Date(NOW.getTime() + 183 * DAY))).toBe(305_000);
  });

  it("activación de 30 días con ciclo anual guardado: cobra 30 días, no la diferencia de un año", () => {
    // 50.000 / 30 × 30 = 50.000 (con la diferencia anual serían 500.000)
    expect(upgrade("ANNUAL", NOW, new Date(NOW.getTime() + 30 * DAY))).toBe(50_000);
    // Quedan 10 días y unas horas → 11 días: 18.333 → 18.400
    expect(upgrade("ANNUAL", new Date(NOW.getTime() - 19.5 * DAY), new Date(NOW.getTime() + 10.5 * DAY))).toBe(18_400);
  });

  it("períodos apilados (renovó antes de tiempo): cobra todos los días que quedan", () => {
    // Dos meses pagados, quedan 61 días: 50.000 / 30 × 61 = 101.666 → 101.700 (antes: 50.000 como máximo)
    expect(upgrade("MONTHLY", new Date("2026-10-15T15:00:00Z"), new Date("2026-12-15T15:00:00Z"))).toBe(101_700);
  });

  it("mantiene el mínimo, y no cobra si el plan no es superior o el período ya terminó", () => {
    const end = new Date(NOW.getTime() + 60 * 60 * 1000);
    expect(
      prorateUpgrade({ from: "BASIC", to: "BUSINESS", cycle: "MONTHLY", periodStart: new Date(NOW.getTime() - 9 * DAY), periodEnd: end, now: NOW }),
    ).toBe(MIN_CHARGE_COP);
    expect(
      prorateUpgrade({ from: "PRO", to: "BASIC", cycle: "ANNUAL", periodStart: NOW, periodEnd: new Date(NOW.getTime() + 30 * DAY), now: NOW }),
    ).toBe(0);
    expect(upgrade("MONTHLY", new Date(NOW.getTime() - 40 * DAY), new Date(NOW.getTime() - DAY))).toBe(0);
  });

  it("quoteCheckout: mismo ciclo = mejora por días; otro ciclo = período completo al terminar lo vigente", () => {
    const granted = state({ billingCycle: "ANNUAL", currentPeriodStart: NOW, currentPeriodEnd: new Date(NOW.getTime() + 30 * DAY) });
    const quote = (cycle: "MONTHLY" | "ANNUAL") =>
      quoteCheckout({ state: granted, access: accessFor(granted), plan: "PRO", cycle, vat: NO_VAT, now: NOW });

    expect(quote("ANNUAL")).toMatchObject({ ok: true, kind: "UPGRADE", baseAmount: 50_000 });
    expect(quote("MONTHLY")).toMatchObject({ ok: true, kind: "PERIOD", baseAmount: 79_900 });
  });
});
