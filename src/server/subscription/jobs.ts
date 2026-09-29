import "server-only";

import { type PrismaClient } from "@prisma/client";

import { dueNotice, noticeContent } from "~/lib/subscription/notices";
import { sendSubscriptionEmail } from "~/server/lib/email";
import { isUniqueViolation } from "~/server/lib/idempotency";

import { getPaymentGateway } from "./gateway";
import { processGatewayTransaction } from "./payments";
import { effectiveSubscription, SUBSCRIPTION_SELECT } from "./service";

/** Un pago sin respuesta de la pasarela por más de esto se marca EXPIRED. */
const PENDING_PAYMENT_TTL_MS = 24 * 60 * 60 * 1000;
const BATCH = 200;

export type JobReport = {
  scanned: number;
  statusUpdated: number;
  scheduledApplied: number;
  noticesSent: number;
  noticeErrors: number;
  paymentsReconciled: number;
  paymentsExpired: number;
};

/**
 * Tarea diaria (Vercel Cron → /api/cron/subscriptions). Idempotente: correrla
 * dos veces seguidas no duplica correos ni cambios.
 *  1. Refleja en `status` la fase calculada por fechas (el acceso ya la usa en
 *     cada petición; esto sirve para reportes y para los correos).
 *  2. Consolida los cambios de plan programados que ya empezaron.
 *  3. Envía los avisos por correo (prueba, 7/3/1 días, gracia, solo lectura).
 *  4. Consulta en la pasarela los pagos pendientes (por si se perdió un webhook)
 *     y marca como vencidos los que llevan más de 24 h sin respuesta.
 */
export async function runSubscriptionJob(db: PrismaClient, now = new Date()): Promise<JobReport> {
  const report: JobReport = {
    scanned: 0,
    statusUpdated: 0,
    scheduledApplied: 0,
    noticesSent: 0,
    noticeErrors: 0,
    paymentsReconciled: 0,
    paymentsExpired: 0,
  };

  let cursor: string | undefined;
  for (;;) {
    const rows = await db.subscription.findMany({
      select: {
        ...SUBSCRIPTION_SELECT,
        updatedAt: true,
        business: {
          select: {
            name: true,
            users: { where: { role: "OWNER", isActive: true }, select: { email: true, name: true }, take: 1 },
          },
        },
      },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]!.id;

    for (const row of rows) {
      report.scanned++;
      const { business, updatedAt, ...subRow } = row;
      const sub = effectiveSubscription(subRow, now);

      const scheduleDue = subRow.scheduledFrom !== null && subRow.scheduledFrom <= now;
      if (scheduleDue || subRow.status !== sub.access.phase) {
        // Concurrencia optimista: si un pago cambió la fila después de leerla,
        // no se pisa (la próxima ejecución la verá actualizada).
        await db.subscription.updateMany({
          where: { id: subRow.id, updatedAt },
          data: {
            status: sub.access.phase,
            ...(scheduleDue
              ? {
                  plan: sub.billing.plan,
                  billingCycle: sub.billing.billingCycle,
                  currentPeriodStart: sub.billing.currentPeriodStart,
                  scheduledPlan: null,
                  scheduledCycle: null,
                  scheduledFrom: null,
                }
              : {}),
          },
        });
        if (scheduleDue) report.scheduledApplied++;
        if (subRow.status !== sub.access.phase) report.statusUpdated++;
      }

      const notice = dueNotice(sub.access, now);
      const owner = business.users[0];
      if (!notice || !owner?.email) continue;

      // Se registra ANTES de enviar: si dos ejecuciones corren a la vez, solo una envía.
      try {
        await db.subscriptionNotice.create({
          data: { subscriptionId: subRow.id, kind: notice.kind, dueAt: notice.dueAt },
        });
      } catch (err) {
        if (isUniqueViolation(err)) continue;
        throw err;
      }

      try {
        await sendSubscriptionEmail(owner.email, owner.name, noticeContent(notice, sub.access, business.name));
        report.noticesSent++;
      } catch (err) {
        // Se libera para reintentar mañana.
        report.noticeErrors++;
        await db.subscriptionNotice.deleteMany({
          where: { subscriptionId: subRow.id, kind: notice.kind, dueAt: notice.dueAt },
        });
        console.error("[cron:subscriptions] aviso no enviado", err instanceof Error ? err.message : err);
      }
    }
  }

  await reconcilePendingPayments(db, now, report);
  return report;
}

async function reconcilePendingPayments(db: PrismaClient, now: Date, report: JobReport): Promise<void> {
  const gateway = getPaymentGateway();
  const pending = await db.subscriptionPayment.findMany({
    where: { status: "PENDING", provider: gateway.provider, providerTransactionId: { not: null } },
    select: { providerTransactionId: true },
    take: 100,
  });

  for (const p of pending) {
    try {
      const tx = await gateway.getTransaction(p.providerTransactionId!);
      if (tx && tx.status !== "PENDING") {
        await processGatewayTransaction(db, tx, now);
        report.paymentsReconciled++;
      }
    } catch (err) {
      console.error("[cron:subscriptions] conciliación falló", err instanceof Error ? err.message : err);
    }
  }

  const expired = await db.subscriptionPayment.updateMany({
    where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - PENDING_PAYMENT_TTL_MS) } },
    data: { status: "EXPIRED", statusMessage: "Sin respuesta de la pasarela en 24 h." },
  });
  report.paymentsExpired = expired.count;
}
