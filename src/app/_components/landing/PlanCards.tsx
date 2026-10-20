"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useState } from "react";

import {
  type DisplayPlan,
  formatPlanPrice,
  monthlyEquivalent,
} from "~/lib/landing/plans-display";
import { REGISTER_HREF } from "./nav-links";
import { cssVars } from "./style";

type Billing = "mensual" | "anual";

const num = (n: number) => new Intl.NumberFormat("es-CO").format(n);

function limitsText(plan: DisplayPlan): string[] {
  const { cajas, usuarios } = plan.limites;
  return [
    cajas === 1
      ? "1 caja abierta a la vez"
      : `${cajas} cajas abiertas a la vez`,
    `${num(usuarios)} usuarios, contándote a ti`,
  ];
}

function PriceLine({
  plan,
  billing,
}: Readonly<{ plan: DisplayPlan; billing: Billing }>) {
  const value = billing === "mensual" ? plan.precioMensual : plan.precioAnual;
  return (
    <>
      <p className="font-display text-[2.6rem] leading-none font-extrabold tracking-tight text-slate-950 tabular-nums dark:text-white">
        {formatPlanPrice(value)}
        <span className="ml-1 text-base font-medium text-slate-500 dark:text-slate-400">
          {billing === "mensual" ? "/mes" : "/año"}
        </span>
      </p>
      <p className="mt-1 h-5 text-sm text-slate-500 dark:text-slate-400">
        {billing === "anual"
          ? `Equivale a ${formatPlanPrice(monthlyEquivalent(value))} al mes`
          : ""}
      </p>
    </>
  );
}

export function PlanCards({ plans }: Readonly<{ plans: DisplayPlan[] }>) {
  const [billing, setBilling] = useState<Billing>("mensual");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <fieldset className="relative inline-grid grid-cols-2 rounded-2xl border border-slate-300 bg-white p-1 dark:border-white/15 dark:bg-white/5">
          <legend className="sr-only">Forma de pago</legend>
          {/* Pastilla que se desliza a la opción elegida */}
          <span
            aria-hidden="true"
            className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-xl bg-slate-900 transition-transform duration-300 ease-out dark:bg-white ${
              billing === "anual" ? "translate-x-full" : ""
            }`}
          />
          {(["mensual", "anual"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={billing === option}
              onClick={() => setBilling(option)}
              className={`relative rounded-xl px-5 py-2 text-sm font-semibold transition-colors ${
                billing === option
                  ? "text-white dark:text-slate-950"
                  : "text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
              }`}
            >
              {option === "mensual" ? "Mensual" : "Anual"}
            </button>
          ))}
        </fieldset>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Anual: pagas 10 meses y recibes 12.
        </p>
      </div>

      <ul className="mx-auto mt-10 grid max-w-xl gap-6 md:max-w-none md:grid-cols-3 md:items-stretch md:gap-4 lg:gap-6">
        {plans.map((plan, i) => (
          <li
            key={plan.id}
            data-reveal
            style={cssVars({ "--delay": `${i * 100}ms` })}
            className={`relative flex flex-col rounded-3xl p-6 sm:p-7 ${
              plan.destacado
                ? "border-spin shadow-ala-violet/20 shadow-2xl md:-my-3 md:py-9"
                : "border border-slate-200 bg-white/70 dark:border-white/10 dark:bg-white/[0.03]"
            }`}
          >
            {plan.destacado && (
              <p className="from-ala-violet to-ala-blue absolute -top-3.5 left-7 rounded-full bg-gradient-to-r px-3 py-1 text-xs font-semibold text-white shadow-lg">
                Recomendado
              </p>
            )}
            <h3 className="font-display text-xl font-bold text-slate-950 dark:text-white">
              {plan.nombre}
            </h3>
            <p className="mt-1 min-h-12 text-[15px] text-slate-600 dark:text-slate-400">
              {plan.descripcion}
            </p>

            <div key={billing} className="price-swap mt-5">
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
                  <Check
                    aria-hidden="true"
                    className="text-ala-blue dark:text-ala-cyan mt-0.5 h-4 w-4 shrink-0"
                  />
                  {feature}
                </li>
              ))}
            </ul>

            <Link
              href={REGISTER_HREF}
              className={`mt-6 rounded-xl px-5 py-3 text-center font-semibold transition-colors ${
                plan.destacado
                  ? "btn-shine bg-ala-violet hover:bg-ala-violet-hover text-white"
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
