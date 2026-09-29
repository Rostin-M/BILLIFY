import "server-only";

import { type Prisma, type PrismaClient, type SubscriptionStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import { env } from "~/env";
import { isUniqueViolation } from "~/server/lib/idempotency";
import {
  acceptsOfflineSale,
  addDays,
  computeAccess,
  type SubscriptionAccess,
  type SubscriptionPhase,
} from "~/lib/subscription/access";
import { dueScheduledChange, type BillingState, type VatConfig } from "~/lib/subscription/billing";
import {
  cheapestPlanWith,
  getPlan,
  OFFLINE_SYNC_TOLERANCE_MS,
  planHasFeature,
  type PlanFeature,
  TRIAL_DAYS,
  TRIAL_PLAN,
} from "~/lib/subscription/catalog";

export type Db = PrismaClient | Prisma.TransactionClient;

export const SUBSCRIPTION_SELECT = {
  id: true,
  businessId: true,
  plan: true,
  billingCycle: true,
  status: true,
  trialEndsAt: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  scheduledPlan: true,
  scheduledCycle: true,
  scheduledFrom: true,
  canceledAt: true,
} satisfies Prisma.SubscriptionSelect;

export type SubscriptionRow = Prisma.SubscriptionGetPayload<{ select: typeof SUBSCRIPTION_SELECT }>;

/** Estado efectivo: aplica en memoria un cambio programado que ya empezó. */
export type EffectiveSubscription = {
  row: SubscriptionRow;
  billing: BillingState;
  access: SubscriptionAccess;
};

export const READ_ONLY_MESSAGE =
  "Tu plan venció y la cuenta está en solo lectura: puedes consultar tu historial y exportar, pero no registrar cambios. Renueva en Suscripción para seguir vendiendo.";

export function effectiveSubscription(row: SubscriptionRow, now: Date): EffectiveSubscription {
  const due = dueScheduledChange(row, now);
  const plan = due?.plan ?? row.plan;
  const billing: BillingState = {
    plan,
    billingCycle: due?.billingCycle ?? row.billingCycle,
    currentPeriodStart: due?.currentPeriodStart ?? row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    scheduledFrom: due ? null : row.scheduledFrom,
  };
  const access = computeAccess(
    {
      plan,
      trialEndsAt: row.trialEndsAt,
      currentPeriodEnd: row.currentPeriodEnd,
      canceledAt: row.canceledAt,
    },
    now,
  );
  return { row, billing, access };
}

/** Estado que debería tener la columna `status` según la fase calculada. */
export function statusForPhase(phase: SubscriptionPhase): SubscriptionStatus {
  return phase;
}

export async function loadSubscription(db: Db, businessId: string, now = new Date()): Promise<EffectiveSubscription | null> {
  const row = await db.subscription.findUnique({ where: { businessId }, select: SUBSCRIPTION_SELECT });
  return row ? effectiveSubscription(row, now) : null;
}

/**
 * Suscripción del negocio. Si falta (no debería: la crea el registro y la
 * migración), se crea la prueba una sola vez; `businessId` es único, así que
 * dos peticiones simultáneas no pueden crear dos.
 */
export async function requireSubscription(db: Db, businessId: string, now = new Date()): Promise<EffectiveSubscription> {
  const existing = await loadSubscription(db, businessId, now);
  if (existing) return existing;
  try {
    const row = await db.subscription.create({
      data: trialSubscriptionData(businessId, now),
      select: SUBSCRIPTION_SELECT,
    });
    return effectiveSubscription(row, now);
  } catch (error) {
    // Otra petición simultánea la creó primero: se usa la suya.
    if (!isUniqueViolation(error)) throw error;
    const created = await loadSubscription(db, businessId, now);
    if (!created) throw error;
    return created;
  }
}

export function trialSubscriptionData(businessId: string, now: Date) {
  return {
    businessId,
    plan: TRIAL_PLAN,
    billingCycle: "MONTHLY" as const,
    status: "TRIAL" as const,
    trialEndsAt: addDays(now, TRIAL_DAYS),
  };
}

export function vatConfig(): VatConfig {
  return {
    rate: env.SUBSCRIPTION_VAT_RATE,
    pricesIncludeVat: env.SUBSCRIPTION_PRICES_INCLUDE_VAT === "true",
  };
}

// ─── Guard ────────────────────────────────────────────────────────────────────

/**
 * Mutaciones permitidas en solo lectura: pagar/renovar y cerrar lo que quedó
 * abierto (la caja del turno y las mesas sin cobrar), para no dejar datos a medias.
 */
export const READ_ONLY_ALLOWED_MUTATIONS: ReadonlySet<string> = new Set([
  "billing.checkout",
  "billing.confirmReturn",
  "billing.simulatePayment",
  "billing.cancel",
  "billing.resume",
  "cashRegister.close",
  "tableSession.close",
  "tableSession.cancel",
]);

/** Mutaciones que deciden por sí mismas (p. ej. ventas offline hechas antes del bloqueo). */
export const READ_ONLY_DEFERRED_MUTATIONS: ReadonlySet<string> = new Set(["sale.create"]);

/**
 * Se ejecuta en CADA procedimiento tRPC de negocio (ver trpc.ts). Las consultas
 * siempre pasan (el historial nunca se bloquea); las mutaciones se bloquean en
 * solo lectura salvo las permitidas.
 */
export async function enforceSubscription(params: {
  db: Db;
  businessId: string;
  path: string;
  type: "query" | "mutation" | "subscription";
  now?: Date;
}): Promise<EffectiveSubscription> {
  const { db, businessId, path, type, now = new Date() } = params;
  const sub = await requireSubscription(db, businessId, now);

  if (
    sub.access.mode === "READ_ONLY" &&
    type === "mutation" &&
    !READ_ONLY_ALLOWED_MUTATIONS.has(path) &&
    !READ_ONLY_DEFERRED_MUTATIONS.has(path)
  ) {
    throw new TRPCError({ code: "FORBIDDEN", message: READ_ONLY_MESSAGE });
  }
  return sub;
}

/** Para rutas /api (subidas): mismas reglas que una mutación tRPC. */
export async function isBusinessWritable(db: Db, businessId: string, now = new Date()): Promise<boolean> {
  const sub = await requireSubscription(db, businessId, now);
  return sub.access.mode === "FULL";
}

/** Venta que llega en solo lectura: solo se acepta si se hizo sin conexión antes del bloqueo. */
export function assertSaleAllowed(sub: EffectiveSubscription, offlineCreatedAt: Date | undefined, now = new Date()): void {
  if (sub.access.mode === "FULL") return;
  const ok =
    offlineCreatedAt !== undefined &&
    acceptsOfflineSale({ access: sub.access, offlineCreatedAt, now, toleranceMs: OFFLINE_SYNC_TOLERANCE_MS });
  if (!ok) throw new TRPCError({ code: "FORBIDDEN", message: READ_ONLY_MESSAGE });
}

export function assertFeature(sub: EffectiveSubscription, feature: PlanFeature, label: string): void {
  if (planHasFeature(sub.billing.plan, feature)) return;
  const upgrade = cheapestPlanWith(feature);
  throw new TRPCError({
    code: "FORBIDDEN",
    message: `${label} no está incluido en tu plan ${getPlan(sub.billing.plan).name}.${
      upgrade ? ` Está disponible desde el plan ${upgrade.name}.` : ""
    }`,
  });
}
