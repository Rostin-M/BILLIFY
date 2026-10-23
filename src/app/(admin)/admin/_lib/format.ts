/**
 * Formatos de fecha, número y texto del panel de plataforma. Solo presentación.
 * Todas las fechas se muestran en hora de Bogotá, igual que en la app.
 */

import { type PlatformSubscriptionSummary } from "~/lib/platform/contract";
import { days, formatShortDate } from "~/app/_components/subscription/labels";

export { formatDate } from "~/lib/subscription/notices";
export { days, formatShortDate } from "~/app/_components/subscription/labels";

const DAY_MS = 24 * 60 * 60 * 1000;

const COMPACT_DATE = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const DATE_TIME = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

const NUMBER = new Intl.NumberFormat("es-CO");

/** "8 nov 2026": para tablas y sitios estrechos. */
export function formatCompactDate(date: Date): string {
  return COMPACT_DATE.format(date);
}

/** "9 oct, 3:42 p. m." */
export function formatDateTime(date: Date): string {
  return DATE_TIME.format(date);
}

export function formatNumber(n: number): string {
  return NUMBER.format(n);
}

/** "hoy", "ayer", "hace 5 días" o la fecha si pasó más de un mes. */
export function formatAgo(date: Date, now: Date): string {
  const diffDays = Math.floor((now.getTime() - date.getTime()) / DAY_MS);
  if (diffDays <= 0) return "hoy";
  if (diffDays === 1) return "ayer";
  if (diffDays <= 30) return `hace ${diffDays} días`;
  return formatCompactDate(date);
}

/** "queda 1 día" / "quedan 3 días". */
function remaining(n: number): string {
  return `${n === 1 ? "queda" : "quedan"} ${days(n)}`;
}

/** Qué pasa con el acceso del negocio y cuándo, en una línea. */
export function accessLine(sub: PlatformSubscriptionSummary): string {
  const date = sub.endsAt ? formatShortDate(sub.endsAt) : null;
  switch (sub.phase) {
    case "TRIAL":
      return `La prueba termina${date ? ` el ${date}` : ""} (${remaining(sub.daysLeft)})`;
    case "ACTIVE":
      return date ? `Vence el ${date} (${remaining(sub.daysLeft)})` : "Activo";
    case "PAST_DUE":
      return `Venció${date ? ` el ${date}` : ""}, ${days(sub.graceDaysLeft)} de gracia`;
    case "CANCELED":
      return date ? `Canceló; con acceso hasta el ${date}` : "Canceló la renovación";
    case "READ_ONLY":
      return date ? `Venció el ${date}; solo puede consultar` : "Solo puede consultar";
  }
}

/** Solo dígitos → número entero (para los campos de monto y días). */
export function parseDigits(value: string): number | null {
  const digits = value.replace(/\D/g, "");
  if (digits === "") return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

export function initials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}
