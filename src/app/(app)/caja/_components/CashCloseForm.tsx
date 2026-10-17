"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { api } from "~/trpc/react";
import { formatCOP } from "~/lib/format/money";
import { cashDifference, COP_BILLS, COP_COINS, type CashBreakdown } from "~/lib/cash/denominations";

type Props = {
  /** Caja de otro empleado (solo el dueño); sin id, la caja propia. */
  registerId?: string;
  /** Efectivo esperado; null = cierre ciego (se conoce después de contar). */
  expected: number | null;
  byDenomination: boolean;
  /** Para el título cuando el dueño cierra la caja de otro. */
  ownerName?: string | null;
  onClosed: () => void;
  onCancel: () => void;
};

type Preview = { expected: number; countedCash: number; difference: number };

const INPUT =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-violet-400 focus:ring-2 dark:border-white/15 dark:bg-slate-900 dark:text-white";

function DenominationRow({
  value,
  count,
  onChange,
}: Readonly<{ value: number; count: string; onChange: (count: string) => void }>) {
  const qty = Number.parseInt(count, 10) || 0;
  return (
    <li className="flex items-center gap-3 py-1.5">
      <label htmlFor={`den-${value}`} className="w-24 shrink-0 text-sm font-medium tabular-nums text-slate-700 dark:text-slate-200">
        {formatCOP(value)}
      </label>
      <span aria-hidden="true" className="text-xs text-slate-400">×</span>
      <input
        id={`den-${value}`}
        type="number"
        inputMode="numeric"
        min="0"
        step="1"
        value={count}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        placeholder="0"
        aria-label={`Cantidad de ${formatCOP(value)}`}
        className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-2 text-center text-sm tabular-nums outline-none ring-violet-400 focus:ring-2 dark:border-white/15 dark:bg-slate-900 dark:text-white"
      />
      <span className="ml-auto text-sm tabular-nums text-slate-500 dark:text-slate-400">
        {qty > 0 ? formatCOP(qty * value) : "—"}
      </span>
    </li>
  );
}

function DifferenceLine({ difference }: Readonly<{ difference: number }>) {
  if (difference === 0) {
    return (
      <p className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 aria-hidden="true" className="h-4 w-4" /> Cuadra exacto
      </p>
    );
  }
  return (
    <p className="flex items-center gap-1.5 font-semibold text-red-600 dark:text-red-400">
      <AlertTriangle aria-hidden="true" className="h-4 w-4" />
      {difference < 0 ? "Faltan" : "Sobran"} {formatCOP(Math.abs(difference))}
    </p>
  );
}

/**
 * Cierre de caja con cuadre: se cuenta el efectivo (total o por billetes y monedas) y se
 * compara con lo esperado. En cierre ciego primero se cuenta y después se ve el resultado.
 * Si no cuadra, el motivo es obligatorio (el servidor también lo exige).
 */
