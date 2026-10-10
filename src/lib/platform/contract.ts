/**
 * Contrato del panel de administración de la plataforma (/admin): tipos que
 * comparten el router tRPC `platform` y las pantallas. Solo tipos y constantes,
 * sin dependencias de servidor, para poder importarlo desde componentes cliente.
 *
 * Procedimientos del router `platform` (todos exigen la doble llave: rol
 * SUPERADMIN sin negocio + correo en PLATFORM_ADMIN_EMAILS):
 *  - overview()                         → PlatformOverview
 *  - listBusinesses(ListBusinessesInput) → Page<PlatformBusinessRow>
 *  - getBusiness({ businessId })        → PlatformBusinessDetail
 *  - listPayments(ListPaymentsInput)    → Page<PlatformPaymentRow>
 *  - listAudit(ListAuditInput)          → Page<PlatformAuditRow>
 *  - grantPlan(GrantPlanInput)          → GrantResult
 *  - extendTrial(ExtendTrialInput)      → GrantResult
 *  - revokeGrant(RevokeGrantInput)      → GrantResult
 *  - resolvePaymentReview(ResolvePaymentReviewInput) → { paymentId: string }
 *
 * La regla de fechas de una activación está en ./grant.ts (`computeGrantPeriod`):
 * la usan el servidor y la vista previa del panel.
 */

import type { SubscriptionPaymentStatus } from "@prisma/client";

import { type SubscriptionPhase } from "~/lib/subscription/access";
import { type BillingCycle, type PlanCode } from "~/lib/subscription/catalog";

export const GRANT_DEFAULT_DAYS = 30;
export const GRANT_MAX_DAYS = 366;
/** Negocios cuyo acceso termina dentro de estos días cuentan como "por vencer". */
export const EXPIRING_SOON_DAYS = 7;
/** Máximo de días que se puede extender una prueba de una vez. */
export const TRIAL_EXTENSION_MAX_DAYS = 30;

export const GRANT_REASONS = ["MANUAL_PAYMENT", "COURTESY", "COMPENSATION"] as const;
export type GrantReason = (typeof GRANT_REASONS)[number];

export const GRANT_REASON_LABELS: Record<GrantReason, string> = {
  MANUAL_PAYMENT: "Pago manual (Nequi / transferencia)",
  COURTESY: "Cortesía",
  COMPENSATION: "Compensación",
};

/**
 * Desde cuándo cuentan los días:
 *  - AFTER_CURRENT: se suman al final de lo que el negocio ya tiene vigente
 *    (si está en solo lectura, empiezan hoy).
 *  - NOW: empiezan hoy y reemplazan el plan actual.
 */
export const GRANT_STARTS = ["AFTER_CURRENT", "NOW"] as const;
export type GrantStart = (typeof GRANT_STARTS)[number];

export type Page<T> = { items: T[]; nextCursor: string | null };

export type PlatformOverview = {
  total: number;
  trial: number;
  active: number;
  pastDue: number;
  canceled: number;
  readOnly: number;
  /**
   * En prueba o con período pagado (activo o cancelado) que termina en los
   * próximos EXPIRING_SOON_DAYS días. Los que ya están en gracia no cuentan aquí.
   */
  expiringSoon: number;
  newLast30Days: number;
  /** Pagos que requieren revisión manual (p. ej. anulados después de aprobados). */
  paymentsToReview: number;
};

export type PlatformOwner = { id: string; name: string | null; email: string | null; phone: string | null };

export type PlatformSubscriptionSummary = {
  plan: PlanCode;
  billingCycle: BillingCycle;
  phase: SubscriptionPhase;
  /** Fin de la prueba o del período vigente. */
  endsAt: Date | null;
  daysLeft: number;
  graceDaysLeft: number;
};

export type PlatformBusinessRow = {
  id: string;
  name: string;
  document: string;
  createdAt: Date;
  owner: PlatformOwner | null;
  subscription: PlatformSubscriptionSummary;
  activeUsers: number;
};

export type ListBusinessesInput = {
  search?: string;
  phase?: SubscriptionPhase;
  expiringSoon?: boolean;
  cursor?: string;
  limit?: number;
};

