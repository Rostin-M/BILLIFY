"use client";

import { useState } from "react";
import { HandCoins } from "lucide-react";
import { api } from "~/trpc/react";
import { EmptyState } from "~/app/_components/EmptyState";

const formatCOP = (v: number) =>
  v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });

const formatDay = (d: Date) =>
  new Date(d).toLocaleDateString("es-CO", { weekday: "long", day: "2-digit", month: "long" });

function DebtorDetail({ customerId }: Readonly<{ customerId: string }>) {
  const { data, isPending } = api.customer.history.useQuery({ customerId });

  if (isPending) {
    return <p className="px-1 py-2 text-xs text-slate-400 dark:text-slate-500">Cargando detalle...</p>;
  }

  const creditSales = (data?.sales ?? []).filter((s) => s.paymentMethod === "CREDIT");
  if (creditSales.length === 0) {
    return <p className="px-1 py-2 text-xs text-slate-400 dark:text-slate-500">Sin fiados registrados.</p>;
  }

  const byDay = new Map<string, typeof creditSales>();
  for (const sale of creditSales) {
    const key = formatDay(sale.createdAt);
    byDay.set(key, [...(byDay.get(key) ?? []), sale]);
  }

  return (
    <div className="space-y-3 px-1 py-2">
      {Array.from(byDay.entries()).map(([day, sales]) => {
        const dayTotal = sales.reduce((sum, s) => sum + s.total, 0);
        return (
          <div key={day}>
            <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span className="capitalize">{day}</span>
              <span>{formatCOP(dayTotal)}</span>
            </div>
            <ul className="space-y-1">
              {sales.flatMap((s) =>
                s.items.map((item, i) => (
                  <li
                    key={`${s.id}-${i}`}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-white/5"
                  >
                    <span className="text-slate-600 dark:text-slate-300">
                      {item.quantity} × {item.name}
                    </span>
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {formatCOP(item.subtotal)}
                    </span>
                  </li>
                )),
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function FiadosClient() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: debtors = [], isPending } = api.customer.listDebtors.useQuery();

  const totalDebt = debtors.reduce((sum, d) => sum + d.debt, 0);

  if (isPending) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Cargando fiados...</p>;
  }

  if (debtors.length === 0) {
    return (
      <EmptyState
        icon={HandCoins}
        title="Sin fiados pendientes"
        description="Cuando registres una venta a crédito con un cliente identificado, aparecerá aquí."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-900/10">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
          Total fiado
        </p>
        <p className="mt-0.5 text-2xl font-bold text-amber-800 dark:text-amber-200">
          {formatCOP(totalDebt)}
        </p>
        <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
          {debtors.length} {debtors.length === 1 ? "cliente debe" : "clientes deben"}
        </p>
      </div>

      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white dark:divide-white/5 dark:border-white/10 dark:bg-white/5">
        {debtors.map((c) => (
          <li key={c.id} className="p-3">
            <button
              type="button"
              onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                  {c.name}
                  {c.alias && <span className="ml-1.5 text-xs text-slate-400">&quot;{c.alias}&quot;</span>}
                </p>
                {c.phone && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">{c.phone}</p>
                )}
              </div>
              <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                {formatCOP(c.debt)}
              </span>
            </button>
            {expandedId === c.id && <DebtorDetail customerId={c.id} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
