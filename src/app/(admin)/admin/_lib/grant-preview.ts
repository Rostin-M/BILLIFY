/**
 * Vista previa de "Activar plan": adaptador de presentación sobre
 * `computeGrantPeriod` (~/lib/platform/grant), la MISMA función pura que usa el
 * servidor al aplicar la activación. Aquí no hay reglas de fechas propias: solo
 * se arma la entrada desde el detalle del negocio y se traduce el resultado a
 * lo que la pantalla necesita decir.
 */

import { type GrantStart, type PlatformBusinessDetail } from "~/lib/platform/contract";
import { computeGrantPeriod } from "~/lib/platform/grant";
import { addDays, computeAccess, daysUntil, type SubscriptionAccess } from "~/lib/subscription/access";
import { type BillingState } from "~/lib/subscription/billing";
import { getPlan, type PlanCode } from "~/lib/subscription/catalog";

export type GrantContext = { state: BillingState; access: SubscriptionAccess };

/** Estado de cobro y de acceso del negocio, a partir de lo que trae `getBusiness`. */
export function grantContextOf(business: PlatformBusinessDetail, now: Date): GrantContext {
  const { subscription, subscriptionDates: dates } = business;
  return {
    state: {
      plan: subscription.plan,
      billingCycle: subscription.billingCycle,
      currentPeriodStart: dates.currentPeriodStart,
      currentPeriodEnd: dates.currentPeriodEnd,
      scheduledFrom: dates.scheduledFrom,
    },
    access: computeAccess(
      {
        plan: subscription.plan,
        trialEndsAt: dates.trialEndsAt,
        currentPeriodEnd: dates.currentPeriodEnd,
        canceledAt: dates.canceledAt,
      },
      now,
    ),
  };
}

export type GrantPreview =
  | {
      ok: true;
      /** Desde cuándo cuentan los días nuevos. */
      start: Date;
      /** Hasta cuándo queda con acceso. */
      end: Date;
      /**
       * Dónde cae `start`: hoy, en el futuro (al terminar lo vigente) o en el
       * pasado (negocio en gracia: desde la fecha en que venció).
       */
      startsAt: "today" | "afterCurrent" | "sinceExpiry";
      /** El plan nuevo queda programado para `start`; hasta entonces sigue el actual. */
      scheduled: boolean;
      /** Días vigentes que se pierden por empezar desde hoy. */
      lostDays: number;
      /** Días con acceso completo que le quedan hoy (0 si ya venció). */
      currentDaysLeft: number;
      planChange: "same" | "upgrade" | "downgrade";
    }
  | { ok: false; reason: string };

export function previewGrant(
  context: GrantContext,
  input: { plan: PlanCode; days: number; start: GrantStart },
  now: Date,
): GrantPreview {
  const period = computeGrantPeriod({ ...context, ...input, now });
  if (!period.ok) return period;

  const { access, state } = context;
  let startsAt: "today" | "afterCurrent" | "sinceExpiry" = "today";
  if (period.periodStart > now) startsAt = "afterCurrent";
  if (period.periodStart < now) startsAt = "sinceExpiry";

  const fromRank = getPlan(state.plan).rank;
  const toRank = getPlan(input.plan).rank;
  let planChange: "same" | "upgrade" | "downgrade" = "same";
  if (toRank > fromRank) planChange = "upgrade";
  if (toRank < fromRank) planChange = "downgrade";

  return {
    ok: true,
    start: period.periodStart,
    end: period.periodEnd,
    startsAt,
    scheduled: period.scheduled,
    lostDays: period.lostDays,
    currentDaysLeft: access.mode === "FULL" && access.endsAt && access.endsAt > now ? daysUntil(access.endsAt, now) : 0,
    planChange,
  };
}

/**
 * Nueva fecha de fin de la prueba. ESTIMACIÓN local (el contrato no expone la
 * regla del servidor para `extendTrial`): se suma a lo que le quede, o desde
 * hoy si ya terminó. El toast de éxito usa la fecha real que devuelve el servidor.
 */
export function previewTrialExtension(trialEndsAt: Date | null, extraDays: number, now: Date): Date {
  const base = trialEndsAt && trialEndsAt > now ? trialEndsAt : now;
  return addDays(base, extraDays);
}

/** Precio de lista para N días: el anual si es un año, si no el mensual prorrateado. */
export function listPriceForDays(plan: PlanCode, dayCount: number): number {
  const { prices } = getPlan(plan);
  if (dayCount >= 365) return prices.ANNUAL;
  return Math.round((prices.MONTHLY * dayCount) / 30 / 100) * 100;
}
