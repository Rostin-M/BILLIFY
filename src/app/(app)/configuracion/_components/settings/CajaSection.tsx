"use client";

import type { SectionProps } from "./types";
import { inputClass, labelTextClass } from "./ui";

export function CajaSection({ form, update }: SectionProps) {
  return (
    <label className="block max-w-40 space-y-1 text-sm">
      <span className={labelTextClass}>Máximo de cajas</span>
      <input
        type="number"
        required
        min="1"
        max="10"
        step="1"
        value={form.maxCashRegisters}
        onChange={(e) => update({ maxCashRegisters: e.target.value })}
        className={inputClass}
      />
      <span className="block text-xs text-slate-500 dark:text-slate-500">Entre 1 y 10.</span>
    </label>
  );
}
