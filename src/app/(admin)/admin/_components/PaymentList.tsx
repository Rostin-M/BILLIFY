import Link from "next/link";

import { GRANT_REASON_LABELS, type PlatformPaymentRow } from "~/lib/platform/contract";
import { CYCLE_LABELS, getPlan } from "~/lib/subscription/catalog";
import { formatCents } from "~/app/_components/subscription/labels";

import { days, formatCompactDate, formatDateTime } from "../_lib/format";
import { buttonClass, linkClass, mutedText, PaymentStatusChip, Tag } from "./ui";

function concept(p: PlatformPaymentRow): string {
  const plan = getPlan(p.plan).name;
  if (p.grant) return `Activación manual: ${plan}, ${days(p.grant.days)}`;
  if (p.kind === "UPGRADE") return `Cambio a ${plan} (resto del período)`;
  return `Plan ${plan} ${CYCLE_LABELS[p.billingCycle].toLowerCase()}`;
}

/**
 * Lista de pagos (del negocio o global). Muestra de dónde vino cada uno
 * (pasarela o manual), su comprobante, qué período cubrió y por qué está
 * marcado para revisar.
 */
export function PaymentList({
  payments,
  showBusiness = false,
  onRevoke,
  onResolveReview,
}: Readonly<{
  payments: PlatformPaymentRow[];
  /** En la lista global: nombre del negocio con enlace a su detalle. */
  showBusiness?: boolean;
  /**
   * Si se pasa, cada activación manual vigente muestra "Revocar" cuando el
   * servidor la da por revocable, o la razón de por qué no.
   */
  onRevoke?: (payment: PlatformPaymentRow) => void;
  /** Si se pasa, los pagos por revisar muestran "Marcar como revisado". */
  onResolveReview?: (payment: PlatformPaymentRow) => void;
}>) {
  return (
    <ul className="divide-y divide-slate-100 dark:divide-white/5">
      {payments.map((p) => {
        const grant = p.grant;
        const revoked = grant?.revokedAt ?? null;
        const live = grant !== null && revoked === null && p.status === "APPROVED";
        return (
          <li
            key={p.id}
            className={`flex flex-col gap-2.5 px-4 py-3.5 sm:flex-row sm:items-start sm:gap-4 sm:px-5 ${
              p.needsReview ? "bg-amber-50/70 dark:bg-amber-900/10" : ""
            }`}
          >
            <div className="min-w-0 flex-1">
              {showBusiness && (
                <Link href={`/admin/negocios/${p.businessId}`} className={`${linkClass} line-clamp-1 text-sm`}>
                  {p.businessName}
                </Link>
              )}
              <p
                className={`font-semibold text-slate-900 dark:text-white ${revoked ? "line-through decoration-slate-400" : ""} ${showBusiness ? "mt-0.5 text-sm" : ""}`}
              >
                {concept(p)}
              </p>
              <p className={`mt-0.5 text-xs ${mutedText}`}>
                {formatDateTime(p.paidAt ?? p.createdAt)}
                {grant ? `, ${GRANT_REASON_LABELS[grant.reason].toLowerCase()}` : `, por ${p.provider}`}
                {grant?.grantedBy && `, la hizo ${grant.grantedBy}`}
              </p>
              {p.periodStart && p.periodEnd && !revoked && (
                <p className={`text-xs ${mutedText}`}>
                  Cubre del {formatCompactDate(p.periodStart)} al {formatCompactDate(p.periodEnd)}
                </p>
              )}
              {grant?.externalReference && (
                <p className="mt-1 break-all text-sm tabular-nums text-slate-800 dark:text-slate-200">
                  Comprobante {grant.externalReference}
                </p>
              )}
              {grant?.note && <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">Nota: {grant.note}</p>}
              {revoked && grant?.revokeNote && (
                <p className="mt-1 text-sm text-red-800 dark:text-red-200">Se revocó porque: {grant.revokeNote}</p>
              )}
              {p.statusMessage && p.status !== "APPROVED" && (
                <p
                  className={`mt-1 text-sm ${
                    p.needsReview ? "font-medium text-amber-900 dark:text-amber-200" : "text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {p.statusMessage}
                </p>
              )}
              <p className={`mt-1 break-all text-xs tabular-nums ${mutedText}`}>Referencia {p.reference}</p>
              {onRevoke && live && !grant.revocable && (
                <p className={`mt-1 text-xs ${mutedText}`}>
                  No se puede revocar: solo la activación más reciente del negocio, y si no hay pagos posteriores.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:max-w-[16rem] sm:flex-col sm:items-end">
              <span className="text-base font-bold tabular-nums text-slate-900 dark:text-white">
                {formatCents(p.amountInCents)}
              </span>
              <span className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                <PaymentStatusChip status={p.status} />
                {p.needsReview && <Tag tone="warn">Por revisar</Tag>}
                {revoked && <Tag tone="danger">Revocada el {formatCompactDate(revoked)}</Tag>}
              </span>
              {onResolveReview && p.needsReview && (
                <button type="button" onClick={() => onResolveReview(p)} className={`${buttonClass.row} basis-full sm:basis-auto`}>
                  <span>Marcar como revisado</span>
                  <span className="sr-only"> el pago de {p.businessName}</span>
                </button>
              )}
              {onRevoke && live && grant.revocable && (
                <button
                  type="button"
                  onClick={() => onRevoke(p)}
                  className="inline-flex min-h-11 sm:min-h-9 items-center rounded-lg px-2 text-sm font-semibold text-red-700 underline-offset-2 hover:underline dark:text-red-300"
                >
                  <span>Revocar</span>
                  <span className="sr-only"> la activación de {days(grant.days)}</span>
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
