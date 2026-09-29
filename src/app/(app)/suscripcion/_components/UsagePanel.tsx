"use client";

import { formatBytes } from "~/lib/subscription/catalog";
import { type RouterOutputs } from "~/trpc/react";

type Usage = RouterOutputs["billing"]["status"]["usage"];

type Meter = {
  label: string;
  used: number;
  limit: number | null;
  /** Cómo mostrar los números (bytes, conteos). */
  format?: (n: number) => string;
  hint?: string;
};

const num = (n: number) => new Intl.NumberFormat("es-CO").format(n);

function barColor(pct: number): string {
  if (pct >= 100) return "bg-red-500";
  if (pct >= 80) return "bg-amber-500";
  return "bg-violet-500";
}

function MeterRow({ meter }: Readonly<{ meter: Meter }>) {
  const fmt = meter.format ?? num;
  const pct = meter.limit ? Math.min(100, (meter.used / meter.limit) * 100) : 0;
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-200">{meter.label}</span>
        <span className="tabular-nums text-slate-500 dark:text-slate-400">
          {fmt(meter.used)} {meter.limit === null ? "· ilimitados" : `de ${fmt(meter.limit)}`}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
        {meter.limit !== null && (
          <div className={`h-full rounded-full ${barColor(pct)}`} style={{ width: `${Math.max(pct, meter.used > 0 ? 2 : 0)}%` }} />
        )}
      </div>
      {meter.hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{meter.hint}</p>}
    </li>
  );
}

export function UsagePanel({ usage }: Readonly<{ usage: Usage }>) {
  const cash = usage.cashRegisters;
  const meters: Meter[] = [
    { label: "Usuarios activos", used: usage.users.used, limit: usage.users.limit, hint: "Incluye al propietario." },
    { label: "Productos activos", used: usage.products.used, limit: usage.products.limit },
    {
      label: "Cajas abiertas a la vez",
      used: cash.effective,
      limit: cash.limit,
      hint:
        cash.configured > cash.effective
          ? `Configuraste ${cash.configured}, pero tu plan permite ${cash.limit}.`
          : "Lo que configuraste en Configuración > Caja.",
    },
    { label: "Facturas por correo este mes", used: usage.invoiceEmails.used, limit: usage.invoiceEmails.limit },
    {
      label: "Fotos de comprobantes",
      used: usage.storageBytes.used,
      limit: usage.storageBytes.limit,
      format: formatBytes,
    },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5 sm:p-6">
      <h2 className="font-semibold text-slate-800 dark:text-white">Consumo</h2>
      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Lo que llevas usado frente a lo que incluye tu plan.</p>
      <ul className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-1">
        {meters.map((m) => (
          <MeterRow key={m.label} meter={m} />
        ))}
      </ul>
    </section>
  );
}
