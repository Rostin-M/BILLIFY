"use client";

import { type AdjustForm, INPUT } from "./productForm";
import { ProductFormFields } from "./ProductFormFields";

export function ProductEditPanel({
  formProps,
  formError,
  isPending,
  onSubmit,
  onCancel,
}: Readonly<{
  formProps: Parameters<typeof ProductFormFields>[0];
  formError?: string | null;
  isPending: boolean;
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}>) {
  return (
    <div className="border-t border-slate-100 pb-4 pt-3 dark:border-white/5">
      <form onSubmit={onSubmit} className="space-y-3">
        <ProductFormFields {...formProps} />
        {formError && (
          <p className="text-xs text-red-600 dark:text-red-400">{formError}</p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="submit"
            disabled={isPending}
            aria-busy={isPending}
            className="min-h-11 rounded-lg bg-violet-600 px-3 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-60"
          >
            {isPending ? "Guardando..." : "Guardar"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

export function ProductPricePanel({
  currentPrice,
  priceForm,
  onPriceChange,
  onSubmit,
  isPending,
  errorMessage,
  onCancel,
}: Readonly<{
  currentPrice: number;
  priceForm: string;
  onPriceChange: (value: string) => void;
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void;
  isPending: boolean;
  errorMessage?: string;
  onCancel: () => void;
}>) {
  return (
    <div className="border-t border-slate-100 pb-4 pt-3 dark:border-white/5">
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
        El cambio quedará registrado con tu nombre y la hora exacta.
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex-1 space-y-1 text-sm sm:min-w-40">
          <span className="text-slate-700 dark:text-slate-300">
            Nuevo precio (COP)
          </span>
          <input
            required
            type="number"
            min="1"
            step="1"
            value={priceForm}
            onChange={(e) => onPriceChange(e.target.value)}
            className={INPUT}
            placeholder={String(currentPrice)}
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending}
            aria-busy={isPending}
            className="min-h-11 flex-1 rounded-lg bg-violet-600 px-3 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-60 sm:flex-none"
          >
            {isPending ? "Guardando..." : "Guardar precio"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
          >
            Cancelar
          </button>
        </div>
      </form>
      {errorMessage && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
      )}
    </div>
  );
}

export function ProductAdjustPanel({
  adjustForm,
  onQuantityChange,
  onNoteChange,
  onSubmit,
  isPending,
  errorMessage,
  onCancel,
}: Readonly<{
  adjustForm: AdjustForm;
  onQuantityChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void;
  isPending: boolean;
  errorMessage?: string;
  onCancel: () => void;
}>) {
  return (
    <div className="border-t border-slate-100 pb-4 pt-3 dark:border-white/5">
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
        Usa número positivo para agregar stock, negativo para reducirlo.
        Este movimiento queda registrado con tu nombre en el historial.
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <label className="flex-1 space-y-1 text-sm sm:min-w-32">
          <span className="text-slate-700 dark:text-slate-300">
            Cantidad (+/-)
          </span>
          <input
            required
            type="number"
            value={adjustForm.quantity}
            onChange={(e) => onQuantityChange(e.target.value)}
            className={INPUT}
            placeholder="Ej: 10 o -3"
          />
        </label>
        <label className="space-y-1 text-sm sm:min-w-48 sm:flex-[2]">
          <span className="text-slate-700 dark:text-slate-300">
            Motivo <span className="text-slate-500">(opc.)</span>
          </span>
          <input
            value={adjustForm.note}
            onChange={(e) => onNoteChange(e.target.value)}
            className={INPUT}
            placeholder="Ej: Recepción de pedido"
          />
        </label>
        <div className="flex gap-2 sm:items-end">
          <button
            type="submit"
            disabled={isPending}
            aria-busy={isPending}
            className="min-h-11 flex-1 rounded-lg bg-amber-500 px-3 text-sm font-medium text-white transition hover:bg-amber-400 disabled:opacity-60 sm:flex-none"
          >
            {isPending ? "Ajustando..." : "Aplicar ajuste"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
          >
            Cancelar
          </button>
        </div>
      </form>
      {errorMessage && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
      )}
    </div>
  );
}