export type PlatformUsage = {
  activeUsers: number;
  usersLimit: number;
  activeProducts: number;
  /** null = ilimitados. */
  productsLimit: number | null;
  invoiceEmailsThisMonth: number;
  invoiceEmailsLimit: number;
  storageBytes: number;
  storageLimitBytes: number;
  salesLast30Days: number;
  lastSaleAt: Date | null;
};

export type PlatformPaymentRow = {
  id: string;
  businessId: string;
  businessName: string;
  reference: string;
  /** "manual" = registrado desde el panel de administración. */
  provider: string;
  kind: "PERIOD" | "UPGRADE" | "MANUAL";
  plan: PlanCode;
  billingCycle: BillingCycle;
  amountInCents: number;
  status: SubscriptionPaymentStatus;
  statusMessage: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  /** Solo en pagos manuales. */
  grant: {
    reason: GrantReason;
    days: number;
    note: string | null;
    /** Número de comprobante de Nequi/transferencia. */
    externalReference: string | null;
    grantedBy: string | null;
    revokedAt: Date | null;
    revokeNote: string | null;
    /**
     * Solo se puede revocar la activación más reciente del negocio, si no hay
     * pagos aprobados posteriores. Revocar devuelve la suscripción a como estaba
     * justo antes de activarla.
     */
    revocable: boolean;
    /** Cómo quedaría la suscripción al revocar. Solo viene en `getBusiness` y si `revocable`. */
    revokePreview: PlatformSubscriptionSummary | null;
  } | null;
  needsReview: boolean;
};

export type ListPaymentsInput = {
  businessId?: string;
  status?: SubscriptionPaymentStatus;
  onlyManual?: boolean;
  needsReview?: boolean;
  cursor?: string;
  limit?: number;
};

export type PlatformAuditRow = {
  id: string;
  createdAt: Date;
  adminName: string | null;
  adminEmail: string | null;
  /** p. ej. "GRANT_PLAN", "EXTEND_TRIAL", "REVOKE_GRANT". */
  action: string;
  businessId: string | null;
  businessName: string | null;
  /** Resumen legible de la acción, ya armado en el servidor. */
  summary: string;
  ip: string | null;
};

export type ListAuditInput = { businessId?: string; cursor?: string; limit?: number };

export type PlatformBusinessDetail = PlatformBusinessRow & {
  address: string | null;
  phone: string | null;
  email: string | null;
  subscriptionDates: {
    trialEndsAt: Date | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    canceledAt: Date | null;
    scheduledPlan: PlanCode | null;
    scheduledFrom: Date | null;
  };
  usage: PlatformUsage;
  users: { id: string; name: string | null; email: string | null; role: "OWNER" | "CASHIER"; isActive: boolean }[];
  recentPayments: PlatformPaymentRow[];
  recentAudit: PlatformAuditRow[];
};

export type GrantPlanInput = {
  businessId: string;
  plan: PlanCode;
  /** 1..GRANT_MAX_DAYS. */
  days: number;
  reason: GrantReason;
  start: GrantStart;
  /** Obligatorio si reason = MANUAL_PAYMENT; en COP, sin centavos. */
  amountCop?: number;
  /** Número de comprobante de Nequi/transferencia (opcional). */
  externalReference?: string;
  note?: string;
  /** Enviar al dueño el correo de confirmación. */
  notifyOwner: boolean;
};

/** Solo para negocios que nunca han pagado un período. days: 1..TRIAL_EXTENSION_MAX_DAYS. */
export type ExtendTrialInput = { businessId: string; days: number; note?: string };

export type RevokeGrantInput = {
  paymentId: string;
  note: string;
  /** Enviar al dueño un correo avisando. Por defecto la interfaz lo deja en false. */
  notifyOwner: boolean;
};

/** Marca como revisado un pago con `needsReview`. */
export type ResolvePaymentReviewInput = { paymentId: string; note: string };

export type GrantResult = {
  businessId: string;
  subscription: PlatformSubscriptionSummary;
  periodStart: Date | null;
  periodEnd: Date | null;
  /** true solo si se pidió avisar y el correo al dueño salió. */
  ownerNotified: boolean;
};
