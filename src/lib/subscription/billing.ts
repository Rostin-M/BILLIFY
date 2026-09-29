/**
 * Reglas de cobro (funciones puras): qué se cobra al pedir un plan, cuánto, y
 * cómo queda la suscripción cuando un pago se aprueba.
 *
 * Tipos de cobro:
 *  - UPGRADE: sube de plan en el MISMO ciclo con un período pagado vigente. Se
 *    cobra solo la diferencia por los días restantes y aplica de inmediato; la
 *    fecha de vencimiento no cambia.
 *  - PERIOD: paga un período completo (mes o año). Empieza cuando termina lo que
 *    ya tiene (prueba o período vigente, incluida la gracia) o, si está en solo
 *    lectura, desde el momento del pago. Si el plan o el ciclo cambian y el nuevo
 *    período empieza en el futuro, el cambio queda programado (así funcionan el
 *    downgrade y el cambio de ciclo: aplican al renovar).
 */

import { type SubscriptionAccess } from "./access";
import { getPlan, type BillingCycle, type PlanCode, planPrice } from "./catalog";

export type PaymentKind = "UPGRADE" | "PERIOD";

/** Cobro mínimo de un upgrade prorrateado (evita cobros de pocos pesos). Verificar el mínimo de Wompi. */
export const MIN_CHARGE_COP = 1_500;

export type VatConfig = {
  /** Tarifa de IVA como fracción (0.19 = 19 %). 0 = no se cobra IVA. */
  rate: number;
  /** true: los precios del catálogo ya incluyen el IVA. false: se suma encima. */
  pricesIncludeVat: boolean;
};

export type ChargeBreakdown = {
  /** Total a cobrar en centavos de COP (formato de Wompi). */
  amountInCents: number;
  /** Porción de IVA incluida en el total, en centavos. */
  vatInCents: number;
};

/** Estado actual de la suscripción relevante para cotizar. */
export type BillingState = {
  plan: PlanCode;
  billingCycle: BillingCycle;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  /** Cambio de plan/ciclo ya pagado que empieza en el futuro. */
  scheduledFrom: Date | null;
};

export type CheckoutQuote =
  | {
      ok: true;
      kind: PaymentKind;
      plan: PlanCode;
      cycle: BillingCycle;
      /** Monto base en COP antes de aplicar IVA. */
      baseAmount: number;
      charge: ChargeBreakdown;
      description: string;
    }
  | { ok: false; reason: string };

export function applyVat(amountCop: number, vat: VatConfig): ChargeBreakdown {
  const cents = Math.round(amountCop * 100);
  if (vat.rate <= 0) return { amountInCents: cents, vatInCents: 0 };
  if (vat.pricesIncludeVat) {
    const net = Math.round(cents / (1 + vat.rate));
    return { amountInCents: cents, vatInCents: cents - net };
  }
  const vatCents = Math.round(cents * vat.rate);
  return { amountInCents: cents + vatCents, vatInCents: vatCents };
}

/** Suma meses de calendario conservando la hora; 31 ene + 1 mes = 28/29 feb. */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function cycleMonths(cycle: BillingCycle): number {
  return cycle === "ANNUAL" ? 12 : 1;
}

function roundUpTo100(value: number): number {
  return Math.ceil(value / 100) * 100;
}

/**
 * Diferencia a pagar al subir de plan: (precio nuevo − precio actual) del mismo
 * ciclo, proporcional al tiempo que le queda al período.
 */
export function prorateUpgrade(params: {
  from: PlanCode;
  to: PlanCode;
  cycle: BillingCycle;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
}): number {
  const { from, to, cycle, periodStart, periodEnd, now } = params;
  const total = periodEnd.getTime() - periodStart.getTime();
  // Acotado a `total`: un período pagado por adelantado aún no ha empezado.
  const remaining = Math.min(total, Math.max(0, periodEnd.getTime() - now.getTime()));
  if (total <= 0 || remaining <= 0) return 0;
  const diff = planPrice(to, cycle) - planPrice(from, cycle);
  if (diff <= 0) return 0;
  const prorated = roundUpTo100((diff * remaining) / total);
  return Math.max(MIN_CHARGE_COP, prorated);
}

