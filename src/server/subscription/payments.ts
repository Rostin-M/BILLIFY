import "server-only";

import { randomBytes } from "node:crypto";

import { type PrismaClient, type SubscriptionPaymentStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import { applyApprovedPayment, quoteCheckout } from "~/lib/subscription/billing";
import { type BillingCycle, CYCLE_LABELS, formatCop, getPlan, type PlanCode } from "~/lib/subscription/catalog";
import { formatDate } from "~/lib/subscription/notices";
import { sendSubscriptionEmail } from "~/server/lib/email";

import { getPaymentGateway, type GatewayTransaction } from "./gateway";
import { effectiveSubscription, requireSubscription, SUBSCRIPTION_SELECT, vatConfig } from "./service";

/** Un checkout pendiente igual se reutiliza durante este tiempo (doble clic, volver atrás). */
const CHECKOUT_REUSE_MS = 30 * 60 * 1000;

export function newPaymentReference(): string {
  return `BLF-${Date.now().toString(36).toUpperCase()}-${randomBytes(6).toString("hex").toUpperCase()}`;
}

export type CheckoutResult = {
  paymentId: string;
  reference: string;
  checkoutUrl: string;
  kind: "PERIOD" | "UPGRADE";
  amountInCents: number;
};

/**
 * Crea (o reutiliza) un pago PENDIENTE y devuelve la URL de la pasarela. El
 * monto sale del catálogo en el servidor: el navegador solo elige plan y ciclo.
 */
export async function createCheckout(params: {
  db: PrismaClient;
  businessId: string;
  userId: string;
  customerEmail: string | null;
  plan: PlanCode;
  cycle: BillingCycle;
  baseUrl: string;
  now?: Date;
}): Promise<CheckoutResult> {
  const { db, businessId, userId, customerEmail, plan, cycle, baseUrl, now = new Date() } = params;
  const gateway = getPaymentGateway();
  const sub = await requireSubscription(db, businessId, now);

  const quote = quoteCheckout({ state: sub.billing, access: sub.access, plan, cycle, vat: vatConfig(), now });
  if (!quote.ok) throw new TRPCError({ code: "BAD_REQUEST", message: quote.reason });

  const reusable = await db.subscriptionPayment.findFirst({
    where: {
      businessId,
      provider: gateway.provider,
      status: "PENDING",
      kind: quote.kind,
      plan,
      billingCycle: cycle,
      amountInCents: quote.charge.amountInCents,
      createdAt: { gt: new Date(now.getTime() - CHECKOUT_REUSE_MS) },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, reference: true },
  });

  const payment =
    reusable ??
    (await db.subscriptionPayment.create({
      data: {
        subscriptionId: sub.row.id,
        businessId,
        reference: newPaymentReference(),
        provider: gateway.provider,
        kind: quote.kind,
        plan,
        billingCycle: cycle,
        amountInCents: quote.charge.amountInCents,
        vatInCents: quote.charge.vatInCents,
        createdById: userId,
      },
      select: { id: true, reference: true },
    }));

  const checkoutUrl = gateway.createCheckoutUrl({
    reference: payment.reference,
    amountInCents: quote.charge.amountInCents,
    currency: "COP",
    customerEmail,
    redirectUrl: `${baseUrl}/suscripcion/resultado`,
  });

  return {
    paymentId: payment.id,
    reference: payment.reference,
    checkoutUrl,
    kind: quote.kind,
    amountInCents: quote.charge.amountInCents,
  };
}

export type ProcessOutcome =
  | "approved"
  | "already_approved"
  | "status_updated"
  | "unknown_reference"
  | "provider_mismatch"
  | "amount_mismatch"
  | "voided_after_approval";

export type ProcessResult = { outcome: ProcessOutcome; paymentId?: string; businessId?: string };

const FAILED_STATUSES: Partial<Record<GatewayTransaction["status"], SubscriptionPaymentStatus>> = {
  DECLINED: "DECLINED",
  VOIDED: "VOIDED",
  ERROR: "ERROR",
};

/**
 * Aplica una transacción de la pasarela (webhook, retorno del checkout, cron o
 * simulación). Idempotente: el pago se bloquea con FOR UPDATE y solo la primera
 * aprobación extiende la suscripción; repetir el mismo evento no cambia nada.
 */
export async function processGatewayTransaction(
  db: PrismaClient,
  tx: GatewayTransaction,
  now = new Date(),
): Promise<ProcessResult> {
  const result = await db.$transaction(
    async (t): Promise<ProcessResult> => {
      const locked = await t.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "subscription_payments" WHERE "reference" = ${tx.reference} FOR UPDATE
      `;
      if (locked.length === 0) return { outcome: "unknown_reference" };

      const payment = await t.subscriptionPayment.findUniqueOrThrow({ where: { id: locked[0]!.id } });
      const ids = { paymentId: payment.id, businessId: payment.businessId };

      if (payment.provider !== tx.provider) return { outcome: "provider_mismatch", ...ids };
      // La firma de integridad ya lo impide, pero nunca se aplica un pago por otro monto.
      if (payment.amountInCents !== tx.amountInCents || payment.currency !== tx.currency) {
        await t.subscriptionPayment.update({
          where: { id: payment.id },
          data: { statusMessage: `Monto recibido no coincide: ${tx.amountInCents} ${tx.currency}` },
        });
        return { outcome: "amount_mismatch", ...ids };
      }

      if (payment.status === "APPROVED") {
        // Una anulación posterior (reverso) se deja para revisión manual; no se quita el acceso solo.
        if (tx.status === "VOIDED") {
          await t.subscriptionPayment.update({
            where: { id: payment.id },
            data: { statusMessage: "Wompi reportó anulación después de aprobado: revisar manualmente." },
          });
          return { outcome: "voided_after_approval", ...ids };
        }
        return { outcome: "already_approved", ...ids };
      }

      if (tx.status !== "APPROVED") {
        await t.subscriptionPayment.update({
          where: { id: payment.id },
          data: {
            providerTransactionId: tx.transactionId,
            status: FAILED_STATUSES[tx.status] ?? payment.status,
            statusMessage: tx.statusMessage,
          },
        });
        return { outcome: "status_updated", ...ids };
      }

      // ─── Aprobado: extender o mejorar la suscripción ───────────────────
      await t.$queryRaw`SELECT "id" FROM "subscriptions" WHERE "id" = ${payment.subscriptionId} FOR UPDATE`;
      const row = await t.subscription.findUniqueOrThrow({
        where: { id: payment.subscriptionId },
        select: SUBSCRIPTION_SELECT,
      });
      const current = effectiveSubscription(row, now);
      const applied = applyApprovedPayment({
        state: current.billing,
        access: current.access,
        kind: payment.kind,
        plan: payment.plan,
        cycle: payment.billingCycle,
        now,
      });

      // Cambio programado que ya empezó: se consolida antes de aplicar el nuevo pago.
      const consolidated =
        current.billing.plan !== row.plan || current.billing.billingCycle !== row.billingCycle
          ? {
              plan: current.billing.plan,
              billingCycle: current.billing.billingCycle,
              currentPeriodStart: current.billing.currentPeriodStart,
              scheduledPlan: null,
              scheduledCycle: null,
              scheduledFrom: null,
            }
          : {};

      const updated = await t.subscription.update({
        where: { id: row.id },
        data: { ...consolidated, ...applied.update, status: "ACTIVE" },
        select: SUBSCRIPTION_SELECT,
      });
      // El estado reflejado debe coincidir con las fechas (p. ej. CANCELED → ACTIVE).
      const after = effectiveSubscription(updated, now);
      if (after.access.phase !== "ACTIVE") {
        await t.subscription.update({ where: { id: row.id }, data: { status: after.access.phase } });
      }

      await t.subscriptionPayment.update({
        where: { id: payment.id },
        data: {
          status: "APPROVED",
          providerTransactionId: tx.transactionId,
          statusMessage: tx.statusMessage,
          paidAt: now,
          periodStart: applied.periodStart,
          periodEnd: applied.periodEnd,
        },
      });

      if (payment.createdById) {
        await t.auditLog.create({
          data: {
            businessId: payment.businessId,
            userId: payment.createdById,
            action: "SUBSCRIPTION_PAYMENT_APPROVED",
            entityType: "SubscriptionPayment",
            entityId: payment.id,
            detail: {
              reference: payment.reference,
              kind: payment.kind,
              plan: payment.plan,
              cycle: payment.billingCycle,
              amountInCents: payment.amountInCents,
              periodEnd: applied.periodEnd.toISOString(),
            },
          },
        });
      }

      return { outcome: "approved", ...ids };
    },
    { maxWait: 10_000, timeout: 20_000 },
  );

  if (result.outcome === "approved" && result.paymentId) {
    await notifyPaymentApproved(db, result.paymentId).catch((err: unknown) =>
      console.error("[billing] correo de pago aprobado falló", err instanceof Error ? err.message : err),
    );
  }
  return result;
}

async function notifyPaymentApproved(db: PrismaClient, paymentId: string): Promise<void> {
  const payment = await db.subscriptionPayment.findUnique({
    where: { id: paymentId },
    select: {
      reference: true,
      kind: true,
      plan: true,
      billingCycle: true,
      amountInCents: true,
      periodEnd: true,
      business: {
        select: {
          name: true,
          users: { where: { role: "OWNER", isActive: true }, select: { email: true, name: true }, take: 1 },
        },
      },
    },
  });
  const owner = payment?.business.users[0];
  if (!payment || !owner?.email) return;

  const plan = getPlan(payment.plan);
  await sendSubscriptionEmail(owner.email, owner.name, {
    subject: "Pago recibido",
    title: "¡Pago recibido!",
    paragraphs: [
      payment.kind === "UPGRADE"
        ? `${payment.business.name} ya tiene el plan ${plan.name}.`
        : `Renovamos el plan ${plan.name} (${CYCLE_LABELS[payment.billingCycle].toLowerCase()}) de ${payment.business.name}${
            payment.periodEnd ? ` hasta el ${formatDate(payment.periodEnd)}` : ""
          }.`,
      `Valor: ${formatCop(payment.amountInCents / 100)}. Referencia: ${payment.reference}.`,
      "Este correo es un comprobante de pago; no es una factura electrónica.",
    ],
    ctaLabel: "Ver mi suscripción",
  });
}
