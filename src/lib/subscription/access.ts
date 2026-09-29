/**
 * Estado de acceso de una suscripción, calculado SOLO a partir de fechas.
 *
 * El guard del backend usa esta función en cada petición, así que el bloqueo es
 * exacto aunque el cron diario no haya corrido todavía: la columna `status` de la
 * tabla es un reflejo (para reportes y correos) que el cron mantiene al día.
 */

import { GRACE_DAYS, type PlanCode } from "./catalog";

const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionPhase =
  /** Prueba gratis vigente. */
  | "TRIAL"
  /** Período pagado vigente. */
  | "ACTIVE"
  /** Vencido, dentro de los días de gracia: acceso completo con aviso. */
  | "PAST_DUE"
  /** Cancelada por el dueño: acceso completo hasta el fin del período pagado. */
  | "CANCELED"
  /** Vencida: solo lectura (ver historial y exportar; no vender ni crear). */
  | "READ_ONLY";

export type AccessMode = "FULL" | "READ_ONLY";

/** Campos de la suscripción que determinan el acceso. */
export type SubscriptionDates = {
  plan: PlanCode;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  canceledAt: Date | null;
};

export type SubscriptionAccess = {
  phase: SubscriptionPhase;
  mode: AccessMode;
  plan: PlanCode;
  /** Fin de la prueba o del período pagado (lo que aplique). */
  endsAt: Date | null;
  /** Momento en que el negocio pasa (o pasó) a solo lectura. */
  blockedAt: Date | null;
  /** Días completos restantes hasta `endsAt` (0 si ya pasó). */
  daysLeft: number;
  /** Días restantes de gracia (solo en PAST_DUE). */
  graceDaysLeft: number;
};

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Días restantes redondeando hacia arriba: faltan 30 h → 2 días. */
export function daysUntil(target: Date, now: Date): number {
  const diff = target.getTime() - now.getTime();
  return diff <= 0 ? 0 : Math.ceil(diff / DAY_MS);
}

export function computeAccess(sub: SubscriptionDates, now: Date): SubscriptionAccess {
  const base = { plan: sub.plan, graceDaysLeft: 0 };

  // Nunca ha pagado un período: sigue en (o terminó) la prueba.
  if (!sub.currentPeriodEnd) {
    const endsAt = sub.trialEndsAt;
    // Sin fecha de fin no se concede acceso: se falla cerrado.
    if (!endsAt || now >= endsAt) {
      return { ...base, phase: "READ_ONLY", mode: "READ_ONLY", endsAt, blockedAt: endsAt ?? now, daysLeft: 0 };
    }
    return { ...base, phase: "TRIAL", mode: "FULL", endsAt, blockedAt: endsAt, daysLeft: daysUntil(endsAt, now) };
  }

  const endsAt = sub.currentPeriodEnd;

  // Cancelada: se respeta lo pagado, pero sin días de gracia.
  if (sub.canceledAt) {
    if (now < endsAt) {
      return { ...base, phase: "CANCELED", mode: "FULL", endsAt, blockedAt: endsAt, daysLeft: daysUntil(endsAt, now) };
    }
    return { ...base, phase: "READ_ONLY", mode: "READ_ONLY", endsAt, blockedAt: endsAt, daysLeft: 0 };
  }

  const graceEndsAt = addDays(endsAt, GRACE_DAYS);
  if (now < endsAt) {
    return { ...base, phase: "ACTIVE", mode: "FULL", endsAt, blockedAt: graceEndsAt, daysLeft: daysUntil(endsAt, now) };
  }
  if (now < graceEndsAt) {
    return {
      ...base,
      phase: "PAST_DUE",
      mode: "FULL",
      endsAt,
      blockedAt: graceEndsAt,
      daysLeft: 0,
      graceDaysLeft: daysUntil(graceEndsAt, now),
    };
  }
  return { ...base, phase: "READ_ONLY", mode: "READ_ONLY", endsAt, blockedAt: graceEndsAt, daysLeft: 0 };
}

/**
 * ¿Se acepta una venta hecha sin conexión que llega mientras el negocio está en
 * solo lectura? Solo si se hizo antes del bloqueo y llega dentro de la tolerancia.
 * `offlineCreatedAt` lo envía el dispositivo: se rechaza si viene del futuro.
 */
export function acceptsOfflineSale(params: {
  access: SubscriptionAccess;
  offlineCreatedAt: Date;
  now: Date;
  toleranceMs: number;
  /** Margen para relojes de dispositivo adelantados. */
  clockSkewMs?: number;
}): boolean {
  const { access, offlineCreatedAt, now, toleranceMs, clockSkewMs = 5 * 60 * 1000 } = params;
  if (access.mode === "FULL") return true;
  const blockedAt = access.blockedAt;
  if (!blockedAt) return false;
  if (Number.isNaN(offlineCreatedAt.getTime())) return false;
  if (offlineCreatedAt.getTime() > now.getTime() + clockSkewMs) return false;
  if (offlineCreatedAt >= blockedAt) return false;
  return now.getTime() <= blockedAt.getTime() + toleranceMs;
}
