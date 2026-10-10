"use client";

import { useId, useState } from "react";

import {
  type ExtendTrialInput,
  type PlatformBusinessRow,
  TRIAL_EXTENSION_MAX_DAYS,
} from "~/lib/platform/contract";

import { days, formatDate, parseDigits } from "../_lib/format";
import { previewTrialExtension } from "../_lib/grant-preview";
import { Dialog } from "./Dialog";
import { buttonClass, inputClass, mutedText, Spinner } from "./ui";

const SHORTCUTS = [3, 7, 15] as const;

/** Dar más días de prueba gratis a un negocio que todavía no ha pagado. */
export function ExtendTrialDialog({
  business,
  trialEndsAt,
  onSubmit,
  onClose,
  isSubmitting,
  submitError,
}: Readonly<{
  business: PlatformBusinessRow;
  trialEndsAt: Date | null;
  onSubmit: (input: ExtendTrialInput) => void;
  onClose: () => void;
  isSubmitting: boolean;
  submitError: string | null;
}>) {
  const uid = useId();
  const [now] = useState(() => new Date());
  const [daysText, setDaysText] = useState("7");
  const [note, setNote] = useState("");

  const typed = parseDigits(daysText);
  const dayCount = typed !== null && typed >= 1 && typed <= TRIAL_EXTENSION_MAX_DAYS ? typed : null;
  const newEnd = dayCount === null ? null : previewTrialExtension(trialEndsAt, dayCount, now);
  const trialRunning = trialEndsAt !== null && trialEndsAt > now;
  const showError = dayCount === null && daysText !== "";
  const errorId = `${uid}-error`;

  return (
    <Dialog
      variant="modal"
      title="Extender prueba"
      subtitle={<span className="line-clamp-2">{business.name}</span>}
      onClose={onClose}
      busy={isSubmitting}
      onSubmit={() => {
        if (dayCount === null) return;
        onSubmit({ businessId: business.id, days: dayCount, note: note.trim() || undefined });
      }}
      footer={
        <div className="space-y-3">
          <p aria-live="polite" aria-atomic="true" className="text-sm">
            {newEnd ? (
              <>
                <span className={mutedText}>La prueba gratis queda hasta el </span>
                <span className="font-bold text-slate-900 dark:text-white">{formatDate(newEnd)}</span>
              </>
            ) : (
              <span className={mutedText}>Escribe los días para ver la nueva fecha.</span>
            )}
          </p>
          {submitError && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-100">
              {submitError}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={isSubmitting} className={buttonClass.secondary}>
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting || dayCount === null} className={buttonClass.primary}>
              {isSubmitting && <Spinner />}
              {isSubmitting ? "Extendiendo..." : "Extender prueba"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <p className={`text-sm ${mutedText}`}>
          {trialRunning && trialEndsAt
            ? `La prueba termina el ${formatDate(trialEndsAt)}. Los días se suman a esa fecha.`
            : "La prueba ya terminó. Los días cuentan desde hoy y el negocio vuelve a tener acceso completo."}
        </p>

        <fieldset>
          <legend className="text-sm font-semibold text-slate-900 dark:text-white">Días de más</legend>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {SHORTCUTS.map((n) => {
              const on = typed === n;
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={on}
                  aria-label={days(n)}
                  onClick={() => setDaysText(String(n))}
                  className={`inline-flex h-10 min-w-12 items-center justify-center rounded-lg border px-3 text-sm font-semibold tabular-nums transition ${
                    on
                      ? "border-blue-700 bg-blue-700 text-white dark:border-blue-500 dark:bg-blue-600"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-transparent dark:text-slate-200 dark:hover:bg-white/10"
                  }`}
                >
                  {n}
                </button>
              );
            })}
            <label className="flex items-center gap-2 text-sm">
              <span className={mutedText}>u otro valor</span>
              <input
                inputMode="numeric"
                autoComplete="off"
                value={daysText}
                onChange={(e) => setDaysText(e.target.value.replace(/\D/g, "").slice(0, 2))}
                aria-label="Días de más"
                aria-invalid={showError}
                aria-describedby={showError ? errorId : undefined}
                className={`${inputClass} w-20 text-center tabular-nums ${showError ? "border-red-500 dark:border-red-400" : ""}`}
              />
            </label>
          </div>
          {showError && (
            <p id={errorId} role="alert" className="mt-1 text-xs font-medium text-red-700 dark:text-red-300">
              Escribe un número de días entre 1 y {TRIAL_EXTENSION_MAX_DAYS}.
            </p>
          )}
        </fieldset>

        <div>
          <label htmlFor={`${uid}-note`} className="text-sm font-semibold text-slate-900 dark:text-white">
            Nota <span className={`font-normal ${mutedText}`}>(opcional)</span>
          </label>
          <textarea
            id={`${uid}-note`}
            rows={2}
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Por qué se la extiendes"
            className={`${inputClass} mt-2 resize-y`}
          />
        </div>
      </div>
    </Dialog>
  );
}
