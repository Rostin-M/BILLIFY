"use client";

import { useState } from "react";
import { api } from "~/trpc/react";

export function CashOpenForm() {
  const [openingBalance, setOpeningBalance] = useState("");
  const utils = api.useUtils();

  const openRegister = api.cashRegister.open.useMutation({
    onSuccess: () => utils.cashRegister.getActive.invalidate(),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(openingBalance);
    if (isNaN(amount) || amount < 0) return;
    openRegister.mutate({ openingBalance: amount });
  }

  const formatCOP = (v: number) =>
    v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-white/5">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-2xl dark:bg-white/10">
            🏧
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">Abrir caja</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Registra el fondo inicial para comenzar la jornada.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Fondo inicial
            </span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">
                $
              </span>
              <input
                type="number"
                min="0"
                step="100"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder="0"
                className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-7 pr-4 text-lg font-semibold outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900 dark:text-white"
                autoFocus
              />
            </div>
            {openingBalance && !isNaN(parseFloat(openingBalance)) && (
              <p className="text-xs text-slate-400">
                {formatCOP(parseFloat(openingBalance))}
              </p>
            )}
          </label>

          {openRegister.error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-900/10 dark:text-red-300">
              {openRegister.error.message}
            </p>
          )}

          <button
            type="submit"
            disabled={!openingBalance || isNaN(parseFloat(openingBalance)) || openRegister.isPending}
            className="w-full rounded-xl bg-violet-600 py-3 text-base font-bold text-white shadow transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {openRegister.isPending ? "Abriendo..." : "Abrir caja"}
          </button>
        </form>
      </div>
    </div>
  );
}
