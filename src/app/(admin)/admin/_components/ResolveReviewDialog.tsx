"use client";

import { useId, useState } from "react";

import { type PlatformPaymentRow, type ResolvePaymentReviewInput } from "~/lib/platform/contract";
import { getPlan } from "~/lib/subscription/catalog";
import { formatCents, PAYMENT_STATUS_LABELS } from "~/app/_components/subscription/labels";

import { formatDateTime } from "../_lib/format";
import { Dialog } from "./Dialog";
import { buttonClass, inputClass, mutedText, Spinner } from "./ui";

const MIN_NOTE = 5;

/**
 * Marcar como revisado un pago que el sistema señaló (p. ej. anulado después
 * de aprobarse). No cambia el pago ni la suscripción: solo lo saca de la cola
 * "por revisar" y deja escrito qué se hizo.
 */
export function ResolveReviewDialog({
  payment,
  onSubmit,
  onClose,
  isSubmitting,
  submitError,
}: Readonly<{
  payment: PlatformPaymentRow;
  onSubmit: (input: ResolvePaymentReviewInput) => void;
  onClose: () => void;
  isSubmitting: boolean;
  submitError: string | null;
}>) {
  const uid = useId();
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const noteValid = note.trim().length >= MIN_NOTE;
  const showError = tried && !noteValid;
  const errorId = `${uid}-error`;

  return (
    <Dialog
      variant="modal"
      title="Marcar como revisado"
      subtitle={<span className="line-clamp-2">{payment.businessName}</span>}
      onClose={onClose}
      busy={isSubmitting}
      onSubmit={() => {
        setTried(true);
        if (!noteValid) return;
        onSubmit({ paymentId: payment.id, note: note.trim() });
      }}
      footer={
        <div className="space-y-3">
          {submitError && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-100">
              {submitError}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={isSubmitting} className={buttonClass.secondary}>
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting} className={buttonClass.primary}>
              {isSubmitting && <Spinner />}
              {isSubmitting ? "Guardando..." : "Marcar como revisado"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-slate-100 px-3 py-2.5 text-sm dark:bg-white/5">
          <div>
            <dt className={`text-xs ${mutedText}`}>Pago</dt>
            <dd className="font-semibold text-slate-900 dark:text-white">
              {getPlan(payment.plan).name}, {formatCents(payment.amountInCents)}
            </dd>
          </div>
          <div>
            <dt className={`text-xs ${mutedText}`}>Estado</dt>
            <dd className="font-semibold text-slate-900 dark:text-white">{PAYMENT_STATUS_LABELS[payment.status]}</dd>
          </div>
          <div>
            <dt className={`text-xs ${mutedText}`}>Fecha</dt>
            <dd className="font-medium text-slate-900 dark:text-white">
              {formatDateTime(payment.paidAt ?? payment.createdAt)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className={`text-xs ${mutedText}`}>Referencia</dt>
            <dd className="break-all font-medium tabular-nums text-slate-900 dark:text-white">{payment.reference}</dd>
          </div>
        </dl>

        {payment.statusMessage && (
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">{payment.statusMessage}</p>
        )}

        <p className={`text-sm ${mutedText}`}>
          Marcarlo no cambia el pago ni el acceso del negocio: solo lo saca de la lista de pendientes. Si hay que
          corregir el acceso, hazlo antes desde el negocio.
        </p>

        <div>
          <label htmlFor={`${uid}-note`} className="text-sm font-semibold text-slate-900 dark:text-white">
            Qué encontraste o qué hiciste
          </label>
          <p className={`mt-0.5 text-xs ${mutedText}`}>Queda guardado en la bitácora.</p>
          <textarea
            id={`${uid}-note`}
            rows={2}
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-invalid={showError}
            aria-describedby={showError ? errorId : undefined}
            placeholder="Ej.: hablé con el dueño y volvió a pagar por Nequi"
            className={`${inputClass} mt-2 resize-y ${showError ? "border-red-500 dark:border-red-400" : ""}`}
          />
          {showError && (
            <p id={errorId} role="alert" className="mt-1 text-xs font-medium text-red-700 dark:text-red-300">
              Escribe una nota para poder marcarlo como revisado.
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
