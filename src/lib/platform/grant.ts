/**
 * Regla de fechas de una activación manual de plan (función pura). La usan el
 * servidor al aplicarla y el panel /admin para la vista previa, así ambos dan
 * siempre el mismo resultado.
 *
 * Sigue las mismas reglas que un pago de período por pasarela
 * (`applyApprovedPayment` en ~/lib/subscription/billing.ts), pero en días:
 *
 *  - AFTER_CURRENT: los días empiezan cuando termina lo que el negocio ya tiene
 *    (fin de la prueba o del período pagado; en gracia, desde la fecha en que
 *    venció). En solo lectura empiezan hoy. Si el plan es distinto y los días
 *    empiezan en el futuro, el cambio queda programado: el negocio sigue con su
 *    plan actual hasta esa fecha.
 *  - NOW: los días empiezan hoy y reemplazan lo vigente (los días que le
 *    quedaban se pierden).
 */

import { addDays, daysUntil, type SubscriptionAccess } from "~/lib/subscription/access";
import { type BillingState, type SubscriptionUpdate } from "~/lib/subscription/billing";
import { type PlanCode } from "~/lib/subscription/catalog";

import { GRANT_MAX_DAYS, type GrantStart } from "./contract";

export type GrantPeriod =
  | {
      ok: true;
      /** Cambios a aplicar a la fila de la suscripción. */
      update: SubscriptionUpdate;
      periodStart: Date;
      periodEnd: Date;
      /** true: el plan nuevo empieza en `periodStart` (futuro); hasta entonces sigue el actual. */
      scheduled: boolean;
      /** Días vigentes que se pierden (solo con NOW). */
      lostDays: number;
    }
  | { ok: false; reason: string };

export function computeGrantPeriod(params: {
  state: BillingState;
  access: SubscriptionAccess;
  plan: PlanCode;
  days: number;
  start: GrantStart;
  now: Date;
}): GrantPeriod {
  const { state, access, plan, days, start: mode, now } = params;

  if (!Number.isInteger(days) || days < 1 || days > GRANT_MAX_DAYS) {
    return { ok: false, reason: `Los días deben estar entre 1 y ${GRANT_MAX_DAYS}.` };
  }

  if (mode === "NOW") {
    const lostDays = access.mode === "FULL" && access.endsAt ? daysUntil(access.endsAt, now) : 0;
    const periodEnd = addDays(now, days);
    return {
      ok: true,
      update: {
        plan,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        scheduledPlan: null,
        scheduledCycle: null,
        scheduledFrom: null,
        canceledAt: null,
      },
      periodStart: now,
      periodEnd,
      scheduled: false,
      lostDays,
    };
  }

  if (state.scheduledFrom && state.scheduledFrom > now) {
    return {
      ok: false,
      reason: 'Este negocio ya tiene un cambio de plan programado. Usa "desde hoy" para reemplazarlo.',
    };
  }

  let periodStart = access.mode === "READ_ONLY" || !access.endsAt ? now : access.endsAt;
  // En gracia con pocos días: si contados desde el vencimiento ya habrían pasado, cuentan desde hoy.
  if (addDays(periodStart, days) <= now) periodStart = now;
  const periodEnd = addDays(periodStart, days);

  const update: SubscriptionUpdate = { currentPeriodEnd: periodEnd, canceledAt: null };
  const scheduled = periodStart > now && plan !== state.plan;

  if (scheduled) {
    update.scheduledPlan = plan;
    update.scheduledCycle = state.billingCycle;
    update.scheduledFrom = periodStart;
  } else {
    update.plan = plan;
    update.currentPeriodStart = periodStart <= now ? periodStart : (state.currentPeriodStart ?? periodStart);
    update.scheduledPlan = null;
    update.scheduledCycle = null;
    update.scheduledFrom = null;
  }

  return { ok: true, update, periodStart, periodEnd, scheduled, lostDays: 0 };
}
