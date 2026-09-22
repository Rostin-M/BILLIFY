"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { api } from "~/trpc/react";

const CashHistoryPdfButton = dynamic(
  () => import("~/lib/pdf/CashHistoryPdfButton").then((m) => m.CashHistoryPdfButton),
  { ssr: false, loading: () => <span className="text-xs text-slate-500">…</span> },
);

type Props = { business: { name: string; document: string; logoUrl?: string | null } };

export function CashHistory({ business }: Readonly<Props>) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data: history = [], isPending } = api.cashRegister.listHistory.useQuery();

  const formatCOP = (v: number) =>
    v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });

  const formatDate = (d: Date) =>
    new Date(d).toLocaleDateString("es-CO", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  const formatTime = (d: Date) =>
    new Date(d).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

  function duration(openedAt: Date, closedAt: Date | null) {
    if (!closedAt) return "—";
    const mins = Math.round((new Date(closedAt).getTime() - new Date(openedAt).getTime()) / 60000);
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="font-semibold text-slate-700 dark:text-slate-200">Historial de cierres</h2>
        {!isPending && (
          <span className="text-xs text-slate-500 dark:text-slate-500">
            {history.length} {history.length === 1 ? "jornada" : "jornadas"}
          </span>
        )}
      </div>

      {isPending && (
        <p className="px-5 pb-5 text-sm text-slate-500 dark:text-slate-500">Cargando historial...</p>
      )}
      {!isPending && history.length === 0 && (
        <p className="px-5 pb-5 text-sm text-slate-500 dark:text-slate-500">
          Aún no hay cierres registrados.
        </p>
      )}
      {!isPending && history.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-white/5">
          {history.map((entry) => {
            const net = (entry.closingBalance ?? 0) - entry.openingBalance;
            const isExpanded = expanded === entry.id;

            return (
              <li key={entry.id}>
                <button
                  onClick={() => setExpanded(isExpanded ? null : entry.id)}
                  className="flex w-full items-start justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-white/5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {formatDate(entry.openedAt)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-500">
                      {formatTime(entry.openedAt)} → {entry.closedAt ? formatTime(entry.closedAt) : "—"}
                      {" · "}
                      {duration(entry.openedAt, entry.closedAt)}
                      {entry.user?.name ? ` · ${entry.user.name}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      {formatCOP(entry.closingBalance ?? 0)}
                    </p>
                    <p className={`text-xs font-medium ${net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                      {net >= 0 ? "+" : ""}{formatCOP(net)}
                    </p>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50 px-5 py-4 dark:border-white/5 dark:bg-white/5">
                    <div className="mb-3">
                      <CashHistoryPdfButton
                        registerId={entry.id}
                        business={business}
                        openedAt={new Date(entry.openedAt)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-500">Fondo inicial</p>
                        <p className="font-semibold text-slate-700 dark:text-slate-200">
                          {formatCOP(entry.openingBalance)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-500">Saldo al cierre</p>
                        <p className="font-semibold text-slate-700 dark:text-slate-200">
                          {formatCOP(entry.closingBalance ?? 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-500">Movimientos</p>
                        <p className="font-semibold text-slate-700 dark:text-slate-200">
                          {entry._count.movements}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-500">Diferencia neta</p>
                        <p className={`font-bold ${net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                          {net >= 0 ? "+" : ""}{formatCOP(net)}
                        </p>
                      </div>
                    </div>
                    {entry.closingNote && (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5">
                        <p className="text-xs text-slate-500 dark:text-slate-500">Nota de cierre</p>
                        <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-200">
                          {entry.closingNote}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
