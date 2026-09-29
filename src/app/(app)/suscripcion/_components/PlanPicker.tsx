"use client";

import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  BILLING_CYCLES,
  type BillingCycle,
  CYCLE_LABELS,
  FEATURE_LABELS,
  formatBytes,
  formatCop,
  PLAN_CODES,
  PLANS,
  type PlanCode,
} from "~/lib/subscription/catalog";
import { formatCents } from "~/app/_components/subscription/labels";
import { api, type RouterOutputs } from "~/trpc/react";
import { planAction } from "./planAction";

type Status = RouterOutputs["billing"]["status"];

const num = (n: number) => new Intl.NumberFormat("es-CO").format(n);

/** Límites y funciones del plan, en el orden en que se leen al comparar. */
function planLines(code: PlanCode): string[] {
  const p = PLANS[code];
  const l = p.limits;
  return [
    l.cashRegisters === 1 ? "1 caja abierta a la vez" : `${l.cashRegisters} cajas abiertas a la vez`,
    `${l.users} usuarios`,
    l.products === null ? "Productos ilimitados" : `Hasta ${num(l.products)} productos`,
    `${num(l.invoiceEmailsPerMonth)} facturas por correo al mes`,
    `${formatBytes(l.storageBytes)} para fotos de comprobantes`,
    ...p.features.map((f) => FEATURE_LABELS[f]),
  ];
}

export function PlanPicker({ status }: Readonly<{ status: Status }>) {
  // Arranca en el ciclo actual (en la prueba, mensual).
  const [cycle, setCycle] = useState<BillingCycle>(status.phase === "TRIAL" ? "MONTHLY" : status.billingCycle);

  return (
    <section aria-labelledby="planes-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="planes-title" className="text-lg font-semibold text-slate-800 dark:text-white">
            Planes
          </h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Anual: pagas 10 meses y recibes 12.
          </p>
        </div>
        <fieldset className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-white/5">
          <legend className="sr-only">Forma de pago</legend>
          {BILLING_CYCLES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={cycle === c}
              onClick={() => setCycle(c)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                cycle === c
                  ? "bg-violet-600 text-white shadow"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {CYCLE_LABELS[c]}
            </button>
          ))}
        </fieldset>
      </div>

      <ul className="mt-5 grid gap-4 md:grid-cols-3">
        {PLAN_CODES.map((code) => (
          <PlanCard key={code} code={code} cycle={cycle} status={status} />
        ))}
      </ul>
    </section>
  );
}

function PlanCard({ code, cycle, status }: Readonly<{ code: PlanCode; cycle: BillingCycle; status: Status }>) {
  const plan = PLANS[code];
  const isCurrentPlan = code === status.plan;
  const price = plan.prices[cycle];
  const quote = api.billing.quote.useQuery({ plan: code, cycle }, { staleTime: 30_000 });

  const checkout = api.billing.checkout.useMutation({
    onSuccess: (data) => window.location.assign(data.checkoutUrl),
    onError: (e) => toast.error(e.message),
  });

  const action = quote.data
    ? planAction({
        state: {
          plan: status.plan,
          billingCycle: status.billingCycle,
          phase: status.phase,
          mode: status.mode,
          endsAt: status.endsAt,
        },
        target: code,
        cycle,
        quote: quote.data,
        now: new Date(),
      })
    : null;

  const vat = quote.data?.ok ? quote.data.charge.vatInCents : 0;
  const redirecting = checkout.isPending || checkout.isSuccess;

  return (
    <li
      className={`relative flex flex-col rounded-2xl border bg-white p-5 shadow-sm dark:bg-white/5 ${
        plan.highlighted
          ? "border-violet-300 ring-1 ring-violet-300 dark:border-violet-500/50 dark:ring-violet-500/50"
          : "border-slate-200 dark:border-white/10"
      }`}
    >
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">{plan.name}</h3>
        {isCurrentPlan && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
            {status.phase === "TRIAL" ? "Tu prueba" : "Tu plan"}
          </span>
        )}
        {plan.highlighted && !isCurrentPlan && (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
            Recomendado
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{plan.tagline}</p>

      <p className="mt-4 text-3xl font-extrabold tracking-tight tabular-nums text-slate-900 dark:text-white">
        {formatCop(price)}
        <span className="ml-1 text-sm font-medium text-slate-500 dark:text-slate-400">
          {cycle === "MONTHLY" ? "/mes" : "/año"}
        </span>
      </p>
      <p className="mt-0.5 h-4 text-xs text-slate-500 dark:text-slate-500">
        {cycle === "ANNUAL" ? `Equivale a ${formatCop(Math.round(price / 12))} al mes` : ""}
      </p>

      <ul className="mt-4 flex-1 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
        {planLines(code).map((line) => (
          <li key={line} className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden />
            {line}
          </li>
        ))}
      </ul>

      <div className="mt-5 border-t border-slate-100 pt-4 dark:border-white/10">
        {quote.isError && (
          <p className="text-xs text-red-600 dark:text-red-400">
            No pudimos calcular el cobro: {quote.error.message}
          </p>
        )}
        {!action && !quote.isError && (
          <div className="h-10 animate-pulse rounded-xl bg-slate-100 dark:bg-white/10" aria-label="Calculando el cobro" />
        )}
        {action && (
          <>
            <button
              type="button"
              disabled={!action.enabled || redirecting}
              onClick={() => checkout.mutate({ plan: code, cycle })}
              className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                action.enabled && action.emphasis === "primary"
                  ? "bg-violet-600 text-white hover:bg-violet-500"
                  : "border border-slate-300 text-slate-800 hover:bg-slate-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/10"
              }`}
            >
              {redirecting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {redirecting ? "Abriendo el pago..." : action.label}
            </button>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {action.detail}
              {vat > 0 && ` Incluye IVA de ${formatCents(vat)}.`}
            </p>
          </>
        )}
      </div>
    </li>
  );
}
