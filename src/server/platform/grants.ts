import "server-only";

import { type Prisma, type PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import {
  type ExtendTrialInput,
  GRANT_REASON_LABELS,
  type GrantPlanInput,
  type GrantResult,
  type ResolvePaymentReviewInput,
  type RevokeGrantInput,
} from "~/lib/platform/contract";
import { computeGrantPeriod } from "~/lib/platform/grant";
import { addDays } from "~/lib/subscription/access";
import { formatCop, getPlan } from "~/lib/subscription/catalog";
import { formatDate } from "~/lib/subscription/notices";
import { sendSubscriptionEmail } from "~/server/lib/email";
import { newPaymentReference, nextPaidAt } from "~/server/subscription/payments";
import {
  effectiveSubscription,
  requireSubscription,
  SUBSCRIPTION_SELECT,
  type SubscriptionRow,
  vatConfig,
} from "~/server/subscription/service";

import {
  isRevocationCandidate,
  latestEffectivePaymentIds,
  parseGrantSnapshot,
  resolveRevocation,
  takeGrantSnapshot,
} from "./revocation";
import { summarizeSubscription } from "./views";

/**
 * Acciones del panel de administración sobre la suscripción de un negocio:
 * activar un plan por días, extender la prueba, revocar una activación y marcar
 * un pago como revisado.
 *
 * Todas siguen el mismo patrón que `processGatewayTransaction`: una transacción
 * que bloquea la fila de la suscripción (FOR UPDATE), de modo que dos acciones
 * sobre el mismo negocio (o una acción y un pago de la pasarela) nunca se pisan,
 * y que registra la acción en `PlatformAuditLog` dentro de la misma transacción.
 * Los correos salen después y nunca revierten la acción.
 */

export const MANUAL_PROVIDER = "manual";

/**
 * Doble envío (doble clic, reintento del navegador): el contrato no trae clave
 * de idempotencia, así que una acción IDÉNTICA del mismo administrador sobre el
 * mismo negocio dentro de esta ventana se rechaza con CONFLICT. El bloqueo de
 * la suscripción garantiza que la segunda petición ya ve a la primera.
 */
export const DUPLICATE_WINDOW_MS = 60_000;

/** Quién actúa: el SUPERADMIN ya verificado por `platformAdminProcedure`. */
export type PlatformActor = { id: string; email: string | null; name: string | null };
export type RequestMeta = { ip: string; userAgent: string | null };

type Tx = Prisma.TransactionClient;

const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

const DUPLICATE_MESSAGE =
  "Ya registraste esta misma acción hace un momento. Revisa el historial del negocio antes de repetirla.";

// ─── Piezas compartidas ──────────────────────────────────────────────────────

async function requireBusiness(db: PrismaClient, businessId: string) {
  const business = await db.business.findUnique({ where: { id: businessId }, select: { id: true, name: true } });
  if (!business) throw new TRPCError({ code: "NOT_FOUND", message: "Negocio no encontrado." });
  return business;
}

/** Bloquea la suscripción del negocio hasta el fin de la transacción y la devuelve fresca. */
async function lockSubscription(tx: Tx, businessId: string): Promise<SubscriptionRow> {
  await tx.$queryRaw`SELECT "id" FROM "subscriptions" WHERE "business_id" = ${businessId} FOR UPDATE`;
  return tx.subscription.findUniqueOrThrow({ where: { businessId }, select: SUBSCRIPTION_SELECT });
}

/** Aplica cambios y deja la columna `status` igual a la fase calculada por fechas. */
async function updateSubscription(
  tx: Tx,
  row: SubscriptionRow,
  data: Prisma.SubscriptionUncheckedUpdateInput,
  now: Date,
): Promise<SubscriptionRow> {
  const updated = await tx.subscription.update({ where: { id: row.id }, data, select: SUBSCRIPTION_SELECT });
  const phase = effectiveSubscription(updated, now).access.phase;
  if (updated.status === phase) return updated;
  return tx.subscription.update({ where: { id: row.id }, data: { status: phase }, select: SUBSCRIPTION_SELECT });
}

async function recordAudit(
  tx: Tx,
  params: {
    actor: PlatformActor;
    meta: RequestMeta;
    now: Date;
    action: string;
    business: { id: string; name: string };
    entityType: string;
    entityId: string;
    summary: string;
    detail: Prisma.InputJsonObject;
  },
): Promise<void> {
  const { actor, meta, business, now, ...rest } = params;
  await tx.platformAuditLog.create({
    data: {
      ...rest,
      adminId: actor.id,
      adminEmail: actor.email ?? "",
      adminName: actor.name,
      businessId: business.id,
      businessName: business.name,
      ip: meta.ip,
      userAgent: meta.userAgent,
      createdAt: now,
    },
  });
}

type OwnerEmail = Parameters<typeof sendSubscriptionEmail>[2];

/** Correo al propietario activo. Devuelve false si no hay a quién enviar o si el envío falla. */
async function notifyOwner(db: PrismaClient, businessId: string, email: OwnerEmail): Promise<boolean> {
  try {
    const owner = await db.user.findFirst({
      where: { businessId, role: "OWNER", isActive: true, email: { not: null } },
      orderBy: { id: "asc" },
      select: { email: true, name: true },
    });
    if (!owner?.email) return false;
    await sendSubscriptionEmail(owner.email, owner.name, email);
    return true;
  } catch (err) {
    console.error("[platform] correo al propietario falló", err instanceof Error ? err.message : err);
    return false;
  }
}

const daysLabel = (days: number) => `${days} ${days === 1 ? "día" : "días"}`;

// ─── Activar un plan por días ────────────────────────────────────────────────

export async function grantPlan(
  db: PrismaClient,
  actor: PlatformActor,
  meta: RequestMeta,
  input: GrantPlanInput,
  now = new Date(),
): Promise<GrantResult> {
  const { businessId, plan, days, reason, start } = input;
  const note = input.note ?? null;
  const externalReference = input.externalReference ?? null;
  const amountCop = input.amountCop ?? 0;

  if (reason === "MANUAL_PAYMENT" && amountCop <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Indica el valor que pagó el negocio." });
  }
  if (reason !== "MANUAL_PAYMENT" && amountCop > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: 'El valor solo aplica cuando el motivo es "Pago manual". Déjalo en 0 o cambia el motivo.',
    });
  }
  // El valor recibido es el total: si se cobra IVA, va incluido en él.
  const amountInCents = amountCop * 100;
  const vatRate = vatConfig().rate;
  const vatInCents = vatRate > 0 ? amountInCents - Math.round(amountInCents / (1 + vatRate)) : 0;

  const business = await requireBusiness(db, businessId);
  // Fuera de la transacción: si falta la suscripción (no debería), crearla puede
  // chocar con otra petición y eso abortaría la transacción.
  await requireSubscription(db, businessId, now);

  const applied = await db.$transaction(async (tx) => {
    const row = await lockSubscription(tx, businessId);

    const duplicate = await tx.subscriptionPayment.findFirst({
      where: {
        businessId,
        kind: "MANUAL",
        createdById: actor.id,
        revokedAt: null,
        plan,
        grantDays: days,
        grantReason: reason,
        grantNote: note,
        externalReference,
        amountInCents,
        createdAt: { gt: new Date(now.getTime() - DUPLICATE_WINDOW_MS) },
      },
      select: { id: true },
    });
    if (duplicate) throw new TRPCError({ code: "CONFLICT", message: DUPLICATE_MESSAGE });

    // Un mismo comprobante no activa dos veces al mismo negocio.
    if (externalReference) {
      const sameReceipt = await tx.subscriptionPayment.findFirst({
        where: {
          businessId,
          kind: "MANUAL",
          revokedAt: null,
          externalReference: { equals: externalReference, mode: "insensitive" },
        },
        select: { reference: true },
      });
      if (sameReceipt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `El comprobante ${externalReference} ya se usó en otra activación de este negocio (${sameReceipt.reference}).`,
        });
      }
    }

    const current = effectiveSubscription(row, now);
    const period = computeGrantPeriod({ state: current.billing, access: current.access, plan, days, start, now });
    if (!period.ok) throw new TRPCError({ code: "BAD_REQUEST", message: period.reason });

    // Cambio programado que ya empezó: se consolida antes de aplicar la activación.
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
    const updated = await updateSubscription(tx, row, { ...consolidated, ...period.update }, now);

    const payment = await tx.subscriptionPayment.create({
      data: {
        subscriptionId: row.id,
        businessId,
        reference: newPaymentReference(),
        provider: MANUAL_PROVIDER,
        kind: "MANUAL",
        plan,
        // Las activaciones van por días; se copia el ciclo de la suscripción solo porque la columna es obligatoria.
        billingCycle: updated.billingCycle,
        amountInCents,
        vatInCents,
        status: "APPROVED",
        statusMessage: GRANT_REASON_LABELS[reason],
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        // Posterior a todo pago ya aplicado, aunque `now` se haya tomado antes del bloqueo.
        paidAt: await nextPaidAt(tx, businessId, now),
        createdById: actor.id,
        createdAt: now,
        grantReason: reason,
        grantDays: days,
        grantNote: note,
        externalReference,
        grantSnapshot: takeGrantSnapshot(row),
      },
      select: { id: true, reference: true },
    });

    const planName = getPlan(plan).name;
    await recordAudit(tx, {
      actor,
      meta,
      now,
      action: "GRANT_PLAN",
      business,
      entityType: "SubscriptionPayment",
      entityId: payment.id,
      summary:
        `Activó el plan ${planName} por ${daysLabel(days)} (${GRANT_REASON_LABELS[reason]}): ` +
        `del ${formatDate(period.periodStart)} al ${formatDate(period.periodEnd)}` +
        (period.scheduled ? ", programado al terminar lo vigente" : "") +
        (period.lostDays > 0 ? `; reemplazó ${daysLabel(period.lostDays)} vigentes` : ""),
      detail: {
        reference: payment.reference,
        plan,
        days,
        reason,
        start,
        amountCop,
        externalReference,
        note,
        periodStart: period.periodStart.toISOString(),
        periodEnd: period.periodEnd.toISOString(),
        scheduled: period.scheduled,
        lostDays: period.lostDays,
        notifyOwner: input.notifyOwner,
      },
    });

    return { updated, period, reference: payment.reference };
  }, TX_OPTIONS);

  const { updated, period, reference } = applied;
  const planName = getPlan(plan).name;
  const receipt = externalReference ? ` (comprobante ${externalReference})` : "";
  const ownerNotified =
    input.notifyOwner &&
    (await notifyOwner(db, businessId, {
      subject: "Activamos tu plan",
      title: "¡Tu plan está activo!",
      paragraphs: [
        period.scheduled
          ? `Tu plan actual de ${business.name} sigue hasta el ${formatDate(period.periodStart)}. Ese día empieza el plan ${planName}, que va hasta el ${formatDate(period.periodEnd)} (${daysLabel(days)}).`
          : `Activamos el plan ${planName} de ${business.name} por ${daysLabel(days)}: va hasta el ${formatDate(period.periodEnd)}.`,
        amountCop > 0
          ? `Recibimos tu pago de ${formatCop(amountCop)}${receipt}. Referencia: ${reference}.`
          : `Referencia: ${reference}.`,
        "Este correo es un comprobante; no es una factura electrónica.",
      ],
      ctaLabel: "Ver mi suscripción",
    }));

  return {
    businessId,
    subscription: summarizeSubscription(updated, now),
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    ownerNotified,
  };
}