export function CashCloseForm({ registerId, expected, byDenomination, ownerName, onClosed, onCancel }: Readonly<Props>) {
  const blind = expected === null;
  const [amount, setAmount] = useState("");
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);

  const utils = api.useUtils();

  const breakdown: CashBreakdown = Object.fromEntries(
    Object.entries(counts)
      .map(([d, c]) => [d, Number.parseInt(c, 10) || 0] as const)
      .filter(([, c]) => c > 0),
  );
  const countedFromBreakdown = Object.entries(breakdown).reduce((s, [d, c]) => s + Number(d) * c, 0);
  const parsedAmount = Number.parseFloat(amount);
  const counted = byDenomination ? countedFromBreakdown : parsedAmount;
  const hasCount = byDenomination ? Object.keys(counts).some((d) => counts[Number(d)] !== "") : amount !== "";
  const validCount = hasCount && !Number.isNaN(counted) && counted >= 0;

  const countInput = {
    registerId,
    countedCash: counted,
    countedBreakdown: byDenomination ? breakdown : undefined,
  };

  const countCash = api.cashRegister.countCash.useMutation({
    onSuccess: (data) => setPreview(data),
  });

  const closeRegister = api.cashRegister.close.useMutation({
    onSuccess: async (data) => {
      toast.success(
        data.difference === 0
          ? "Caja cerrada. El efectivo cuadró exacto."
          : `Caja cerrada con ${data.difference < 0 ? "faltante" : "sobrante"} de ${formatCOP(Math.abs(data.difference))}.`,
      );
      await Promise.all([
        utils.cashRegister.getActive.invalidate(),
        utils.cashRegister.listHistory.invalidate(),
        utils.cashRegister.listActive.invalidate(),
      ]);
      onClosed();
    },
  });

  // Diferencia: en vivo si el esperado es visible; tras el conteo previo si es ciego.
  let difference: number | null = null;
  if (preview) difference = preview.difference;
  else if (!blind && validCount) difference = cashDifference(counted, expected);
  const noteRequired = difference !== null && difference !== 0;
  const canConfirm = validCount && difference !== null && (!noteRequired || note.trim().length > 0);

  function confirmClose() {
    if (!canConfirm || closeRegister.isPending) return;
    closeRegister.mutate({ ...countInput, closingNote: note.trim() || undefined });
  }

  const reviewing = blind && preview !== null;
  const title = ownerName ? `Cerrar la caja de ${ownerName}` : "Cerrar caja";
  const error = countCash.error ?? closeRegister.error;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
      {/* Ancho de lectura: en escritorio la tarjeta ocupa toda la fila */}
      <div className="max-w-2xl">
        <h3 className="font-semibold text-slate-800 dark:text-white">{title}</h3>

        {!reviewing && (
          <>
            <p className="mb-4 mt-1 text-sm text-slate-500 dark:text-slate-400">
              {byDenomination
                ? "Cuenta cuántos billetes y monedas hay de cada valor."
                : "Cuenta todo el efectivo que hay en el cajón y escribe el total."}
              {blind && " Después verás si cuadra con lo que registró el sistema."}
            </p>

            {byDenomination ? (
              <div className="grid gap-x-8 sm:grid-cols-2">
                <fieldset>
                  <legend className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Billetes</legend>
                  <ul className="divide-y divide-slate-100 dark:divide-white/5">
                    {COP_BILLS.map((d) => (
                      <DenominationRow key={d} value={d} count={counts[d] ?? ""} onChange={(c) => setCounts((p) => ({ ...p, [d]: c }))} />
                    ))}
                  </ul>
                </fieldset>
                <fieldset className="mt-3 sm:mt-0">
                  <legend className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Monedas</legend>
                  <ul className="divide-y divide-slate-100 dark:divide-white/5">
                    {COP_COINS.map((d) => (
                      <DenominationRow key={d} value={d} count={counts[d] ?? ""} onChange={(c) => setCounts((p) => ({ ...p, [d]: c }))} />
                    ))}
                  </ul>
                </fieldset>
                <p className="mt-3 flex items-baseline justify-between border-t border-slate-200 pt-3 sm:col-span-2 dark:border-white/10">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Total contado</span>
                  <span className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{formatCOP(countedFromBreakdown)}</span>
                </p>
              </div>
            ) : (
              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Efectivo contado</span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="50"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    autoFocus
                    className={`${INPUT} pl-7 text-lg font-semibold`}
                  />
                </div>
              </label>
            )}

            {!blind && (
              <div className="mt-4 space-y-1 rounded-xl bg-slate-50 p-3 text-sm dark:bg-white/5" aria-live="polite">
                <p className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Esperado por el sistema</span>
                  <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatCOP(expected)}</span>
                </p>
                {difference !== null && <DifferenceLine difference={difference} />}
              </div>
            )}
          </>
        )}

        {reviewing && (
          <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-4 text-sm dark:bg-white/5" aria-live="polite">
            <p className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Esperado por el sistema</span>
              <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatCOP(preview.expected)}</span>
            </p>
            <p className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Contado</span>
              <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatCOP(preview.countedCash)}</span>
            </p>
            <div className="border-t border-slate-200 pt-2 dark:border-white/10">
              <DifferenceLine difference={preview.difference} />
            </div>
          </div>
        )}

        {(reviewing || !blind) && (
          <label className="mt-4 block space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {noteRequired ? "Motivo de la diferencia (obligatorio)" : "Nota de cierre (opcional)"}
            </span>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required={noteRequired}
              maxLength={500}
              placeholder={noteRequired ? "Ej: Se dio mal un vuelto, se pagó un domicilio sin registrar…" : "Ej: Todo en orden"}
              className={`${INPUT} resize-none`}
            />
          </label>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error.message}</p>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {blind && !reviewing ? (
            <button
              type="button"
              onClick={() => countCash.mutate(countInput)}
              disabled={!validCount || countCash.isPending}
              aria-busy={countCash.isPending}
              className="min-h-11 flex-1 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {countCash.isPending ? "Revisando…" : "Continuar"}
            </button>
          ) : (
            <button
              type="button"
              onClick={confirmClose}
              disabled={!canConfirm || closeRegister.isPending}
              aria-busy={closeRegister.isPending}
              className="min-h-11 flex-1 rounded-xl bg-red-600 px-4 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {closeRegister.isPending ? "Cerrando…" : "Confirmar cierre"}
            </button>
          )}
          {reviewing && (
            <button
              type="button"
              onClick={() => { setPreview(null); setNote(""); closeRegister.reset(); }}
              className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            >
              Volver a contar
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
