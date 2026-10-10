import "server-only";

import { type Prisma } from "@prisma/client";

import {
  EXPIRING_SOON_DAYS,
  type PlatformAuditRow,
  type PlatformBusinessRow,
  type PlatformPaymentRow,
  type PlatformSubscriptionSummary,
} from "~/lib/platform/contract";
import { addDays, computeAccess, type SubscriptionPhase } from "~/lib/subscription/access";
import { GRACE_DAYS, TRIAL_PLAN } from "~/lib/subscription/catalog";
import { type Db, effectiveSubscription, SUBSCRIPTION_SELECT, type SubscriptionRow } from "~/server/subscription/service";

import { isRevocationCandidate, latestEffectivePaymentIds, parseGrantSnapshot, resolveRevocation } from "./revocation";

/**
 * Lecturas del panel de administración (/admin): filtros, `select` y conversión
 * de filas de Prisma a los tipos del contrato (`~/lib/platform/contract`).
 */

// ─── Fase de la suscripción como filtro de BD ────────────────────────────────

/**
 * Mismas reglas que `computeAccess` (por fechas, nunca por la columna `status`),
 * escritas como filtro para poder contar y paginar en la base de datos. Si
 * cambian las reglas de acceso hay que cambiar ambas: platform.test.ts compara
 * este filtro contra `computeAccess` caso por caso.
 */
function subscriptionPhaseWhere(phase: SubscriptionPhase, now: Date): Prisma.SubscriptionWhereInput {
  const graceStart = addDays(now, -GRACE_DAYS);
  switch (phase) {
    case "TRIAL":
      return { currentPeriodEnd: null, trialEndsAt: { gt: now } };
    case "ACTIVE":
      return { canceledAt: null, currentPeriodEnd: { gt: now } };
    case "CANCELED":
      return { canceledAt: { not: null }, currentPeriodEnd: { gt: now } };
    case "PAST_DUE":
      return { canceledAt: null, currentPeriodEnd: { lte: now, gt: graceStart } };
    case "READ_ONLY":
      return {
        OR: [
          { currentPeriodEnd: null, OR: [{ trialEndsAt: null }, { trialEndsAt: { lte: now } }] },
          { canceledAt: { not: null }, currentPeriodEnd: { lte: now } },
          { canceledAt: null, currentPeriodEnd: { lte: graceStart } },
        ],
      };
  }
}

export function businessPhaseWhere(phase: SubscriptionPhase, now: Date): Prisma.BusinessWhereInput {
  const withPhase = { subscription: { is: subscriptionPhaseWhere(phase, now) } };
  // Sin suscripción no hay acceso (se falla cerrado, igual que `summarize`).
  return phase === "READ_ONLY" ? { OR: [withPhase, { subscription: { is: null } }] } : withPhase;
}

/**
 * "Por vencer": prueba o período pagado (activo o cancelado) que termina en los
 * próximos EXPIRING_SOON_DAYS días. Los que ya vencieron y están en gracia no
 * entran aquí: tienen su propia fase (PAST_DUE).
 */
export function businessExpiringSoonWhere(now: Date): Prisma.BusinessWhereInput {
  const window = { gt: now, lte: addDays(now, EXPIRING_SOON_DAYS) };
  return {
    subscription: {
      is: { OR: [{ currentPeriodEnd: null, trialEndsAt: window }, { currentPeriodEnd: window }] },
    },
  };
}

// ─── Negocios ────────────────────────────────────────────────────────────────

export const BUSINESS_ROW_SELECT = {
  id: true,
  name: true,
  document: true,
  createdAt: true,
  subscription: { select: SUBSCRIPTION_SELECT },
  // Propietario: si hay varios, primero el activo.
  users: {
    where: { role: "OWNER" },
    orderBy: [{ isActive: "desc" }, { id: "asc" }],
    take: 1,
    select: { id: true, name: true, email: true, phone: true },
  },
  _count: { select: { users: { where: { isActive: true } } } },
} satisfies Prisma.BusinessSelect;

type BusinessRowPayload = Prisma.BusinessGetPayload<{ select: typeof BUSINESS_ROW_SELECT }>;

export function summarizeSubscription(row: SubscriptionRow | null, now: Date): PlatformSubscriptionSummary {
  if (!row) {
    // No debería pasar (la crean el registro y la migración). Se muestra lo que
    // el guard concedería hoy sin fechas: nada.
    const access = computeAccess({ plan: TRIAL_PLAN, trialEndsAt: null, currentPeriodEnd: null, canceledAt: null }, now);
    return {
      plan: TRIAL_PLAN,
      billingCycle: "MONTHLY",
      phase: access.phase,
      endsAt: access.endsAt,
      daysLeft: access.daysLeft,
      graceDaysLeft: access.graceDaysLeft,
    };
  }
  const { billing, access } = effectiveSubscription(row, now);
  return {
    plan: billing.plan,
    billingCycle: billing.billingCycle,
    phase: access.phase,
    endsAt: access.endsAt,
    daysLeft: access.daysLeft,
    graceDaysLeft: access.graceDaysLeft,
  };
}

