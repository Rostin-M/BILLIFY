"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { CajaPdfActions } from "./CajaPdfActions";

type Props = {
  registerId: string;
  business: { name: string; document: string; logoUrl?: string | null };
  openedAt: Date;
};

export function CashHistoryPdfButton({ registerId, business, openedAt }: Readonly<Props>) {
  const [enabled, setEnabled] = useState(false);

  const { data, isPending } = api.cashRegister.getReport.useQuery(
    { id: registerId },
    { enabled },
  );

  if (enabled && isPending) {
    return (
      <span className="text-xs text-slate-400 dark:text-slate-500">Cargando…</span>
    );
  }

  if (enabled && data) {
    const dateStr = new Date(openedAt).toISOString().split("T")[0] ?? "caja";
    return (
      <CajaPdfActions
        business={business}
        register={data}
        fileName={`reporte-caja-${dateStr}.pdf`}
        onClose={() => setEnabled(false)}
      />
    );
  }

  return (
    <button
      onClick={() => setEnabled(true)}
      className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
    >
      Reporte PDF
    </button>
  );
}
