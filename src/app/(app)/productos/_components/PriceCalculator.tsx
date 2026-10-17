"use client";

import { useState } from "react";

import { type EnabledTax, formatCOP } from "./productForm";

export function PriceCalculator({
  businessTaxes,
  onApply,
}: Readonly<{
  businessTaxes: EnabledTax[];
  onApply: (price: number, cost: number, taxSlots: number[]) => void;
}>) {
  const [cost, setCost] = useState("");
  const [margin, setMargin] = useState("20");
  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);
  const [result, setResult] = useState<{ base: number; taxAmount: number; total: number } | null>(null);

  function toggleSlot(slot: number) {
    setSelectedSlots((prev) => (prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]));
    setResult(null);
  }

  function calculate() {
    const costNum = Number.parseFloat(cost);
    const marginNum = Number.parseFloat(margin);
    if (Number.isNaN(costNum) || costNum <= 0) return;
    const base = costNum * (1 + (Number.isNaN(marginNum) ? 0 : marginNum) / 100);
    const totalRate = businessTaxes
      .filter((t) => selectedSlots.includes(t.slot))
      .reduce((sum, t) => sum + t.rate, 0);
    const taxAmount = base * (totalRate / 100);
    // Aproxima por encima a la centena más cercana
    const total = Math.ceil((base + taxAmount) / 100) * 100;
    setResult({ base, taxAmount, total });
  }

  function apply() {
    const costNum = Number.parseFloat(cost);
    if (Number.isNaN(costNum) || result === null) return;
    onApply(result.total, costNum, selectedSlots);
    setCost("");
    setResult(null);
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 dark:border-violet-500/30 dark:bg-violet-900/10">
      <p className="mb-2 text-xs font-semibold text-violet-700 dark:text-violet-300">
        Calculadora de precio
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-xs">
          <span className="text-slate-600 dark:text-slate-400">Costo (COP)</span>
          <input
            type="number"
            min="0"
            step="100"
            value={cost}
            onChange={(e) => { setCost(e.target.value); setResult(null); }}
            placeholder="2000"
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-violet-400 dark:border-white/15 dark:bg-slate-900"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-slate-600 dark:text-slate-400">Margen de ganancia (%)</span>
          <input
            type="number"
            min="0"
            step="1"
            value={margin}
            onChange={(e) => { setMargin(e.target.value); setResult(null); }}
            placeholder="20"
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-violet-400 dark:border-white/15 dark:bg-slate-900"
          />
        </label>
      </div>

      <div className="mt-2 space-y-1 text-xs">
        <span className="text-slate-600 dark:text-slate-400">Impuestos que aplican a este producto</span>
        {businessTaxes.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400">
            Tu negocio no tiene impuestos configurados en Ajustes.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {businessTaxes.map((t) => (
              <button
                type="button"
                key={t.slot}
                onClick={() => toggleSlot(t.slot)}
                className={`rounded-full border px-2.5 py-1 font-medium transition ${
                  selectedSlots.includes(t.slot)
                    ? "border-violet-400 bg-violet-600 text-white"
                    : "border-violet-200 bg-white text-violet-700 hover:bg-violet-100 dark:border-violet-500/30 dark:bg-transparent dark:text-violet-300"
                }`}
              >
                {t.name} {t.rate}%
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={calculate}
          className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/40 dark:bg-transparent dark:text-violet-300 dark:hover:bg-violet-900/20"
        >
          Calcular
        </button>
        {result !== null && (
          <button
            type="button"
            onClick={apply}
            className="ml-auto rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-violet-700"
          >
            Aplicar al precio
          </button>
        )}
      </div>

      {result !== null && (
        <p className="mt-2 text-xs text-violet-700 dark:text-violet-300">
          Base {formatCOP(result.base)}
          {result.taxAmount > 0 && <> + impuestos {formatCOP(result.taxAmount)}</>}
          {" "}→ precio de venta{" "}
          <span className="font-bold">{formatCOP(result.total)}</span>
        </p>
      )}
    </div>
  );
}
