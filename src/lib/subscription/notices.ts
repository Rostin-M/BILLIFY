/**
 * Qué aviso por correo toca enviar a una suscripción en un momento dado, y su
 * texto. Puro: el cron decide y deduplica con la tabla subscription_notices
 * (un aviso por tipo y fecha de vencimiento).
 */

import { type SubscriptionAccess } from "./access";
import { GRACE_DAYS, getPlan, RENEWAL_REMINDER_DAYS, TRIAL_REMINDER_DAYS } from "./catalog";

export type NoticeKind =
  | `trial_${number}d`
  | `renewal_${number}d`
  | "past_due"
  | "read_only";

export type DueNotice = {
  kind: NoticeKind;
  /** Fecha de vencimiento a la que se refiere (parte de la clave de deduplicación). */
  dueAt: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * El aviso "faltan N días" se envía cuando quedan N días o menos y más de N−1.
 * Si el cron se salta un día, se envía solo el aviso más cercano (no se acumulan).
 */
function reminderFor(endsAt: Date, now: Date, days: readonly number[]): number | null {
  const remainingMs = endsAt.getTime() - now.getTime();
  if (remainingMs <= 0) return null;
  const sorted = [...days].sort((a, b) => a - b);
  for (const d of sorted) {
    // d = 0 → el último día (quedan menos de 24 h).
    const windowEnd = d === 0 ? DAY_MS : d * DAY_MS;
    if (remainingMs <= windowEnd) return d;
  }
  return null;
}

export function dueNotice(access: SubscriptionAccess, now: Date): DueNotice | null {
  const endsAt = access.endsAt;
  if (!endsAt) return null;

  switch (access.phase) {
    case "TRIAL": {
      const d = reminderFor(endsAt, now, TRIAL_REMINDER_DAYS);
      return d === null ? null : { kind: `trial_${d}d`, dueAt: endsAt };
    }
    case "ACTIVE": {
      const d = reminderFor(endsAt, now, RENEWAL_REMINDER_DAYS);
      return d === null ? null : { kind: `renewal_${d}d`, dueAt: endsAt };
    }
    case "PAST_DUE":
      return { kind: "past_due", dueAt: endsAt };
    case "READ_ONLY":
      // Solo el aviso del día del bloqueo; no se insiste todos los días.
      if (access.blockedAt && now.getTime() - access.blockedAt.getTime() > 2 * DAY_MS) return null;
      return { kind: "read_only", dueAt: access.blockedAt ?? endsAt };
    case "CANCELED":
      return null;
  }
}

const DATE_FMT = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatDate(date: Date): string {
  return DATE_FMT.format(date);
}

export type NoticeContent = { subject: string; title: string; paragraphs: string[]; ctaLabel: string };

export function noticeContent(notice: DueNotice, access: SubscriptionAccess, businessName: string): NoticeContent {
  const planName = getPlan(access.plan).name;
  const date = formatDate(notice.dueAt);
  const kind = notice.kind;

  if (kind.startsWith("trial_")) {
    const lastDay = kind === "trial_0d";
    return {
      subject: lastDay ? "Hoy termina tu prueba gratis" : "Tu prueba gratis termina pronto",
      title: lastDay ? "Hoy termina tu prueba" : "Tu prueba termina pronto",
      paragraphs: [
        `La prueba gratis de ${businessName} termina el ${date}.`,
        "Para seguir vendiendo sin interrupciones, elige un plan y paga desde BILLIFY. Si no, la cuenta quedará en solo lectura: podrás ver tu historial y exportar tus datos, pero no registrar ventas. Tus datos no se borran.",
      ],
      ctaLabel: "Elegir mi plan",
    };
  }

  if (kind.startsWith("renewal_")) {
    const days = Number(kind.slice("renewal_".length, -1));
    return {
      subject: days === 1 ? "Tu plan vence mañana" : `Tu plan vence en ${days} días`,
      title: days === 1 ? "Tu plan vence mañana" : `Tu plan vence en ${days} días`,
      paragraphs: [
        `El plan ${planName} de ${businessName} vence el ${date}.`,
        `Renueva antes para no perder días: el nuevo período empieza cuando termina el actual. Después del vencimiento tienes ${GRACE_DAYS} días de gracia.`,
      ],
      ctaLabel: "Renovar ahora",
    };
  }

  if (kind === "past_due") {
    return {
      subject: "Tu plan venció: estás en período de gracia",
      title: "Tu plan venció",
      paragraphs: [
        `El plan ${planName} de ${businessName} venció el ${date}.`,
        `Tienes ${access.graceDaysLeft} ${access.graceDaysLeft === 1 ? "día" : "días"} de gracia con acceso completo. Si no renuevas, la cuenta pasará a solo lectura.`,
      ],
      ctaLabel: "Renovar ahora",
    };
  }

  return {
    subject: "Tu cuenta está en solo lectura",
    title: "Tu cuenta está en solo lectura",
    paragraphs: [
      `${businessName} ya no puede registrar ventas ni cambios. Puedes seguir consultando tu historial y exportando tus datos; no se borra nada.`,
      "Cuando pagues, el acceso vuelve de inmediato, sin esperar a nadie.",
    ],
    ctaLabel: "Reactivar mi cuenta",
  };
}