export function toBusinessRow(business: BusinessRowPayload, now: Date): PlatformBusinessRow {
  return {
    id: business.id,
    name: business.name,
    document: business.document,
    createdAt: business.createdAt,
    owner: business.users[0] ?? null,
    subscription: summarizeSubscription(business.subscription, now),
    activeUsers: business._count.users,
  };
}

// ─── Pagos ───────────────────────────────────────────────────────────────────

export const PAYMENT_ROW_SELECT = {
  id: true,
  businessId: true,
  reference: true,
  provider: true,
  kind: true,
  plan: true,
  billingCycle: true,
  amountInCents: true,
  status: true,
  statusMessage: true,
  periodStart: true,
  periodEnd: true,
  paidAt: true,
  createdAt: true,
  createdById: true,
  needsReview: true,
  grantReason: true,
  grantDays: true,
  grantNote: true,
  externalReference: true,
  grantSnapshot: true,
  revokedAt: true,
  revokeNote: true,
  business: { select: { name: true } },
} satisfies Prisma.SubscriptionPaymentSelect;

type PaymentRowPayload = Prisma.SubscriptionPaymentGetPayload<{ select: typeof PAYMENT_ROW_SELECT }>;

/**
 * Convierte pagos al contrato. Los nombres de quienes hicieron las activaciones
 * manuales y cuál es revocable se resuelven con UNA consulta cada uno para todo
 * el lote (sin N+1).
 *
 * `preview`: suscripción actual del negocio (solo en el detalle de UN negocio);
 * con ella se calcula cómo quedaría al revocar (`revokePreview`).
 */
export async function toPaymentRows(
  db: Db,
  payments: PaymentRowPayload[],
  preview?: { subscription: SubscriptionRow | null; now: Date },
): Promise<PlatformPaymentRow[]> {
  const candidates = payments.filter(isRevocationCandidate);
  const latestByBusiness = await latestEffectivePaymentIds(db, [...new Set(candidates.map((p) => p.businessId))]);
  const isRevocable = (p: PaymentRowPayload) =>
    isRevocationCandidate(p) && latestByBusiness.get(p.businessId) === p.id;
  // Como mucho un pago por negocio es revocable, y la vista previa es de UN negocio:
  // la consulta de `resolveRevocation` corre una sola vez.
  const revokePreview = async (p: PaymentRowPayload) => {
    const snapshot = parseGrantSnapshot(p.grantSnapshot);
    const current = preview?.subscription;
    if (!preview || !current || !snapshot || !isRevocable(p)) return null;
    const restore = await resolveRevocation(db, { businessId: p.businessId, grantedAt: p.createdAt, snapshot }, current);
    return summarizeSubscription({ ...current, ...restore.data }, preview.now);
  };
  const previews = new Map<string, PlatformSubscriptionSummary | null>();
  for (const p of payments) previews.set(p.id, await revokePreview(p));

  const granterIds = [
    ...new Set(payments.flatMap((p) => (p.kind === "MANUAL" && p.createdById ? [p.createdById] : []))),
  ];
  const granters =
    granterIds.length > 0
      ? await db.user.findMany({ where: { id: { in: granterIds } }, select: { id: true, name: true, email: true } })
      : [];
  const granterName = new Map(granters.map((u) => [u.id, u.name ?? u.email]));

  return payments.map((p) => ({
    id: p.id,
    businessId: p.businessId,
    businessName: p.business.name,
    reference: p.reference,
    provider: p.provider,
    kind: p.kind,
    plan: p.plan,
    billingCycle: p.billingCycle,
    amountInCents: p.amountInCents,
    status: p.status,
    statusMessage: p.statusMessage,
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    paidAt: p.paidAt,
    createdAt: p.createdAt,
    grant:
      p.kind === "MANUAL" && p.grantReason !== null && p.grantDays !== null
        ? {
            reason: p.grantReason,
            days: p.grantDays,
            note: p.grantNote,
            externalReference: p.externalReference,
            grantedBy: (p.createdById ? granterName.get(p.createdById) : null) ?? null,
            revokedAt: p.revokedAt,
            revokeNote: p.revokeNote,
            revocable: isRevocable(p),
            revokePreview: previews.get(p.id) ?? null,
          }
        : null,
    needsReview: p.needsReview,
  }));
}

// ─── Bitácora ────────────────────────────────────────────────────────────────

export const AUDIT_ROW_SELECT = {
  id: true,
  createdAt: true,
  adminName: true,
  adminEmail: true,
  action: true,
  businessId: true,
  businessName: true,
  summary: true,
  ip: true,
} satisfies Prisma.PlatformAuditLogSelect;

type AuditRowPayload = Prisma.PlatformAuditLogGetPayload<{ select: typeof AUDIT_ROW_SELECT }>;

/** Nombre y correo son la copia guardada al actuar: sobreviven al borrado del usuario o del negocio. */
export function toAuditRow(row: AuditRowPayload): PlatformAuditRow {
  return { ...row };
}
