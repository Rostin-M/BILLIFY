import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { quoteCheckout } from "~/lib/subscription/billing";
import { BILLING_CYCLES, getPlan, PLAN_CODES } from "~/lib/subscription/catalog";
import { businessProcedure, createTRPCRouter, ownerProcedure } from "~/server/api/trpc";
import { appBaseUrl } from "~/server/lib/email";
import { enforceRateLimits, RATE_LIMITS } from "~/server/lib/rateLimit";
import { getPaymentGateway, isMockPaymentsEnabled } from "~/server/subscription/gateway";
import { mockTransactionId } from "~/server/subscription/gateway/mock";
import { createCheckout, processGatewayTransaction } from "~/server/subscription/payments";
import { effectiveMaxCashRegisters, getUsage, monthKey, USAGE_METRICS } from "~/server/subscription/quotas";
import { effectiveSubscription, vatConfig } from "~/server/subscription/service";

const planSchema = z.enum(PLAN_CODES);
const cycleSchema = z.enum(BILLING_CYCLES);
const referenceSchema = z.string().trim().regex(/^BLF-[A-Z0-9-]{6,60}$/, "Referencia inválida");

/** URL pública para volver del checkout. En producción debe estar AUTH_URL configurada. */
function baseUrlFrom(headers: Headers): string {
  const configured = appBaseUrl();
  if (configured) return configured;
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:3000";
  const proto = headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const PAYMENT_SELECT = {
  id: true,
  reference: true,
  kind: true,
  plan: true,
  billingCycle: true,
  amountInCents: true,
  vatInCents: true,
  status: true,
  statusMessage: true,
  periodStart: true,
  periodEnd: true,
  paidAt: true,
  provider: true,
  createdAt: true,
} as const;

export const billingRouter = createTRPCRouter({
  /** Estado de la suscripción y consumo. Cajeros también lo ven (para el aviso de vencimiento). */
  status: businessProcedure.query(async ({ ctx }) => {
    const { businessId, role } = ctx.user;
    const sub = ctx.subscription;
    const plan = getPlan(sub.billing.plan);
    const now = new Date();

    const [users, products, business, invoiceEmails, storageBytes] = await Promise.all([
      ctx.db.user.count({ where: { businessId, isActive: true } }),
      ctx.db.product.count({ where: { businessId, isActive: true } }),
      ctx.db.business.findUnique({ where: { id: businessId }, select: { maxCashRegisters: true } }),
      getUsage(ctx.db, businessId, USAGE_METRICS.invoiceEmails, monthKey(now)),
      getUsage(ctx.db, businessId, USAGE_METRICS.storageBytes, "total"),
    ]);

    return {
      plan: sub.billing.plan,
      planName: plan.name,
      billingCycle: sub.billing.billingCycle,
      phase: sub.access.phase,
      mode: sub.access.mode,
      endsAt: sub.access.endsAt,
      blockedAt: sub.access.blockedAt,
      daysLeft: sub.access.daysLeft,
      graceDaysLeft: sub.access.graceDaysLeft,
      scheduledPlan: sub.billing.scheduledFrom ? sub.row.scheduledPlan : null,
      scheduledCycle: sub.billing.scheduledFrom ? sub.row.scheduledCycle : null,
      scheduledFrom: sub.billing.scheduledFrom,
      canceledAt: sub.row.canceledAt,
      isOwner: role === "OWNER",
      provider: getPaymentGateway().provider,
      mockPayments: isMockPaymentsEnabled(),
      vat: vatConfig(),
      usage: {
        users: { used: users, limit: plan.limits.users },
        products: { used: products, limit: plan.limits.products },
        cashRegisters: {
          configured: business?.maxCashRegisters ?? 1,
          effective: effectiveMaxCashRegisters(business?.maxCashRegisters ?? 1, plan.code),
          limit: plan.limits.cashRegisters,
        },
        invoiceEmails: { used: invoiceEmails, limit: plan.limits.invoiceEmailsPerMonth },
        storageBytes: { used: storageBytes, limit: plan.limits.storageBytes },
      },
    };
  }),

  /** Qué se cobraría por un plan/ciclo (upgrade prorrateado o período completo). */
  quote: ownerProcedure
    .input(z.object({ plan: planSchema, cycle: cycleSchema }))
    .query(({ ctx, input }) => {
      const sub = ctx.subscription;
      return quoteCheckout({
        state: sub.billing,
        access: sub.access,
        plan: input.plan,
        cycle: input.cycle,
        vat: vatConfig(),
        now: new Date(),
      });
    }),

  payments: ownerProcedure.query(({ ctx }) =>
    ctx.db.subscriptionPayment.findMany({
      where: { businessId: ctx.user.businessId },
      select: PAYMENT_SELECT,
      orderBy: { createdAt: "desc" },
      take: 24,
    }),
  ),

  paymentByReference: ownerProcedure
    .input(z.object({ reference: referenceSchema }))
    .query(async ({ ctx, input }) => {
      const payment = await ctx.db.subscriptionPayment.findFirst({
        where: { reference: input.reference, businessId: ctx.user.businessId },
        select: PAYMENT_SELECT,
      });
      if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Pago no encontrado." });
      return payment;
    }),

  /** Crea el pago pendiente y devuelve la URL de la pasarela. Permitido en solo lectura. */
  checkout: ownerProcedure
    .input(z.object({ plan: planSchema, cycle: cycleSchema }))
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId, email } = ctx.user;
      await enforceRateLimits(
        [{ key: `checkout:business:${businessId}`, rule: RATE_LIMITS.checkoutByBusiness }],
        "Demasiados intentos de pago. Espera unos minutos.",
      );
      return createCheckout({
        db: ctx.db,
        businessId,
        userId,
        customerEmail: email,
        plan: input.plan,
        cycle: input.cycle,
        baseUrl: baseUrlFrom(ctx.headers),
      });
    }),

  /**
   * Al volver del checkout de Wompi (?id=<transacción>): se consulta el estado
   * REAL en la API de Wompi (nunca se confía en la URL) y se aplica. Así el
   * acceso se reactiva al instante aunque el webhook tarde.
   */
  confirmReturn: ownerProcedure
    .input(z.object({ transactionId: z.string().trim().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      const { businessId } = ctx.user;
      await enforceRateLimits(
        [{ key: `payconfirm:business:${businessId}`, rule: RATE_LIMITS.paymentConfirmByBusiness }],
        "Demasiadas consultas. Espera unos minutos.",
      );

      const tx = await getPaymentGateway().getTransaction(input.transactionId);
      if (!tx) throw new TRPCError({ code: "NOT_FOUND", message: "No encontramos esa transacción." });

      // La transacción debe ser de un pago de ESTE negocio.
      const payment = await ctx.db.subscriptionPayment.findFirst({
        where: { reference: tx.reference, businessId },
        select: { id: true },
      });
      if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Pago no encontrado." });

      await processGatewayTransaction(ctx.db, tx);
      return ctx.db.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id }, select: PAYMENT_SELECT });
    }),

  /** Solo con la pasarela simulada: aprobar o rechazar un pago pendiente propio. */
  simulatePayment: ownerProcedure
    .input(z.object({ reference: referenceSchema, outcome: z.enum(["APPROVED", "DECLINED"]) }))
    .mutation(async ({ ctx, input }) => {
      if (!isMockPaymentsEnabled()) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Los pagos simulados están desactivados." });
      }
      const payment = await ctx.db.subscriptionPayment.findFirst({
        where: { reference: input.reference, businessId: ctx.user.businessId, provider: "mock" },
        select: { id: true, amountInCents: true, currency: true },
      });
      if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Pago no encontrado." });

      await processGatewayTransaction(ctx.db, {
        provider: "mock",
        transactionId: mockTransactionId(input.reference),
        reference: input.reference,
        status: input.outcome,
        amountInCents: payment.amountInCents,
        currency: payment.currency,
        statusMessage: input.outcome === "APPROVED" ? "Pago simulado aprobado" : "Pago simulado rechazado",
      });
      return ctx.db.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id }, select: PAYMENT_SELECT });
    }),

  /** No renovar: conserva el acceso hasta el fin del período pagado, sin días de gracia. */
  cancel: ownerProcedure.mutation(async ({ ctx }) => {
    const sub = ctx.subscription;
    if (!sub.row.currentPeriodEnd) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Estás en la prueba gratis: no hay nada que cancelar." });
    }
    if (sub.row.canceledAt) return { message: "La suscripción ya estaba cancelada." };
    const now = new Date();
    const after = effectiveSubscription({ ...sub.row, canceledAt: now }, now);
    await ctx.db.subscription.update({
      where: { id: sub.row.id },
      data: { canceledAt: now, status: after.access.phase },
    });
    await ctx.db.auditLog.create({
      data: {
        businessId: ctx.user.businessId,
        userId: ctx.user.id,
        action: "SUBSCRIPTION_CANCELED",
        entityType: "Subscription",
        entityId: sub.row.id,
      },
    });
    return { message: "Listo. No te volveremos a cobrar; tu plan sigue activo hasta la fecha de vencimiento." };
  }),

  resume: ownerProcedure.mutation(async ({ ctx }) => {
    const sub = ctx.subscription;
    if (!sub.row.canceledAt) return { message: "Tu suscripción está activa." };
    const now = new Date();
    const after = effectiveSubscription({ ...sub.row, canceledAt: null }, now);
    await ctx.db.subscription.update({
      where: { id: sub.row.id },
      data: { canceledAt: null, status: after.access.phase },
    });
    await ctx.db.auditLog.create({
      data: {
        businessId: ctx.user.businessId,
        userId: ctx.user.id,
        action: "SUBSCRIPTION_RESUMED",
        entityType: "Subscription",
        entityId: sub.row.id,
      },
    });
    return { message: "Suscripción reactivada." };
  }),
});
