"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { formatCOP } from "~/lib/format/money";
import { NewPurchaseForm } from "./NewPurchaseForm";
import { PayablesList } from "./PayablesList";
import { SuppliersList } from "./SuppliersList";

type Tab = "new" | "payables" | "suppliers";

export function ComprasClient({ isOwner }: Readonly<{ isOwner: boolean }>) {
  const [tab, setTab] = useState<Tab>("new");
  const { data: summary } = api.purchase.payablesSummary.useQuery();

  const tabs: { id: Tab; label: string; badge?: string }[] = [
    { id: "new", label: "Registrar compra" },
    { id: "payables", label: "Por pagar", badge: summary && summary.count > 0 ? String(summary.count) : undefined },
    { id: "suppliers", label: "Proveedores" },
  ];

  return (
    <div className="space-y-4">
      {summary && summary.total > 0 && (
        <button
          type="button"
          onClick={() => setTab("payables")}
          className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition ${
            summary.overdue > 0
              ? "border-red-200 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-900/15 dark:text-red-200"
              : "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-900/15 dark:text-amber-200"
          }`}
        >
          <span>
            Les debes a tus proveedores
            {summary.overdue > 0 && (
              <span className="font-semibold"> · {summary.overdue} {summary.overdue === 1 ? "compra vencida" : "compras vencidas"}</span>
            )}
          </span>
          <span className="shrink-0 text-base font-bold tabular-nums">{formatCOP(summary.total)}</span>
        </button>
      )}

      <div role="tablist" aria-label="Secciones de compras" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200/60 p-1 dark:bg-white/5">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold transition ${
              tab === t.id
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
            {t.badge && (
              <span className="rounded-full bg-amber-500 px-1.5 text-xs font-bold tabular-nums text-white">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "new" && <NewPurchaseForm />}
      {tab === "payables" && <PayablesList />}
      {tab === "suppliers" && <SuppliersList isOwner={isOwner} />}
    </div>
  );
}