// ─── Extender la prueba ──────────────────────────────────────────────────────

export async function extendTrial(
  db: PrismaClient,
  actor: PlatformActor,
  meta: RequestMeta,
  input: ExtendTrialInput,
  now = new Date(),
): Promise<GrantResult> {
  const { businessId, days } = input;
  const note = input.note ?? null;

  const business = await requireBusiness(db, businessId);
  await requireSubscription(db, businessId, now);

  const { updated, trialEndsAt } = await db.$transaction(async (tx) => {
    const row = await lockSubscription(tx, businessId);
    if (row.currentPeriodEnd) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: 'Este negocio ya tuvo un plan pagado: la prueba no se puede extender. Usa "Activar plan".',
      });
    }

    const duplicate = await tx.platformAuditLog.findFirst({
      where: {
        adminId: actor.id,
        businessId,
        action: "EXTEND_TRIAL",
        createdAt: { gt: new Date(now.getTime() - DUPLICATE_WINDOW_MS) },
        detail: { path: ["days"], equals: days },
      },
      select: { id: true },
    });
    if (duplicate) throw new TRPCError({ code: "CONFLICT", message: DUPLICATE_MESSAGE });

    // Prueba vigente: se suma al final. Prueba vencida: cuenta desde hoy.
    const from = row.trialEndsAt && row.trialEndsAt > now ? row.trialEndsAt : now;
    const trialEndsAt = addDays(from, days);
    const updated = await updateSubscription(tx, row, { trialEndsAt }, now);

    await recordAudit(tx, {
      actor,
      meta,
      now,
      action: "EXTEND_TRIAL",
      business,
      entityType: "Subscription",
      entityId: row.id,
      summary: `Extendió la prueba ${daysLabel(days)}: hasta el ${formatDate(trialEndsAt)}`,
      detail: {
        days,
        note,
        previousTrialEndsAt: row.trialEndsAt?.toISOString() ?? null,
        trialEndsAt: trialEndsAt.toISOString(),
      },
    });
    return { updated, trialEndsAt };
  }, TX_OPTIONS);

  return {
    businessId,
    subscription: summarizeSubscription(updated, now),
    periodStart: null,
    periodEnd: trialEndsAt,
    ownerNotified: false,
  };
}

