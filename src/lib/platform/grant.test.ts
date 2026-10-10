import { describe, expect, it } from "vitest";

import { addDays, computeAccess, type SubscriptionPhase } from "~/lib/subscription/access";
import { applyApprovedPayment, type BillingState, dueScheduledChange } from "~/lib/subscription/billing";
import { type BillingCycle, GRACE_DAYS, PLAN_CODES, type PlanCode } from "~/lib/subscription/catalog";

import { GRANT_MAX_DAYS, GRANT_STARTS, type GrantStart } from "./contract";
import { computeGrantPeriod } from "./grant";

const NOW = new Date("2026-10-15T15:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const day = (offset: number) => addDays(NOW, offset);

/** Fila de suscripción reducida a lo que importa para las fechas. */
type Sub = {
  plan: PlanCode;
  billingCycle: BillingCycle;
  trialEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  scheduledPlan: PlanCode | null;
  scheduledCycle: BillingCycle | null;
  scheduledFrom: Date | null;
  canceledAt: Date | null;
};

function sub(overrides: Partial<Sub> = {}): Sub {
  return {
    plan: "BUSINESS",
    billingCycle: "MONTHLY",
    trialEndsAt: day(-40),
    currentPeriodStart: null,
    currentPeriodEnd: null,
    scheduledPlan: null,
    scheduledCycle: null,
    scheduledFrom: null,
    canceledAt: null,
    ...overrides,
  };
}

/** Un negocio por fase, tal como lo vería el servidor. */
const SUBS = {
  TRIAL: sub({ trialEndsAt: day(3) }),
  ACTIVE: sub({ currentPeriodStart: day(-20), currentPeriodEnd: day(10) }),
  CANCELED: sub({ currentPeriodStart: day(-20), currentPeriodEnd: day(10), canceledAt: day(-5) }),
  PAST_DUE: sub({ currentPeriodStart: day(-31), currentPeriodEnd: day(-1) }),
  READ_ONLY: sub({ currentPeriodStart: day(-40), currentPeriodEnd: day(-10) }),
} satisfies Record<SubscriptionPhase, Sub>;

const READ_ONLY_VARIANTS: [string, Sub][] = [
  ["prueba vencida", sub({ trialEndsAt: day(-1) })],
  ["sin fechas", sub({ trialEndsAt: null })],
  ["gracia terminada", SUBS.READ_ONLY],
  ["cancelada y vencida", sub({ currentPeriodStart: day(-31), currentPeriodEnd: day(-1), canceledAt: day(-9) })],
];

const accessOf = (s: Sub, now = NOW) => computeAccess(s, now);

/** Igual que el servidor: primero se aplica en memoria un cambio programado que ya empezó. */
function stateOf(s: Sub, now = NOW): BillingState {
  const due = dueScheduledChange(s, now);
  return {
    plan: due?.plan ?? s.plan,
    billingCycle: due?.billingCycle ?? s.billingCycle,
    currentPeriodStart: due?.currentPeriodStart ?? s.currentPeriodStart,
    currentPeriodEnd: s.currentPeriodEnd,
    scheduledFrom: due ? null : s.scheduledFrom,
  };
}

function grant(s: Sub, input: { plan?: PlanCode; days?: number; start?: GrantStart }, now = NOW) {
  const state = stateOf(s, now);
  return computeGrantPeriod({
    state,
    access: computeAccess({ ...s, plan: state.plan }, now),
    plan: input.plan ?? s.plan,
    days: input.days ?? 30,
    start: input.start ?? "AFTER_CURRENT",
    now,
  });
}

function granted(...args: Parameters<typeof grant>) {
  const result = grant(...args);
  if (!result.ok) throw new Error(`Se esperaba una activación válida: ${result.reason}`);
  return result;
}

/** La suscripción después de guardar `update`. */
const after = (s: Sub, update: object): Sub => ({ ...s, ...update });

const CLEARED_SCHEDULE = { scheduledPlan: null, scheduledCycle: null, scheduledFrom: null };

describe("computeGrantPeriod: al final de lo vigente (AFTER_CURRENT)", () => {
  it("en prueba, mismo plan: los días empiezan cuando termina la prueba", () => {
    const result = granted(SUBS.TRIAL, { days: 30 });

    expect(result).toEqual({
      ok: true,
      update: {
        plan: "BUSINESS",
        currentPeriodStart: day(3),
        currentPeriodEnd: day(33),
        canceledAt: null,
        ...CLEARED_SCHEDULE,
      },
      periodStart: day(3),
      periodEnd: day(33),
      scheduled: false,
      lostDays: 0,
    });
    expect(accessOf(after(SUBS.TRIAL, result.update))).toMatchObject({ phase: "ACTIVE", daysLeft: 33 });
  });

  it("en prueba, plan distinto: queda programado y sigue con el plan de la prueba hasta que termine", () => {
    const result = granted(SUBS.TRIAL, { plan: "BASIC", days: 30 });

    expect(result).toMatchObject({ periodStart: day(3), periodEnd: day(33), scheduled: true, lostDays: 0 });
    expect(result.update).toEqual({
      currentPeriodEnd: day(33),
      canceledAt: null,
      scheduledPlan: "BASIC",
      scheduledCycle: "MONTHLY",
      scheduledFrom: day(3),
    });
    // Hoy sigue en BUSINESS; el día que empieza el período ya es BASIC.
    const saved = after(SUBS.TRIAL, result.update);
    expect(stateOf(saved).plan).toBe("BUSINESS");
    expect(stateOf(saved, day(3))).toMatchObject({ plan: "BASIC", currentPeriodStart: day(3), scheduledFrom: null });
    expect(accessOf(saved, day(32))).toMatchObject({ phase: "ACTIVE", mode: "FULL" });
  });

  it("activo, mismo plan: extiende el vencimiento sin mover el inicio del período", () => {
    const result = granted(SUBS.ACTIVE, { days: 45 });

    expect(result).toMatchObject({ periodStart: day(10), periodEnd: day(55), scheduled: false, lostDays: 0 });
    expect(result.update).toEqual({
      plan: "BUSINESS",
      currentPeriodStart: day(-20),
      currentPeriodEnd: day(55),
      canceledAt: null,
      ...CLEARED_SCHEDULE,
    });
  });

  it.each(["BASIC", "PRO"] as const)("activo, plan distinto (%s): programado al terminar el período", (plan) => {
    const result = granted(SUBS.ACTIVE, { plan, days: 30 });

    expect(result).toMatchObject({ periodStart: day(10), periodEnd: day(40), scheduled: true });
    expect(result.update).toEqual({
      currentPeriodEnd: day(40),
      canceledAt: null,
      scheduledPlan: plan,
      scheduledCycle: "MONTHLY",
      scheduledFrom: day(10),
    });
    // No toca el plan ni el inicio actuales.
    expect(result.update).not.toHaveProperty("plan");
    expect(result.update).not.toHaveProperty("currentPeriodStart");
  });

  it("cancelado: suma al final de lo pagado y reactiva la suscripción", () => {
    const result = granted(SUBS.CANCELED, { days: 30 });

    expect(result).toMatchObject({ periodStart: day(10), periodEnd: day(40), scheduled: false });
    expect(result.update.canceledAt).toBeNull();
    expect(accessOf(after(SUBS.CANCELED, result.update))).toMatchObject({ phase: "ACTIVE", daysLeft: 40 });
  });

  it("en gracia: los días cuentan desde la fecha en que venció", () => {
    const result = granted(SUBS.PAST_DUE, { days: 30 });

    expect(result).toMatchObject({ periodStart: day(-1), periodEnd: day(29), scheduled: false, lostDays: 0 });
    expect(result.update).toMatchObject({ currentPeriodStart: day(-1), currentPeriodEnd: day(29) });
    expect(accessOf(after(SUBS.PAST_DUE, result.update))).toMatchObject({ phase: "ACTIVE", daysLeft: 29 });
  });

  it("en gracia, plan distinto: aplica de inmediato (el período nuevo ya empezó)", () => {
    const result = granted(SUBS.PAST_DUE, { plan: "PRO", days: 30 });

    expect(result.scheduled).toBe(false);
    expect(result.update).toMatchObject({ plan: "PRO", currentPeriodStart: day(-1), ...CLEARED_SCHEDULE });
  });

  it("en gracia con pocos días: si contados desde el vencimiento ya pasaron, cuentan desde hoy", () => {
    const expired = sub({ currentPeriodStart: day(-32), currentPeriodEnd: day(-2) });

    // 1 día desde hace 2 días ya habría terminado; 2 días terminarían justo ahora.
    for (const days of [1, 2]) {
      const result = granted(expired, { days });
      expect(result).toMatchObject({ periodStart: NOW, periodEnd: day(days) });
      expect(accessOf(after(expired, result.update))).toMatchObject({ phase: "ACTIVE", daysLeft: days });
    }
    // 3 días sí alcanzan: queda 1 día real.
    expect(granted(expired, { days: 3 })).toMatchObject({ periodStart: day(-2), periodEnd: day(1) });
  });

  it.each(READ_ONLY_VARIANTS)("solo lectura (%s): empiezan hoy y recupera el acceso completo", (_name, s) => {
    expect(accessOf(s).mode).toBe("READ_ONLY");
    const result = granted(s, { plan: "BASIC", days: 30 });

    expect(result).toEqual({
      ok: true,
      update: {
        plan: "BASIC",
        currentPeriodStart: NOW,
        currentPeriodEnd: day(30),
        canceledAt: null,
        ...CLEARED_SCHEDULE,
      },
      periodStart: NOW,
      periodEnd: day(30),
      scheduled: false,
      lostDays: 0,
    });
    expect(accessOf(after(s, result.update))).toMatchObject({ phase: "ACTIVE", mode: "FULL", daysLeft: 30 });
  });

  it("rechaza si ya hay un cambio de plan programado que no ha empezado", () => {
    const pending = sub({
      currentPeriodStart: day(-20),
      currentPeriodEnd: day(40),
      scheduledPlan: "PRO",
      scheduledCycle: "MONTHLY",
      scheduledFrom: day(10),
    });

    for (const plan of PLAN_CODES) {
      expect(grant(pending, { plan })).toEqual({
        ok: false,
        reason: 'Este negocio ya tiene un cambio de plan programado. Usa "desde hoy" para reemplazarlo.',
      });
    }
  });

  it("un cambio programado que ya empezó cuenta como el plan actual", () => {
    const due = sub({
      plan: "BUSINESS",
      currentPeriodStart: day(-40),
      currentPeriodEnd: day(20),
      scheduledPlan: "PRO",
      scheduledCycle: "ANNUAL",
      scheduledFrom: day(-10),
    });

    // Mismo plan que el efectivo (PRO): solo extiende y limpia lo programado.
    const same = granted(due, { plan: "PRO", days: 30 });
    expect(same).toMatchObject({ periodStart: day(20), periodEnd: day(50), scheduled: false });
    expect(same.update).toMatchObject({ plan: "PRO", currentPeriodStart: day(-10), ...CLEARED_SCHEDULE });

    // Volver al plan anterior (BUSINESS) es un plan distinto al efectivo: se programa con el ciclo efectivo.
    const other = granted(due, { plan: "BUSINESS", days: 30 });
    expect(other.scheduled).toBe(true);
    expect(other.update).toMatchObject({ scheduledPlan: "BUSINESS", scheduledCycle: "ANNUAL", scheduledFrom: day(20) });
  });

  it("empieza donde empezaría un pago de período por pasarela y cambia los mismos campos", () => {
    const cases: [string, Sub, PlanCode][] = [
      ["prueba", SUBS.TRIAL, "BUSINESS"],
      ["prueba, otro plan", SUBS.TRIAL, "PRO"],
      ["activo", SUBS.ACTIVE, "BUSINESS"],
      ["activo, otro plan", SUBS.ACTIVE, "BASIC"],
      ["cancelado", SUBS.CANCELED, "BUSINESS"],
      ["gracia", SUBS.PAST_DUE, "BUSINESS"],
      ["gracia, otro plan", SUBS.PAST_DUE, "PRO"],
      ["solo lectura", SUBS.READ_ONLY, "BASIC"],
    ];
    for (const [name, s, plan] of cases) {
      const result = granted(s, { plan, days: 30 });
      const paid = applyApprovedPayment({
        state: stateOf(s),
        access: accessOf(s),
        kind: "PERIOD",
        plan,
        cycle: s.billingCycle,
        now: NOW,
      });

      expect(result.periodStart, name).toEqual(paid.periodStart);
      // Mismos cambios salvo el fin (días en vez de meses) y el ciclo, que una activación no toca.
      const paidRest: Record<string, unknown> = { ...paid.update };
      delete paidRest.currentPeriodEnd;
      delete paidRest.billingCycle;
      const grantRest: Record<string, unknown> = { ...result.update };
      delete grantRest.currentPeriodEnd;
      expect(grantRest, name).toEqual(paidRest);
    }
  });
});

describe("computeGrantPeriod: desde hoy (NOW)", () => {
  it("reemplaza lo vigente e informa los días que se pierden", () => {
    expect(granted(SUBS.TRIAL, { plan: "PRO", days: 30, start: "NOW" })).toEqual({
      ok: true,
      update: {
        plan: "PRO",
        currentPeriodStart: NOW,
        currentPeriodEnd: day(30),
        canceledAt: null,
        ...CLEARED_SCHEDULE,
      },
      periodStart: NOW,
      periodEnd: day(30),
      scheduled: false,
      lostDays: 3,
    });
    expect(granted(SUBS.ACTIVE, { days: 30, start: "NOW" })).toMatchObject({ lostDays: 10, periodEnd: day(30) });
    expect(granted(SUBS.CANCELED, { days: 5, start: "NOW" })).toMatchObject({ lostDays: 10, periodEnd: day(5) });
  });

  it("puede acortar el acceso: menos días que los que quedaban", () => {
    const result = granted(SUBS.ACTIVE, { days: 2, start: "NOW" });

    expect(result).toMatchObject({ periodEnd: day(2), lostDays: 10 });
    expect(accessOf(after(SUBS.ACTIVE, result.update))).toMatchObject({ phase: "ACTIVE", daysLeft: 2 });
  });

  it("los días perdidos se redondean hacia arriba, como los días restantes que ve el dueño", () => {
    const almostOver = sub({ currentPeriodStart: day(-29), currentPeriodEnd: new Date(NOW.getTime() + 60_000) });

    expect(granted(almostOver, { start: "NOW" }).lostDays).toBe(1);
  });

  it("en gracia o en solo lectura no se pierde nada", () => {
    expect(granted(SUBS.PAST_DUE, { start: "NOW" })).toMatchObject({ lostDays: 0, periodStart: NOW });
    for (const [, s] of READ_ONLY_VARIANTS) {
      expect(granted(s, { start: "NOW" })).toMatchObject({ lostDays: 0, periodStart: NOW, periodEnd: day(30) });
    }
  });

  it("reemplaza un cambio programado pendiente y cuenta como perdido todo lo que ya estaba pagado", () => {
    const pending = sub({
      currentPeriodStart: day(-20),
      currentPeriodEnd: day(40),
      scheduledPlan: "PRO",
      scheduledCycle: "ANNUAL",
      scheduledFrom: day(10),
    });
    const result = granted(pending, { plan: "BASIC", days: 30, start: "NOW" });

    expect(result).toMatchObject({ lostDays: 40, scheduled: false });
    expect(result.update).toMatchObject({ plan: "BASIC", currentPeriodEnd: day(30), ...CLEARED_SCHEDULE });
    expect(stateOf(after(pending, result.update), day(15)).plan).toBe("BASIC");
  });

  it("en solo lectura da exactamente lo mismo que AFTER_CURRENT", () => {
    for (const [, s] of READ_ONLY_VARIANTS) {
      expect(grant(s, { plan: "PRO", days: 15, start: "NOW" })).toEqual(
        grant(s, { plan: "PRO", days: 15, start: "AFTER_CURRENT" }),
      );
    }
  });
});

describe("computeGrantPeriod: reglas generales", () => {
  it("valida los días: enteros entre 1 y GRANT_MAX_DAYS", () => {
    const reason = `Los días deben estar entre 1 y ${GRANT_MAX_DAYS}.`;
    for (const start of GRANT_STARTS) {
      for (const days of [0, -1, 1.5, GRANT_MAX_DAYS + 1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(grant(SUBS.ACTIVE, { days, start })).toEqual({ ok: false, reason });
      }
      expect(granted(SUBS.READ_ONLY, { days: 1, start })).toMatchObject({ periodEnd: day(1) });
      expect(granted(SUBS.READ_ONLY, { days: GRANT_MAX_DAYS, start })).toMatchObject({
        periodEnd: day(GRANT_MAX_DAYS),
      });
    }
  });

  it("en cualquier fase, plan y modo: da exactamente los días pedidos y deja acceso completo hasta el fin", () => {
    const subs = [...Object.values(SUBS), ...READ_ONLY_VARIANTS.map(([, s]) => s)];
    for (const s of subs) {
      for (const plan of PLAN_CODES) {
        for (const start of GRANT_STARTS) {
          for (const days of [1, 7, 30, GRANT_MAX_DAYS]) {
            const result = granted(s, { plan, days, start });
            const label = `${accessOf(s).phase} ${plan} ${start} ${days}`;

            expect(result.periodEnd.getTime() - result.periodStart.getTime(), label).toBe(days * DAY_MS);
            expect(result.periodEnd > NOW, label).toBe(true);
            expect(result.update.currentPeriodEnd, label).toEqual(result.periodEnd);
            // Nunca toca el ciclo de cobro: las activaciones van por días.
            expect(result.update, label).not.toHaveProperty("billingCycle");

            const saved = after(s, result.update);
            const access = accessOf(saved);
            expect(access, label).toMatchObject({ phase: "ACTIVE", mode: "FULL", endsAt: result.periodEnd });
            // El plan pedido rige durante todo el período otorgado.
            const during = new Date(Math.max(result.periodStart.getTime(), NOW.getTime()) + 1);
            expect(stateOf(saved, during).plan, label).toBe(plan);
            // Al terminar: gracia normal y luego solo lectura.
            expect(accessOf(saved, addDays(result.periodEnd, GRACE_DAYS)).mode, label).toBe("READ_ONLY");
          }
        }
      }
    }
  });

  it("programado ⇔ plan distinto que empieza en el futuro", () => {
    for (const [phase, s] of Object.entries(SUBS)) {
      const future = phase === "TRIAL" || phase === "ACTIVE" || phase === "CANCELED";
      expect(granted(s, { plan: "PRO" }).scheduled, phase).toBe(future);
      expect(granted(s, { plan: "BUSINESS" }).scheduled, phase).toBe(false);
      expect(granted(s, { plan: "PRO", start: "NOW" }).scheduled, phase).toBe(false);
    }
  });
});
