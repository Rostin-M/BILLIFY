"use client";

import Link from "next/link";

import { api } from "~/trpc/react";
import type { SectionProps } from "./types";
import { inputClass, labelTextClass } from "./ui";

export function CajaSection({ form, update }: SectionProps) {
  const { data: status } = api.billing.status.useQuery();
  // Máximo que permite el plan; mientras carga se deja el tope técnico (10).
  const limit = status?.usage.cashRegisters.limit ?? 10;
  const value = Number.parseInt(form.maxCashRegisters, 10);
  const overLimit = status !== undefined && !Number.isNaN(value) && value > limit;

  return (
    <label className="block max-w-sm space-y-1 text-sm">
      <span className={labelTextClass}>Máximo de cajas abiertas al mismo tiempo</span>
      <input
        type="number"
        required
        min="1"
        max={limit}
        step="1"
        value={form.maxCashRegisters}
        onChange={(e) => update({ maxCashRegisters: e.target.value })}
        className={`${inputClass} max-w-40`}
      />
      {status ? (
        <span
          className={`block text-xs ${
            overLimit ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-500"
          }`}
        >
          {limit === 1
            ? `Tu plan ${status.planName} permite 1 caja a la vez.`
            : `Entre 1 y ${limit}. Tu plan ${status.planName} permite hasta ${limit} cajas a la vez.`}{" "}
          {status.isOwner && (
            <Link href="/suscripcion" className="font-semibold text-violet-600 underline underline-offset-2 dark:text-violet-400">
              {overLimit ? "Sube de plan para tener más" : "Ver planes"}
            </Link>
          )}
        </span>
      ) : (
        <span className="block text-xs text-slate-500 dark:text-slate-500">Cargando el límite de tu plan...</span>
      )}
    </label>
  );
}
