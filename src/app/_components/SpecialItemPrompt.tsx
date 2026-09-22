"use client";

import { useState } from "react";

const fmt = (v: number) => v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });

function roundUpToHundred(amount: number): number {
  return Math.ceil(amount / 100) * 100;
}

type Props = {
  product: { name: string; price: number };
  /** "weight": se pide el peso en kg y se calcula el total con `product.price` como precio por kg.
   *  "amount": se pide directamente el monto total de la línea. */
  mode: "weight" | "amount";
  onConfirm: (value: number) => void;
  onCancel: () => void;
};

export function SpecialItemPrompt({ product, mode, onConfirm, onCancel }: Readonly<Props>) {
  const [value, setValue] = useState("");
  const parsed = Number.parseFloat(value);
  const valid = !Number.isNaN(parsed) && parsed > 0;
  const preview = mode === "weight" && valid ? roundUpToHundred(product.price * parsed) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
        <h3 className="font-semibold text-slate-800 dark:text-white">{product.name}</h3>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          {mode === "weight" ? `Indica el peso (${fmt(product.price)} por kg)` : "Indica el monto a cobrar"}
        </p>
        <div className="relative">
          {mode === "amount" && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
          )}
          <input
            autoFocus
            type="number"
            min="0"
            step={mode === "weight" ? "0.01" : "100"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid) onConfirm(mode === "weight" ? parsed : parsed);
            }}
            placeholder={mode === "weight" ? "0.0" : "3000"}
            className={`w-full rounded-xl border border-slate-200 bg-white py-3 text-lg outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200 dark:border-white/10 dark:bg-white/5 dark:text-white ${mode === "amount" ? "pl-7 pr-4" : "px-4"}`}
          />
          {mode === "weight" && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">kg</span>
          )}
        </div>

        {preview !== null && (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Total: <span className="font-semibold text-slate-800 dark:text-slate-100">{fmt(preview)}</span>
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => valid && onConfirm(parsed)}
            disabled={!valid}
            className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-bold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Agregar
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 px-4 text-sm text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
