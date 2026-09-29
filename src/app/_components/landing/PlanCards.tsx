"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useState } from "react";

import { type DisplayPlan, formatPlanPrice, monthlyEquivalent } from "~/lib/landing/plans-display";
import { REGISTER_HREF } from "./nav-links";

type Billing = "mensual" | "anual";

const num = (n: number) => new Intl.NumberFormat("es-CO").format(n);

function limitsText(plan: DisplayPlan): string[] {
  const { cajas, usuarios } = plan.limites;
  return [
    cajas === 1 ? "1 caja abierta a la vez" : `${cajas} cajas abiertas a la vez`,
    `${num(usuarios)} usuarios, contándote a ti`,
  ];
}

function PriceLine({ plan, billing }: Readonly<{ plan: DisplayPlan; billing: Billing }>) {
  const value = billing === "mensual" ? plan.precioMensual : plan.precioAnual;
  return (
    <>
      <p className="text-4xl font-extrabold tracking-tight text-slate-950 tabular-nums dark:text-white">
        {formatPlanPrice(value)}
        <span className="ml-1 text-base font-medium text-slate-500 dark:text-slate-400">
          {billing === "mensual" ? "/mes" : "/año"}
        </span>
      </p>
      <p className="mt-1 h-5 text-sm text-slate-500 dark:text-slate-400">
        {billing === "anual" ? `Equivale a ${formatPlanPrice(monthlyEquivalent(value))} al mes` : ""}
      </p>
    </>
  );
}

export function PlanCards({ plans }: Readonly<{ plans: DisplayPlan[] }>) {
  const [billing, setBilling] = useState<Billing>("mensual");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <fieldset className="inline-flex rounded-xl border border-slate-300 bg-white p-1 dark:border-white/15 dark:bg-white/5">
          <legend className="sr-only">Forma de pago</legend>
          {(["mensual", "anual"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={billing === option}
              onClick={() => setBilling(option)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                billing === option
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950"
                  : "text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
              }`}
            >
              {option === "mensual" ? "Mensual" : "Anual"}
            </button>
          ))}
        </fieldset>
        <p className="text-sm text-slate-600 dark:text-slate-300">Anual: pagas 10 meses y recibes 12.</p>
      </div>

      <ul className="mx-auto mt-10 grid max-w-xl gap-6 lg:max-w-none lg:grid-cols-3 lg:items-stretch">
        {plans.map((plan) => (
          <li
            key={plan.id}
            className={`relative flex flex-col rounded-3xl p-6 sm:p-7 ${
              plan.destacado
                ? "border-ala-violet border-2 bg-white shadow-xl shadow-violet-900/10 dark:border-violet-400 dark:bg-slate-900"
                : "border border-slate-200 bg-white/70 dark:border-white/10 dark:bg-white/[0.03]"
            }`}
          >
            {plan.destacado && (
              <p className="bg-ala-violet absolute -top-3.5 left-7 rounded-full px-3 py-1 text-xs font-semibold text-white">
                Recomendado
              </p>
            )}
            <h3 className="text-lg font-bold text-slate-950 dark:text-white">{plan.nombre}</h3>
            <p className="mt-1 min-h-12 text-[15px] text-slate-600 dark:text-slate-400">{plan.descripcion}</p>

            <div className="mt-5">
              <PriceLine plan={plan} billing={billing} />
            </div>

            <p className="mt-5 rounded-xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-800 dark:bg-white/[0.06] dark:text-slate-200">
              {limitsText(plan).map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </p>

            <ul className="mt-5 flex-1 space-y-2.5 text-[15px] text-slate-700 dark:text-slate-300">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2.5">
                  <Check aria-hidden="true" className="text-ala-blue mt-0.5 h-4 w-4 shrink-0 dark:text-cyan-300" />
                  {feature}
                </li>
              ))}
            </ul>

            <Link
              href={REGISTER_HREF}
              className={`mt-6 rounded-xl px-5 py-3 text-center font-semibold transition-colors ${
                plan.destacado
                  ? "bg-ala-violet text-white hover:bg-violet-600"
                  : "border border-slate-300 text-slate-900 hover:bg-slate-100 dark:border-white/20 dark:text-white dark:hover:bg-white/10"
              }`}
            >
              {plan.cta}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
