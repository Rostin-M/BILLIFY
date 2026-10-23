"use client";

import { AlertTriangle } from "lucide-react";
import { useId, useState } from "react";

import { GRANT_REASON_LABELS, type PlatformPaymentRow, type RevokeGrantInput } from "~/lib/platform/contract";
import { getPlan } from "~/lib/subscription/catalog";
import { formatCents } from "~/app/_components/subscription/labels";

import { accessLine, days, formatDate } from "../_lib/format";
import { Dialog } from "./Dialog";
import { buttonClass, Callout, inputClass, mutedText, PhaseChip, Spinner } from "./ui";

const MIN_NOTE = 5;

/**
 * Confirmación para revocar una activación manual. Es la única acción que le
 * quita acceso a un cliente, así que exige escribir el motivo y muestra cómo
 * queda la suscripción (calculado por el servidor en `grant.revokePreview`)
 * antes de dejar confirmar.
 */
export function RevokeGrantDialog({
  payment,
  ownerEmail,
  onSubmit,
  onClose,
  isSubmitting,
  submitError,
}: Readonly<{
  /** El pago manual cuya activación se revoca (debe traer `grant` revocable). */
  payment: PlatformPaymentRow;
  /** Correo del dueño, para ofrecer avisarle; null si no hay a quién. */
  ownerEmail: string | null;
  onSubmit: (input: RevokeGrantInput) => void;
  onClose: () => void;
  isSubmitting: boolean;
  submitError: string | null;
}>) {
  const uid = useId();
  const [note, setNote] = useState("");
  const [notifyOwner, setNotifyOwner] = useState(false);
  const [tried, setTried] = useState(false);

  const grant = payment.grant;
  const grantDays = grant?.days ?? 0;
  const planName = getPlan(payment.plan).name;
  const after = grant?.revokePreview ?? null;
  const noteValid = note.trim().length >= MIN_NOTE;
  const showError = tried && !noteValid;
  const errorId = `${uid}-error`;

  return (
    <Dialog
      variant="modal"
      title="Revocar esta activación"
      subtitle={<span className="line-clamp-2">{payment.businessName}</span>}
      onClose={onClose}
      busy={isSubmitting}
      onSubmit={() => {
        setTried(true);
        if (!noteValid) return;
        onSubmit({ paymentId: payment.id, note: note.trim(), notifyOwner: notifyOwner && ownerEmail !== null });
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
              No, dejarla como está
            </button>
            <button type="submit" disabled={isSubmitting} className={buttonClass.danger}>
              {isSubmitting && <Spinner />}
              {isSubmitting ? "Revocando..." : "Revocar activación"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-slate-100 px-3 py-2.5 text-sm dark:bg-white/5">
          <div>
            <dt className={`text-xs ${mutedText}`}>Activación</dt>
            <dd className="font-semibold text-slate-900 dark:text-white">
              {planName}, {days(grantDays)}
            </dd>
          </div>
          <div>
            <dt className={`text-xs ${mutedText}`}>Hecha el</dt>
            <dd className="font-semibold text-slate-900 dark:text-white">{formatDate(payment.createdAt)}</dd>
          </div>
          <div>
            <dt className={`text-xs ${mutedText}`}>Motivo original</dt>
            <dd className="font-medium text-slate-900 dark:text-white">
              {grant ? GRANT_REASON_LABELS[grant.reason] : "Sin dato"}
            </dd>
          </div>
          <div>
            <dt className={`text-xs ${mutedText}`}>Monto registrado</dt>
            <dd className="font-medium tabular-nums text-slate-900 dark:text-white">
              {formatCents(payment.amountInCents)}
            </dd>
          </div>
          {grant?.externalReference && (
            <div className="col-span-2">
              <dt className={`text-xs ${mutedText}`}>Comprobante</dt>
              <dd className="break-all font-medium tabular-nums text-slate-900 dark:text-white">
                {grant.externalReference}
              </dd>
            </div>
          )}
        </dl>

        <Callout tone="danger" icon={AlertTriangle}>
          <p className="font-semibold">La suscripción vuelve a como estaba justo antes de esta activación.</p>
          {after ? (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Queda en {getPlan(after.plan).name}</span>
              <PhaseChip phase={after.phase} />
              <span className="basis-full">{accessLine(after)}.</span>
            </p>
          ) : (
            <p className="mt-1">Se le quitan los {days(grantDays)} que le diste.</p>
          )}
          <p className="mt-1.5">
            Desde aquí no se devuelve dinero: si hay que devolverlo, hazlo por Nequi o por el banco. Los datos del
            negocio no se borran.
          </p>
        </Callout>

        <div>
          <label htmlFor={`${uid}-note`} className="text-sm font-semibold text-slate-900 dark:text-white">
            Por qué la revocas
          </label>
          <p className={`mt-0.5 text-xs ${mutedText}`}>Queda guardado en la bitácora y en el pago.</p>
          <textarea
            id={`${uid}-note`}
            rows={2}
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-invalid={showError}
            aria-describedby={showError ? errorId : undefined}
            placeholder="Ej.: activé el plan equivocado"
            className={`${inputClass} mt-2 resize-y ${showError ? "border-red-500 dark:border-red-400" : ""}`}
          />
          {showError && (
            <p id={errorId} role="alert" className="mt-1 text-xs font-medium text-red-700 dark:text-red-300">
              Escribe el motivo para poder revocar.
            </p>
          )}
        </div>

        <label
          className={`admin-choice flex items-start gap-3 rounded-xl border border-slate-300 px-3 py-2.5 dark:border-white/15 ${
            ownerEmail ? "cursor-pointer" : "opacity-70"
          }`}
        >
          <input
            type="checkbox"
            checked={notifyOwner && ownerEmail !== null}
            disabled={ownerEmail === null}
            onChange={(e) => setNotifyOwner(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded accent-blue-700"
          />
          <span className="min-w-0 text-sm font-semibold text-slate-900 dark:text-white">
            Avisar al dueño por correo<span className={`block break-words text-xs font-normal ${mutedText}`}>
              {ownerEmail
                ? `Si la marcas, se le avisa a ${ownerEmail}. Si no, no se le envía nada.`
                : "No se puede: este negocio no tiene un dueño activo con correo."}
            </span>
          </span>
        </label>
      </div>
    </Dialog>
  );
}
