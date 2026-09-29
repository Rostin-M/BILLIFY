import { randomUUID } from "node:crypto";

import type { Prisma, UserRole } from "@prisma/client";
import type { Session } from "next-auth";

import { createCaller } from "~/server/api/root";
import { db } from "~/server/db";

export { db };

/** Vacía todas las tablas (menos el historial de migraciones) entre tests. */
export async function resetDatabase(): Promise<void> {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export async function createBusiness(data: Partial<Prisma.BusinessUncheckedCreateInput> = {}) {
  return db.business.create({
    data: { name: "Tienda Prueba", document: `900${unique()}`, ...data },
  });
}

export async function createUser(
  data: Partial<Prisma.UserUncheckedCreateInput> & { businessId: string | null; role?: UserRole },
) {
  return db.user.create({
    data: {
      name: data.role === "CASHIER" ? "Cajero Prueba" : "Dueño Prueba",
      email: `user-${unique()}@billify.test`,
      isActive: true,
      ...data,
    },
  });
}

export async function createProduct(businessId: string, data: Partial<Prisma.ProductUncheckedCreateInput> = {}) {
  return db.product.create({
    data: { businessId, name: `Producto ${unique()}`, price: 1000, stock: 10, ...data },
  });
}

export async function createCustomer(businessId: string, data: Partial<Prisma.CustomerUncheckedCreateInput> = {}) {
  return db.customer.create({
    data: { businessId, name: `Cliente ${unique()}`, ...data },
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fija la suscripción de un negocio. Por defecto: plan Pro pagado y vigente 30 días.
 * Sin suscripción, el guard crea la prueba gratis (plan Negocio) en la primera petición.
 */
export async function setSubscription(
  businessId: string,
  data: Partial<Prisma.SubscriptionUncheckedCreateInput> = {},
) {
  const now = Date.now();
  const values = {
    plan: "PRO" as const,
    billingCycle: "MONTHLY" as const,
    status: "ACTIVE" as const,
    trialEndsAt: new Date(now - 30 * DAY_MS),
    currentPeriodStart: new Date(now - DAY_MS),
    currentPeriodEnd: new Date(now + 30 * DAY_MS),
    ...data,
  };
  return db.subscription.upsert({
    where: { businessId },
    create: { businessId, ...values },
    update: values,
  });
}

/** Negocio con su dueño y un cajero, listo para la mayoría de los tests. */
export async function createShop(businessData: Partial<Prisma.BusinessUncheckedCreateInput> = {}) {
  const business = await createBusiness(businessData);
  const owner = await createUser({ businessId: business.id, role: "OWNER" });
  const cashier = await createUser({ businessId: business.id, role: "CASHIER" });
  return { business, owner, cashier };
}

type SessionUserLike = { id: string; sessionVersion?: number };

/** Caller de tRPC con la sesión de `user` (o anónimo si es null), como lo haría una petición real. */
export function callerFor(user: SessionUserLike | null, opts: { ip?: string; loginAt?: number } = {}) {
  const session = user
    ? ({
        user: {
          id: user.id,
          loginAt: opts.loginAt ?? Date.now(),
          sessionVersion: user.sessionVersion ?? 0,
        },
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      } as unknown as Session)
    : null;

  return createCaller({
    db,
    session,
    ip: opts.ip ?? "127.0.0.1",
    userAgent: "vitest",
    headers: new Headers(),
  });
}

export const newKey = () => randomUUID();
