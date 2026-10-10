import "server-only";

import { type Prisma } from "@prisma/client";
import { z } from "zod";

import { BILLING_CYCLES, PLAN_CODES } from "~/lib/subscription/catalog";
import { type Db, type SubscriptionRow } from "~/server/subscription/service";

/**
 * Revocación de activaciones manuales.
 *
 * Al activar se guarda en el pago (`grant_snapshot`) la fila de la suscripción
 * tal como estaba justo antes. Revocar la restaura campo por campo, así no hay
 * que "deshacer" fechas a mano (plan programado, cancelación, prueba, etc.).
 *
 * Solo se puede revocar el último pago aprobado y vigente del negocio: si hubo
 * otro pago después, la foto ya no corresponde al estado actual. Como una
 * activación revocada deja de contar, las activaciones se deshacen en orden
 * inverso, una por una.
 */

const dateSchema = z
  .string()
  .datetime()
  .nullable()
  .transform((value) => (value === null ? null : new Date(value)));

const snapshotSchema = z.object({
  plan: z.enum(PLAN_CODES),
  billingCycle: z.enum(BILLING_CYCLES),
  trialEndsAt: dateSchema,
  currentPeriodStart: dateSchema,
  currentPeriodEnd: dateSchema,
  scheduledPlan: z.enum(PLAN_CODES).nullable(),
  scheduledCycle: z.enum(BILLING_CYCLES).nullable(),
  scheduledFrom: dateSchema,
  canceledAt: dateSchema,
});

/** Campos de la suscripción que una activación puede cambiar (todo menos id, negocio y `status`). */
export type GrantSnapshot = z.infer<typeof snapshotSchema>;

const iso = (date: Date | null) => date?.toISOString() ?? null;

/** Foto de la fila SIN aplicar cambios programados: revocar debe dejarla idéntica. */
export function takeGrantSnapshot(row: SubscriptionRow): Prisma.InputJsonObject {
  return {
    plan: row.plan,
    billingCycle: row.billingCycle,
    trialEndsAt: iso(row.trialEndsAt),
    currentPeriodStart: iso(row.currentPeriodStart),
    currentPeriodEnd: iso(row.currentPeriodEnd),
    scheduledPlan: row.scheduledPlan,
    scheduledCycle: row.scheduledCycle,
    scheduledFrom: iso(row.scheduledFrom),
    canceledAt: iso(row.canceledAt),
  };
}

/** null si el pago no tiene foto o no se entiende (no se puede revocar). */
export function parseGrantSnapshot(value: Prisma.JsonValue | null | undefined): GrantSnapshot | null {
  const parsed = snapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Último pago aprobado y no revocado de cada negocio (por fecha de aprobación).
 * Una activación manual es revocable solo si es ese pago.
 */
export async function latestEffectivePaymentIds(db: Db, businessIds: string[]): Promise<Map<string, string>> {
  if (businessIds.length === 0) return new Map();
  const latest = await db.subscriptionPayment.findMany({
    where: { businessId: { in: businessIds }, status: "APPROVED", revokedAt: null },
    orderBy: [{ paidAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }, { id: "desc" }],
    distinct: ["businessId"],
    select: { id: true, businessId: true },
  });
  return new Map(latest.map((p) => [p.businessId, p.id]));
}

/** Requisitos que dependen solo del propio pago (falta comprobar que sea el último del negocio). */
export function isRevocationCandidate(payment: {
  kind: string;
  status: string;
  revokedAt: Date | null;
  grantSnapshot: Prisma.JsonValue | null;
}): boolean {
  return (
    payment.kind === "MANUAL" &&
    payment.status === "APPROVED" &&
    payment.revokedAt === null &&
    parseGrantSnapshot(payment.grantSnapshot) !== null
  );
}

/** Acciones del propietario sobre su renovación (router `billing`). */
const OWNER_CANCELLATION_ACTIONS = ["SUBSCRIPTION_CANCELED", "SUBSCRIPTION_RESUMED"];

/**
 * Qué se guarda en la suscripción al revocar una activación: la foto, salvo
 * `canceledAt` si el propietario canceló o reanudó DESPUÉS de la activación.
 * Esa decisión es suya y más reciente que la foto, así que se conserva la actual
 * (si lo restaurado no tiene período pagado no hay nada que cancelar: queda en null).
 *
 * Lo usan `revokeGrant` y la vista previa (`revokePreview`): siempre coinciden.
 */
export async function resolveRevocation(
  db: Db,
  grant: { businessId: string; grantedAt: Date; snapshot: GrantSnapshot },
  current: Pick<SubscriptionRow, "canceledAt">,
): Promise<{ data: GrantSnapshot; keptOwnerCancellation: boolean }> {
  const ownerDecision = await db.auditLog.findFirst({
    where: {
      businessId: grant.businessId,
      action: { in: OWNER_CANCELLATION_ACTIONS },
      createdAt: { gt: grant.grantedAt },
    },
    select: { id: true },
  });
  if (!ownerDecision) return { data: grant.snapshot, keptOwnerCancellation: false };
  return {
    data: { ...grant.snapshot, canceledAt: grant.snapshot.currentPeriodEnd ? current.canceledAt : null },
    keptOwnerCancellation: true,
  };
}
