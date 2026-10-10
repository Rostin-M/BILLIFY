import { type Prisma, SubscriptionPaymentStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  GRANT_MAX_DAYS,
  GRANT_REASONS,
  GRANT_STARTS,
  type GrantResult,
  type Page,
  type PlatformAuditRow,
  type PlatformBusinessDetail,
  type PlatformBusinessRow,
  type PlatformOverview,
  type PlatformPaymentRow,
  TRIAL_EXTENSION_MAX_DAYS,
} from "~/lib/platform/contract";
import { addDays } from "~/lib/subscription/access";
import { getPlan, PLAN_CODES } from "~/lib/subscription/catalog";
import { createTRPCRouter, platformAdminProcedure } from "~/server/api/trpc";
import { extendTrial, grantPlan, resolvePaymentReview, revokeGrant } from "~/server/platform/grants";
import {
  AUDIT_ROW_SELECT,
  BUSINESS_ROW_SELECT,
  businessExpiringSoonWhere,
  businessPhaseWhere,
  PAYMENT_ROW_SELECT,
  toAuditRow,
  toBusinessRow,
  toPaymentRows,
} from "~/server/platform/views";
import { getUsage, monthKey, USAGE_METRICS } from "~/server/subscription/quotas";
import { effectiveSubscription } from "~/server/subscription/service";

/**
 * Panel de administración de la plataforma (/admin). Todo exige SUPERADMIN
 * (`platformAdminProcedure`) y devuelve los tipos de `~/lib/platform/contract`.
 * Las acciones viven en `~/server/platform/grants` y quedan en PlatformAuditLog.
 *
 * No confundir con el router `admin` (estadísticas del propietario de un negocio).
 * Aquí NO se filtra por `businessId` de la sesión: el administrador ve todos los
 * negocios, por eso ningún procedimiento de este archivo puede usar otro guard.
 */

const PHASES = ["TRIAL", "ACTIVE", "PAST_DUE", "CANCELED", "READ_ONLY"] as const;
const idSchema = z.string().min(1).max(64);

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
/** Pagos y registros de bitácora que trae el detalle de un negocio. */
const RECENT_ITEMS = 10;

const cursorPage = {
  cursor: idSchema.optional(),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
};

const listBusinessesSchema = z
  .object({
    search: z.string().trim().max(100).optional(),
    phase: z.enum(PHASES).optional(),
    expiringSoon: z.boolean().optional(),
    ...cursorPage,
  })
  .default({});

/** Tope del valor de un pago manual, en COP (la columna guarda centavos en un entero de 32 bits). */
const MAX_AMOUNT_COP = 20_000_000;
const NOTE_MAX = 500;
const EXTERNAL_REFERENCE_MAX = 80;

/** Texto opcional: recortado, y vacío = no enviado. */
const optionalText = (max: number, tooLong: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong)
    .optional()
    .transform((value) => (value === "" ? undefined : value));
const optionalNote = optionalText(NOTE_MAX, `La nota admite máximo ${NOTE_MAX} caracteres`);
/** Nota obligatoria: explica el porqué en la bitácora. */
const requiredNote = z
  .string()
  .trim()
  .min(5, "Escribe una nota que explique el motivo (mínimo 5 caracteres)")
  .max(NOTE_MAX, `La nota admite máximo ${NOTE_MAX} caracteres`);

const grantPlanSchema = z.object({
  businessId: idSchema,
  plan: z.enum(PLAN_CODES),
  days: z
    .number()
    .int("Los días deben ser un número entero")
    .min(1, "Mínimo 1 día")
    .max(GRANT_MAX_DAYS, `Máximo ${GRANT_MAX_DAYS} días`),
  reason: z.enum(GRANT_REASONS),
  start: z.enum(GRANT_STARTS),
  amountCop: z
    .number()
    .int("El valor va en pesos, sin centavos")
    .min(0, "El valor no puede ser negativo")
    .max(MAX_AMOUNT_COP, "El valor es demasiado alto")
    .optional(),
  externalReference: optionalText(
    EXTERNAL_REFERENCE_MAX,
    `El comprobante admite máximo ${EXTERNAL_REFERENCE_MAX} caracteres`,
  ),
  note: optionalNote,
  notifyOwner: z.boolean(),
});

const extendTrialSchema = z.object({
  businessId: idSchema,
  days: z
    .number()
    .int("Los días deben ser un número entero")
    .min(1, "Mínimo 1 día")
    .max(TRIAL_EXTENSION_MAX_DAYS, `Máximo ${TRIAL_EXTENSION_MAX_DAYS} días`),
  note: optionalNote,
});

function requestMeta(ctx: { ip: string; userAgent: string | null }) {
  return { ip: ctx.ip, userAgent: ctx.userAgent };
}

