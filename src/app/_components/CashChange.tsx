"use client";

import { useId, useState } from "react";

import { formatCOP } from "~/lib/format/money";

/** Billetes sugeridos para "Paga con": el total redondeado y los billetes que lo cubren. */
export function suggestedBills(total: number): number[] {
  const roundedUp = Math.ceil(total / 1000) * 1000;
  const bills = [2000, 5000, 10000, 20000, 50000, 100000].filter((b) => b > roundedUp);
  return [...new Set([roundedUp, ...bills])].filter((v) => v > total).slice(0, 3);
}

/** Vuelto en pantalla, no se guarda. Quien lo usa pasa `key={total}` para reiniciarlo. */
export function CashChange({ total, className = "mt-3" }: Readonly<{ total: number; className?: string }>) {
  const inputId = useId();
  const [received, setReceived] = useState("");
  const paid = Number.parseInt(received.replace(/\D/g, ""), 10);
  const hasValue = !Number.isNaN(paid) && paid > 0;
  const change = hasValue ? paid - total : 0;

  return (
    <div className={`${className} rounded-xl border border-slate-200 p-3 dark:border-white/10`}>
      <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
        Paga con (opcional)
      </label>
      <input
        id={inputId}
        inputMode="numeric"
        value={received ? Number(received.replace(/\D/g, "") || 0).toLocaleString("es-CO") : ""}
        onChange={(e) => setReceived(e.target.value.replace(/\D/g, ""))}
        placeholder="$ 0"
        className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-base tabular-nums outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500 sm:text-sm dark:border-white/10 dark:bg-white/5 dark:text-white"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setReceived(String(total))}
          className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
        >
          Exacto
        </button>
        {suggestedBills(total).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setReceived(String(b))}
            className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium tabular-nums text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            {formatCOP(b)}
          </button>
        ))}
      </div>
      {hasValue && (
        <p
          role="status"
          className={`mt-2 flex items-baseline justify-between text-sm font-medium ${
            change >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-400"
          }`}
        >
          <span>{change >= 0 ? "Cambio a devolver" : "Faltan"}</span>
          <span className="text-xl font-bold tabular-nums">{formatCOP(Math.abs(change))}</span>
        </p>
      )}
    </div>
  );
}