/** Decide qué tipo de cobro corresponde y cuánto, o por qué no se puede. */
export function quoteCheckout(params: {
  state: BillingState;
  access: SubscriptionAccess;
  plan: PlanCode;
  cycle: BillingCycle;
  vat: VatConfig;
  now: Date;
}): CheckoutQuote {
  const { state, access, plan, cycle, vat, now } = params;
  const target = getPlan(plan);

  if (state.scheduledFrom && state.scheduledFrom > now) {
    return {
      ok: false,
      reason: "Ya tienes pagado el próximo período con un cambio de plan. Podrás pagar de nuevo cuando empiece.",
    };
  }

  const isUpgrade =
    access.phase === "ACTIVE" &&
    target.rank > getPlan(state.plan).rank &&
    cycle === state.billingCycle &&
    state.currentPeriodStart !== null &&
    state.currentPeriodEnd !== null;

  if (isUpgrade) {
    const baseAmount = prorateUpgrade({
      from: state.plan,
      to: plan,
      cycle,
      periodStart: state.currentPeriodStart!,
      periodEnd: state.currentPeriodEnd!,
      now,
    });
    if (baseAmount <= 0) return { ok: false, reason: "No hay diferencia por cobrar." };
    return {
      ok: true,
      kind: "UPGRADE",
      plan,
      cycle,
      baseAmount,
      charge: applyVat(baseAmount, vat),
      description: `BILLIFY: cambio a plan ${target.name} (resto del período)`,
    };
  }

  const baseAmount = planPrice(plan, cycle);
  return {
    ok: true,
    kind: "PERIOD",
    plan,
    cycle,
    baseAmount,
    charge: applyVat(baseAmount, vat),
    description: `BILLIFY: plan ${target.name} ${cycle === "ANNUAL" ? "anual" : "mensual"}`,
  };
}

export type SubscriptionUpdate = {
  plan?: PlanCode;
  billingCycle?: BillingCycle;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  scheduledPlan?: PlanCode | null;
  scheduledCycle?: BillingCycle | null;
  scheduledFrom?: Date | null;
  canceledAt?: null;
};

/**
 * Cambios a la suscripción cuando se aprueba un pago. Se calcula con el estado
 * del MOMENTO de la aprobación (un PSE puede aprobarse horas después).
 */
export function applyApprovedPayment(params: {
  state: BillingState;
  access: SubscriptionAccess;
  kind: PaymentKind;
  plan: PlanCode;
  cycle: BillingCycle;
  now: Date;
}): { update: SubscriptionUpdate; periodStart: Date; periodEnd: Date } {
  const { state, access, kind, plan, cycle, now } = params;

  if (kind === "UPGRADE") {
    // Aplica ya; si el período terminó mientras el pago estaba pendiente, al
    // menos queda el plan nuevo y el negocio renueva normalmente.
    return {
      update: { plan },
      periodStart: state.currentPeriodStart ?? now,
      periodEnd: state.currentPeriodEnd ?? now,
    };
  }

  // PERIOD: empieza al terminar lo que ya tiene; si está bloqueado, desde ya.
  let start: Date;
  if (access.mode === "READ_ONLY" || !access.endsAt) {
    start = now;
  } else {
    // TRIAL → fin de la prueba; ACTIVE/PAST_DUE/CANCELED → fin del período pagado.
    start = access.endsAt;
  }
  const end = addMonths(start, cycleMonths(cycle));
  const changesPlan = plan !== state.plan || cycle !== state.billingCycle;

  const update: SubscriptionUpdate = {
    currentPeriodEnd: end,
    canceledAt: null,
  };

  if (start <= now || !changesPlan) {
    update.plan = plan;
    update.billingCycle = cycle;
    update.currentPeriodStart = start <= now ? start : (state.currentPeriodStart ?? start);
    update.scheduledPlan = null;
    update.scheduledCycle = null;
    update.scheduledFrom = null;
  } else {
    // Downgrade o cambio de ciclo: el plan actual sigue hasta `start`.
    update.scheduledPlan = plan;
    update.scheduledCycle = cycle;
    update.scheduledFrom = start;
  }

  return { update, periodStart: start, periodEnd: end };
}

/**
 * Aplica un cambio programado cuya fecha ya llegó. Devuelve null si no hay nada
 * que aplicar. Lo usan el guard (para que el límite sea exacto) y el cron.
 */
export function dueScheduledChange(
  sub: { scheduledPlan: PlanCode | null; scheduledCycle: BillingCycle | null; scheduledFrom: Date | null },
  now: Date,
): { plan: PlanCode; billingCycle: BillingCycle; currentPeriodStart: Date } | null {
  if (!sub.scheduledPlan || !sub.scheduledCycle || !sub.scheduledFrom) return null;
  if (sub.scheduledFrom > now) return null;
  return { plan: sub.scheduledPlan, billingCycle: sub.scheduledCycle, currentPeriodStart: sub.scheduledFrom };
}
