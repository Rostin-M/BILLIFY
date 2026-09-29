import "server-only";

import { TRPCError } from "@trpc/server";

import { formatBytes, getPlan, type PlanCode } from "~/lib/subscription/catalog";
import { toBogotaDateKey } from "~/server/lib/bogotaTime";

import { type Db } from "./service";

export const USAGE_METRICS = {
  invoiceEmails: "invoice_emails",
  storageBytes: "storage_bytes",
} as const;

/** Mes calendario en hora de Bogotá: "2026-09". */
export function monthKey(now: Date): string {
  return toBogotaDateKey(now).slice(0, 7);
}

function upgradeHint(plan: PlanCode): string {
  return plan === "PRO" ? "" : " Sube de plan en Suscripción para ampliarlo.";
}

/** Usuarios activos del negocio (incluye al propietario). */
export async function assertCanAddUser(db: Db, businessId: string, plan: PlanCode): Promise<void> {
  const max = getPlan(plan).limits.users;
  const active = await db.user.count({ where: { businessId, isActive: true } });
  if (active >= max) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Tu plan ${getPlan(plan).name} permite ${max} usuarios activos (incluido el propietario).${upgradeHint(plan)}`,
    });
  }
}

export async function assertCanAddProduct(db: Db, businessId: string, plan: PlanCode): Promise<void> {
  const max = getPlan(plan).limits.products;
  if (max === null) return;
  const active = await db.product.count({ where: { businessId, isActive: true } });
  if (active >= max) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Tu plan ${getPlan(plan).name} permite ${max.toLocaleString("es-CO")} productos activos.${upgradeHint(plan)}`,
    });
  }
}

/** Cajas simultáneas: lo que configuró el dueño, sin pasar el tope del plan. */
export function effectiveMaxCashRegisters(configured: number, plan: PlanCode): number {
  return Math.max(1, Math.min(configured, getPlan(plan).limits.cashRegisters));
}

/**
 * Suma `amount` al contador solo si el total no supera `limit`, en una sola
 * sentencia (sin carreras entre peticiones simultáneas). Devuelve false si se
 * alcanzó el límite.
 */
async function consumeCounter(
  db: Db,
  params: { businessId: string; metric: string; period: string; amount: number; limit: number },
): Promise<boolean> {
  const { businessId, metric, period, amount, limit } = params;
  if (amount > limit) return false;
  const rows = await db.$queryRaw<{ value: bigint }[]>`
    INSERT INTO "usage_counters" ("business_id", "metric", "period", "value", "updated_at")
    VALUES (${businessId}, ${metric}, ${period}, ${amount}, NOW())
    ON CONFLICT ("business_id", "metric", "period")
    DO UPDATE SET "value" = "usage_counters"."value" + ${amount}, "updated_at" = NOW()
     WHERE "usage_counters"."value" + ${amount} <= ${limit}
    RETURNING "value"
  `;
  return rows.length > 0;
}

/** Libera cupo si la operación que lo consumió falló (p. ej. Brevo no envió el correo). */
async function releaseCounter(db: Db, params: { businessId: string; metric: string; period: string; amount: number }) {
  const { businessId, metric, period, amount } = params;
  await db.$executeRaw`
    UPDATE "usage_counters"
       SET "value" = GREATEST(0, "value" - ${amount}), "updated_at" = NOW()
     WHERE "business_id" = ${businessId} AND "metric" = ${metric} AND "period" = ${period}
  `;
}

export async function getUsage(db: Db, businessId: string, metric: string, period: string): Promise<number> {
  const row = await db.usageCounter.findUnique({
    where: { businessId_metric_period: { businessId, metric, period } },
    select: { value: true },
  });
  return row ? Number(row.value) : 0;
}

/** Reserva un envío de factura por correo del mes. Llama a `release` si el envío falla. */
export async function consumeInvoiceEmail(db: Db, businessId: string, plan: PlanCode, now = new Date()) {
  const limit = getPlan(plan).limits.invoiceEmailsPerMonth;
  const key = { businessId, metric: USAGE_METRICS.invoiceEmails, period: monthKey(now), amount: 1 };
  const ok = await consumeCounter(db, { ...key, limit });
  if (!ok) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Llegaste al límite de ${limit} facturas por correo este mes en tu plan ${getPlan(plan).name}.${upgradeHint(plan)}`,
    });
  }
  return { release: () => releaseCounter(db, key) };
}

/** Reserva espacio para una foto de comprobante. Devuelve null si no cabe. */
export async function consumeStorage(db: Db, businessId: string, plan: PlanCode, bytes: number) {
  const limit = getPlan(plan).limits.storageBytes;
  const key = { businessId, metric: USAGE_METRICS.storageBytes, period: "total", amount: bytes };
  const ok = await consumeCounter(db, { ...key, limit });
  if (!ok) {
    return {
      ok: false as const,
      message: `Se llenó el espacio para comprobantes de tu plan ${getPlan(plan).name} (${formatBytes(limit)}).${upgradeHint(plan)}`,
    };
  }
  return { ok: true as const, release: () => releaseCounter(db, key) };
}
