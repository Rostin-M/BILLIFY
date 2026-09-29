/**
 * Texto del botón de cada tarjeta de plan según la cotización del servidor y el
 * estado actual. Puro (sin React) para poder probarlo.
 *
 * Reglas (ver src/lib/subscription/billing.ts):
 *  - UPGRADE: paga la diferencia del resto del período y aplica ya.
 *  - PERIOD en solo lectura o en gracia: el período empieza ya.
 *  - PERIOD con acceso vigente (prueba, activo, cancelado): empieza cuando termina
 *    lo actual. Si cambia el plan o el ciclo, queda programado para esa fecha.
 */

import { type AccessMode, type SubscriptionPhase } from "~/lib/subscription/access";
import { type BillingCycle, getPlan, type PlanCode } from "~/lib/subscription/catalog";
import { formatPesos, formatShortDate } from "~/app/_components/subscription/labels";

export type QuoteResult =
  | { ok: true; kind: "PERIOD" | "UPGRADE"; charge: { amountInCents: number; vatInCents: number } }
  | { ok: false; reason: string };

export type ActionState = {
  plan: PlanCode;
  billingCycle: BillingCycle;
  phase: SubscriptionPhase;
  mode: AccessMode;
  endsAt: Date | null;
};

export type PlanAction =
  | { enabled: true; label: string; detail: string; emphasis: "primary" | "secondary" }
  | { enabled: false; label: string; detail: string };

export function planAction(params: {
  state: ActionState;
  target: PlanCode;
  cycle: BillingCycle;
  quote: QuoteResult;
  now: Date;
}): PlanAction {
  const { state, target, cycle, quote, now } = params;
  const name = getPlan(target).name;

  if (!quote.ok) return { enabled: false, label: "No disponible ahora", detail: quote.reason };

  const pesos = formatPesos(quote.charge.amountInCents);
  const isCurrent = target === state.plan && cycle === state.billingCycle;
  const targetRank = getPlan(target).rank;
  const currentRank = getPlan(state.plan).rank;

  if (quote.kind === "UPGRADE") {
    return {
      enabled: true,
      label: `Subir a ${name} por ${pesos}`,
      detail: "Pagas solo el resto del período. El cambio aplica de inmediato.",
      emphasis: "primary",
    };
  }

  const startsNow = state.mode === "READ_ONLY" || !state.endsAt || state.endsAt <= now;
  if (startsNow) {
    return {
      enabled: true,
      label: isCurrent ? `Renovar por ${pesos}` : `Pagar ${pesos}`,
      detail: "El acceso completo vuelve apenas se apruebe el pago.",
      emphasis: "primary",
    };
  }

  const date = formatShortDate(state.endsAt!);

  if (state.phase === "TRIAL") {
    return {
      enabled: true,
      label: `Pagar ${pesos}`,
      detail: `Empieza cuando termine tu prueba, el ${date}. No pierdes días.`,
      emphasis: target === state.plan ? "primary" : "secondary",
    };
  }

  if (isCurrent) {
    return {
      enabled: true,
      label: `Renovar por ${pesos}`,
      detail: `El nuevo período empieza el ${date}, cuando termina el actual.`,
      emphasis: "primary",
    };
  }

  // Plan menor, o mismo plan con otro ciclo, o plan mayor con otro ciclo: se programa.
  const verb = targetRank < currentRank ? "Cambiar a" : "Pasar a";
  return {
    enabled: true,
    label: `${verb} ${name} desde el ${date}`,
    detail: `Pagas ${pesos} ahora. Tu plan actual sigue igual hasta esa fecha.`,
    emphasis: "secondary",
  };
}