export const platformRouter = createTRPCRouter({
  /** Conteos del tablero. Las fases se calculan por fechas, no con la columna `status`. */
  overview: platformAdminProcedure.query(async ({ ctx }): Promise<PlatformOverview> => {
    const now = new Date();
    const count = (where: Prisma.BusinessWhereInput) => ctx.db.business.count({ where });

    const [total, trial, active, pastDue, canceled, readOnly, expiringSoon, newLast30Days, paymentsToReview] =
      await Promise.all([
        count({}),
        count(businessPhaseWhere("TRIAL", now)),
        count(businessPhaseWhere("ACTIVE", now)),
        count(businessPhaseWhere("PAST_DUE", now)),
        count(businessPhaseWhere("CANCELED", now)),
        count(businessPhaseWhere("READ_ONLY", now)),
        count(businessExpiringSoonWhere(now)),
        count({ createdAt: { gte: addDays(now, -30) } }),
        ctx.db.subscriptionPayment.count({ where: { needsReview: true } }),
      ]);

    return { total, trial, active, pastDue, canceled, readOnly, expiringSoon, newLast30Days, paymentsToReview };
  }),

  /** Negocios, del más nuevo al más antiguo, paginados por cursor (id del último de la página). */
  listBusinesses: platformAdminProcedure
    .input(listBusinessesSchema)
    .query(async ({ ctx, input }): Promise<Page<PlatformBusinessRow>> => {
      const now = new Date();
      const limit = input.limit ?? DEFAULT_PAGE_SIZE;

      const filters: Prisma.BusinessWhereInput[] = [];
      if (input.search) {
        // Prisma no escapa los comodines de LIKE: "100%" o "a_b" deben buscarse como texto.
        const literal = input.search.replace(/[\\%_]/g, "\\$&");
        const contains = { contains: literal, mode: "insensitive" as const };
        filters.push({
          OR: [
            { name: contains },
            { document: contains },
            { users: { some: { role: "OWNER", OR: [{ name: contains }, { email: contains }] } } },
          ],
        });
      }
      if (input.phase) filters.push(businessPhaseWhere(input.phase, now));
      if (input.expiringSoon) filters.push(businessExpiringSoonWhere(now));

      // Una fila de más para saber si hay siguiente página.
      const rows = await ctx.db.business.findMany({
        where: { AND: filters },
        select: BUSINESS_ROW_SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      const items = rows.slice(0, limit).map((row) => toBusinessRow(row, now));
      return { items, nextCursor: rows.length > limit ? (items[items.length - 1]?.id ?? null) : null };
    }),

  getBusiness: platformAdminProcedure
    .input(z.object({ businessId: idSchema }))
    .query(async ({ ctx, input }): Promise<PlatformBusinessDetail> => {
      const { businessId } = input;
      const now = new Date();

      const business = await ctx.db.business.findUnique({
        where: { id: businessId },
        select: { ...BUSINESS_ROW_SELECT, address: true, phone: true, email: true },
      });
      if (!business) throw new TRPCError({ code: "NOT_FOUND", message: "Negocio no encontrado." });

      const [users, activeProducts, invoiceEmailsThisMonth, storageBytes, salesLast30Days, lastSale, payments, audit] =
        await Promise.all([
          ctx.db.user.findMany({
            where: { businessId },
            select: { id: true, name: true, email: true, role: true, isActive: true },
            orderBy: [{ role: "asc" }, { name: "asc" }],
          }),
          ctx.db.product.count({ where: { businessId, isActive: true } }),
          getUsage(ctx.db, businessId, USAGE_METRICS.invoiceEmails, monthKey(now)),
          getUsage(ctx.db, businessId, USAGE_METRICS.storageBytes, "total"),
          ctx.db.sale.count({
            where: { businessId, status: "COMPLETED", createdAt: { gte: addDays(now, -30) } },
          }),
          ctx.db.sale.aggregate({ where: { businessId, status: "COMPLETED" }, _max: { createdAt: true } }),
          ctx.db.subscriptionPayment.findMany({
            where: { businessId },
            select: PAYMENT_ROW_SELECT,
            orderBy: { createdAt: "desc" },
            take: RECENT_ITEMS,
          }),
          ctx.db.platformAuditLog.findMany({
            where: { businessId },
            select: AUDIT_ROW_SELECT,
            orderBy: { createdAt: "desc" },
            take: RECENT_ITEMS,
          }),
        ]);

      const row = toBusinessRow(business, now);
      // Los límites son los del plan efectivo (con el cambio programado ya aplicado).
      const limits = getPlan(row.subscription.plan).limits;
      const sub = business.subscription ? effectiveSubscription(business.subscription, now) : null;

      return {
        ...row,
        address: business.address,
        phone: business.phone,
        email: business.email,
        subscriptionDates: {
          trialEndsAt: sub?.row.trialEndsAt ?? null,
          currentPeriodStart: sub?.billing.currentPeriodStart ?? null,
          currentPeriodEnd: sub?.billing.currentPeriodEnd ?? null,
          canceledAt: sub?.row.canceledAt ?? null,
          // Solo el cambio que todavía no empieza (el que ya empezó está en `subscription.plan`).
          scheduledPlan: sub?.billing.scheduledFrom ? sub.row.scheduledPlan : null,
          scheduledFrom: sub?.billing.scheduledFrom ?? null,
        },
        usage: {
          activeUsers: row.activeUsers,
          usersLimit: limits.users,
          activeProducts,
          productsLimit: limits.products,
          invoiceEmailsThisMonth,
          invoiceEmailsLimit: limits.invoiceEmailsPerMonth,
          storageBytes,
          storageLimitBytes: limits.storageBytes,
          salesLast30Days,
          lastSaleAt: lastSale._max.createdAt,
        },
        // Un SUPERADMIN nunca pertenece a un negocio (CHECK en la BD); si apareciera, no se lista.
        users: users.flatMap((u) => (u.role === "SUPERADMIN" ? [] : [{ ...u, role: u.role }])),
        recentPayments: await toPaymentRows(ctx.db, payments, { subscription: business.subscription, now }),
        recentAudit: audit.map(toAuditRow),
      };
    }),

  /** Pagos de todos los negocios (o de uno), del más nuevo al más antiguo. */
  listPayments: platformAdminProcedure
    .input(
      z
        .object({
          businessId: idSchema.optional(),
          status: z.nativeEnum(SubscriptionPaymentStatus).optional(),
          onlyManual: z.boolean().optional(),
          needsReview: z.boolean().optional(),
          ...cursorPage,
        })
        .default({}),
    )
    .query(async ({ ctx, input }): Promise<Page<PlatformPaymentRow>> => {
      const limit = input.limit ?? DEFAULT_PAGE_SIZE;
      const rows = await ctx.db.subscriptionPayment.findMany({
        where: {
          businessId: input.businessId,
          status: input.status,
          ...(input.onlyManual ? { kind: "MANUAL" as const } : {}),
          ...(input.needsReview ? { needsReview: true } : {}),
        },
        select: PAYMENT_ROW_SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      // Sin `revokePreview`: esa vista previa solo se calcula en el detalle de un negocio.
      const items = await toPaymentRows(ctx.db, rows.slice(0, limit));
      return { items, nextCursor: rows.length > limit ? (items[items.length - 1]?.id ?? null) : null };
    }),

  /** Bitácora del panel (de todos los negocios o de uno), de lo más reciente a lo más antiguo. */
  listAudit: platformAdminProcedure
    .input(z.object({ businessId: idSchema.optional(), ...cursorPage }).default({}))
    .query(async ({ ctx, input }): Promise<Page<PlatformAuditRow>> => {
      const limit = input.limit ?? DEFAULT_PAGE_SIZE;
      const rows = await ctx.db.platformAuditLog.findMany({
        where: { businessId: input.businessId },
        select: AUDIT_ROW_SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      const items = rows.slice(0, limit).map(toAuditRow);
      return { items, nextCursor: rows.length > limit ? (items[items.length - 1]?.id ?? null) : null };
    }),

  // ─── Acciones (cada una queda en PlatformAuditLog con ip y navegador) ──────

  /** Activa un plan por N días (pago por Nequi/transferencia, cortesía o compensación). */
  grantPlan: platformAdminProcedure
    .input(grantPlanSchema)
    .mutation(({ ctx, input }): Promise<GrantResult> => grantPlan(ctx.db, ctx.user, requestMeta(ctx), input)),

  /** Suma días a la prueba de un negocio que nunca ha pagado. */
  extendTrial: platformAdminProcedure
    .input(extendTrialSchema)
    .mutation(({ ctx, input }): Promise<GrantResult> => extendTrial(ctx.db, ctx.user, requestMeta(ctx), input)),

  /** Deshace la activación manual más reciente: la suscripción vuelve a como estaba antes de ella. */
  revokeGrant: platformAdminProcedure
    .input(z.object({ paymentId: idSchema, note: requiredNote, notifyOwner: z.boolean() }))
    .mutation(({ ctx, input }): Promise<GrantResult> => revokeGrant(ctx.db, ctx.user, requestMeta(ctx), input)),

  /** Quita la marca "por revisar" de un pago, dejando la explicación en la bitácora. */
  resolvePaymentReview: platformAdminProcedure
    .input(z.object({ paymentId: idSchema, note: requiredNote }))
    .mutation(({ ctx, input }) => resolvePaymentReview(ctx.db, ctx.user, requestMeta(ctx), input)),
});
