/**
 * Textos y colores compartidos de la UI de suscripciones (pantalla /suscripcion,
 * banner del layout, pantalla de plan vencido). Solo presentación.
 */

import { type SubscriptionPhase } from "~/lib/subscription/access";

export const PHASE_LABELS: Record<SubscriptionPhase, string> = {
  TRIAL: "Prueba gratis",
  ACTIVE: "Activo",
  PAST_DUE: "Vencido (en gracia)",
  CANCELED: "Cancelado",
  READ_ONLY: "Solo lectura",
};

export const PHASE_CHIP_CLASSES: Record<SubscriptionPhase, string> = {
  TRIAL: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-900/20 dark:text-sky-300",
  ACTIVE:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-900/20 dark:text-emerald-300",
  PAST_DUE:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-300",
  CANCELED: "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/10 dark:text-slate-300",
  READ_ONLY: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-300",
};

export type PaymentStatus = "PENDING" | "APPROVED" | "DECLINED" | "VOIDED" | "ERROR" | "EXPIRED";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  DECLINED: "Rechazado",
  VOIDED: "Anulado",
  ERROR: "Con error",
  EXPIRED: "Sin respuesta",
};

export const PAYMENT_STATUS_CLASSES: Record<PaymentStatus, string> = {
  PENDING: "bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300",
  APPROVED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300",
  DECLINED: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300",
  VOIDED: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
  ERROR: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300",
  EXPIRED: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
};

export function days(n: number): string {
  return `${n} ${n === 1 ? "día" : "días"}`;
}

/** Monto en centavos de COP → texto "$ 49.900". */
export function formatCents(amountInCents: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Math.round(amountInCents / 100));
}

/** Solo el número, sin símbolo: "49.900" (para botones cortos). */
export function formatPesos(amountInCents: number): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Math.round(amountInCents / 100));
}

const SHORT_DATE = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "numeric",
  month: "long",
});

/** "30 de octubre" (sin año). */
export function formatShortDate(date: Date): string {
  return SHORT_DATE.format(date);
}