// ─── Revocar una activación ──────────────────────────────────────────────────

const NOT_REVOCABLE_MESSAGE =
  "Solo se puede revocar la activación más reciente del negocio, y si no hay pagos aprobados después de ella.";

export async function revokeGrant(
  db: PrismaClient,
  actor: PlatformActor,
  meta: RequestMeta,
  input: RevokeGrantInput,
  now = new Date(),
): Promise<GrantResult> {
  const found = await db.subscriptionPayment.findUnique({
    where: { id: input.paymentId },
    select: { id: true, kind: true, business: { select: { id: true, name: true } } },
  });
  if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Pago no encontrado." });
  if (found.kind !== "MANUAL") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Solo se pueden revocar las activaciones manuales." });
  }
  const business = found.business;

  const { updated, payment } = await db.$transaction(async (tx) => {
    const row = await lockSubscription(tx, business.id);
    // Con la suscripción bloqueada: nadie más puede revocar ni activar a la vez.
    const payment = await tx.subscriptionPayment.findUniqueOrThrow({
      where: { id: found.id },
      select: {
        id: true,
        businessId: true,
        reference: true,
        kind: true,
        status: true,
        plan: true,
        grantDays: true,
        revokedAt: true,
        grantSnapshot: true,
        createdAt: true,
      },
    });
    if (payment.revokedAt) {
      throw new TRPCError({ code: "CONFLICT", message: "Esta activación ya estaba revocada." });
    }
    const snapshot = parseGrantSnapshot(payment.grantSnapshot);
    const latest = await latestEffectivePaymentIds(tx, [business.id]);
    if (!snapshot || !isRevocationCandidate(payment) || latest.get(business.id) !== payment.id) {
      throw new TRPCError({ code: "CONFLICT", message: NOT_REVOCABLE_MESSAGE });
    }

    // La suscripción vuelve a ser la de antes de la activación (salvo una
    // cancelación o reanudación que el propietario haya hecho después).
    const restore = await resolveRevocation(tx, { businessId: business.id, grantedAt: payment.createdAt, snapshot }, row);
    const updated = await updateSubscription(tx, row, restore.data, now);
    await tx.subscriptionPayment.update({
      where: { id: payment.id },
      data: { revokedAt: now, revokedById: actor.id, revokeNote: input.note },
    });

    await recordAudit(tx, {
      actor,
      meta,
      now,
      action: "REVOKE_GRANT",
      business,
      entityType: "SubscriptionPayment",
      entityId: payment.id,
      summary:
        `Revocó la activación ${payment.reference} (plan ${getPlan(payment.plan).name}` +
        (payment.grantDays ? ", " + daysLabel(payment.grantDays) : "") +
        `): ${input.note}`,
      detail: {
        reference: payment.reference,
        note: input.note,
        grantedAt: payment.createdAt.toISOString(),
        // Cómo estaba la suscripción al revocar (lo que se deshizo).
        replaced: takeGrantSnapshot(row),
        // true: el propietario canceló o reanudó después de la activación y se respetó su decisión.
        keptOwnerCancellation: restore.keptOwnerCancellation,
        notifyOwner: input.notifyOwner,
      },
    });
    return { updated, payment };
  }, TX_OPTIONS);

  const subscription = summarizeSubscription(updated, now);
  const accessUntil = subscription.endsAt ? " hasta el " + formatDate(subscription.endsAt) : "";
  const ownerNotified =
    input.notifyOwner &&
    (await notifyOwner(db, business.id, {
      subject: "Actualizamos tu suscripción",
      title: "Actualizamos tu suscripción",
      paragraphs: [
        `Anulamos la activación del plan ${getPlan(payment.plan).name} de ${business.name} registrada el ${formatDate(payment.createdAt)} (referencia ${payment.reference}).`,
        subscription.phase === "READ_ONLY"
          ? "Tu cuenta quedó en solo lectura: puedes consultar tu historial y exportar tus datos, pero no registrar ventas hasta que actives un plan. No se borra nada."
          : `Tu acceso sigue vigente${accessUntil} con el plan ${getPlan(subscription.plan).name}.`,
        "Si crees que es un error, escríbenos.",
      ],
      ctaLabel: "Ver mi suscripción",
    }));

  return {
    businessId: business.id,
    subscription,
    periodStart: updated.currentPeriodStart,
    periodEnd: subscription.endsAt,
    ownerNotified,
  };
}

