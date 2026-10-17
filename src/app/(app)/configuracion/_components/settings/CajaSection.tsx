"use client";

import Link from "next/link";

import { api } from "~/trpc/react";
import type { SectionProps } from "./types";
import { CheckboxRow, dividerClass, inputClass, labelTextClass, SubHeading } from "./ui";

export function CajaSection({ form, update }: SectionProps) {
  const { data: status } = api.billing.status.useQuery();
  // Máximo que permite el plan; mientras carga se deja el tope técnico (10).
  const limit = status?.usage.cashRegisters.limit ?? 10;
  const value = Number.parseInt(form.maxCashRegisters, 10);
  const overLimit = status !== undefined && !Number.isNaN(value) && value > limit;

  return (
    <>
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
              overLimit ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"
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
          <span className="block text-xs text-slate-500 dark:text-slate-400">Cargando el límite de tu plan...</span>
        )}
      </label>

      <div className={dividerClass} />

      {/* Cuadre al cerrar: el efectivo contado siempre es obligatorio */}
      <div className="space-y-3">
        <SubHeading>Cierre de caja</SubHeading>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Al cerrar, siempre se cuenta el efectivo del cajón. Si no cuadra con lo registrado, hay que escribir el motivo.
        </p>
        <CheckboxRow
          checked={form.cashBlindClose}
          onChange={(checked) => update({ cashBlindClose: checked })}
          title="Cierre ciego para cajeros"
          description={
            <>
              El cajero no ve cuánto efectivo debería haber: primero cuenta y después ve si cuadra. Así el conteo es
              honesto. Tú, como dueño, siempre ves el saldo.
            </>
          }
        />
        <CheckboxRow
          checked={form.cashCountByDenomination}
          onChange={(checked) => update({ cashCountByDenomination: checked })}
          title="Contar por billetes y monedas"
          description={
            <>
              En vez de escribir el total, se anota cuántos billetes y monedas hay de cada valor ($100.000 a $50) y el
              total se suma solo. Queda guardado en el reporte del cierre.
            </>
          }
        />
      </div>
    </>
  );
}