// ─── Marcar un pago como revisado ────────────────────────────────────────────

export async function resolvePaymentReview(
  db: PrismaClient,
  actor: PlatformActor,
  meta: RequestMeta,
  input: ResolvePaymentReviewInput,
  now = new Date(),
): Promise<{ paymentId: string }> {
  const payment = await db.subscriptionPayment.findUnique({
    where: { id: input.paymentId },
    select: {
      id: true,
      reference: true,
      status: true,
      statusMessage: true,
      business: { select: { id: true, name: true } },
    },
  });
  if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Pago no encontrado." });

  await db.$transaction(async (tx) => {
    // Condicional: si dos administradores lo resuelven a la vez, solo uno queda en la bitácora.
    const resolved = await tx.subscriptionPayment.updateMany({
      where: { id: payment.id, needsReview: true },
      data: { needsReview: false },
    });
    if (resolved.count === 0) {
      throw new TRPCError({ code: "CONFLICT", message: "Este pago no está pendiente de revisión." });
    }
    await recordAudit(tx, {
      actor,
      meta,
      now,
      action: "RESOLVE_PAYMENT_REVIEW",
      business: payment.business,
      entityType: "SubscriptionPayment",
      entityId: payment.id,
      summary: `Marcó como revisado el pago ${payment.reference}: ${input.note}`,
      detail: {
        reference: payment.reference,
        note: input.note,
        status: payment.status,
        statusMessage: payment.statusMessage,
      },
    });
  }, TX_OPTIONS);

  return { paymentId: payment.id };
}
