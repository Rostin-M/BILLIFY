import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { businessProcedure, createTRPCRouter, ownerProcedure } from "~/server/api/trpc";

const supplierSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio (mín. 2 caracteres)").max(120),
  document: z.string().trim().max(30).optional(),
  phone: z.string().trim().max(30).optional(),
  contactName: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
});

const orNull = (value: string | undefined) => (value?.length ? value : null);

type SupplierStats = { supplierId: string; purchaseCount: number; lastPurchaseAt: Date | null; balance: number };

export const supplierRouter = createTRPCRouter({
  // Proveedores activos con lo que se les debe y su última compra (los de saldo pendiente primero).
  list: businessProcedure.query(async ({ ctx }) => {
    const { businessId } = ctx.session.user;

    const [suppliers, stats] = await Promise.all([
      ctx.db.supplier.findMany({
        where: { businessId, isActive: true },
        select: { id: true, name: true, document: true, phone: true, contactName: true, note: true },
        orderBy: { name: "asc" },
      }),
      ctx.db.$queryRaw<SupplierStats[]>`
        SELECT p."supplier_id" AS "supplierId",
               COUNT(*)::int AS "purchaseCount",
               MAX(p."created_at") AS "lastPurchaseAt",
               COALESCE(SUM(p."total" - COALESCE(pay."paid", 0)), 0)::float AS "balance"
          FROM "purchases" p
          LEFT JOIN (
            SELECT "purchase_id", SUM("amount") AS "paid" FROM "supplier_payments" GROUP BY "purchase_id"
          ) pay ON pay."purchase_id" = p."id"
         WHERE p."business_id" = ${businessId} AND p."supplier_id" IS NOT NULL
         GROUP BY p."supplier_id"
      `,
    ]);

    const statsMap = new Map(stats.map((s) => [s.supplierId, s]));
    return suppliers.map((s) => {
      const st = statsMap.get(s.id);
      return {
        ...s,
        purchaseCount: st?.purchaseCount ?? 0,
        lastPurchaseAt: st?.lastPurchaseAt ?? null,
        balance: Math.max(st?.balance ?? 0, 0),
      };
    });
  }),

  // Ambos roles: el cajero recibe los pedidos y puede crear al proveedor al vuelo.
  create: businessProcedure.input(supplierSchema).mutation(async ({ ctx, input }) => {
    const { businessId, id: userId } = ctx.session.user;

    const existing = await ctx.db.supplier.findFirst({
      where: { businessId, name: { equals: input.name, mode: "insensitive" } },
      select: { id: true, name: true, isActive: true },
    });
    if (existing?.isActive) {
      throw new TRPCError({ code: "CONFLICT", message: `Ya tienes un proveedor llamado "${existing.name}".` });
    }

    // Uno archivado con el mismo nombre se reactiva en lugar de duplicarlo (conserva su historial).
    const data = {
      name: input.name,
      document: orNull(input.document),
      phone: orNull(input.phone),
      contactName: orNull(input.contactName),
      note: orNull(input.note),
    };
    const supplier = existing
      ? await ctx.db.supplier.update({ where: { id: existing.id }, data: { ...data, isActive: true }, select: { id: true, name: true } })
      : await ctx.db.supplier.create({ data: { businessId, ...data }, select: { id: true, name: true } });

    await ctx.db.auditLog.create({
      data: { businessId, userId, action: "CREATE_SUPPLIER", entityType: "Supplier", entityId: supplier.id, detail: { name: supplier.name } },
    });
    return { ...supplier, message: "Proveedor guardado." };
  }),

  update: ownerProcedure
    .input(supplierSchema.extend({ id: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;
      const supplier = await ctx.db.supplier.findFirst({ where: { id: input.id, businessId }, select: { id: true } });
      if (!supplier) throw new TRPCError({ code: "NOT_FOUND", message: "Proveedor no encontrado." });

      const duplicate = await ctx.db.supplier.findFirst({
        where: { businessId, id: { not: supplier.id }, isActive: true, name: { equals: input.name, mode: "insensitive" } },
        select: { name: true },
      });
      if (duplicate) {
        throw new TRPCError({ code: "CONFLICT", message: `Ya tienes un proveedor llamado "${duplicate.name}".` });
      }

      await ctx.db.supplier.update({
        where: { id: supplier.id },
        data: {
          name: input.name,
          document: orNull(input.document),
          phone: orNull(input.phone),
          contactName: orNull(input.contactName),
          note: orNull(input.note),
        },
      });
      return { message: "Proveedor actualizado." };
    }),

  // Archivar: deja de salir en las listas, su historial se conserva.
  setActive: ownerProcedure
    .input(z.object({ id: z.string().min(1).max(64), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;
      const { count } = await ctx.db.supplier.updateMany({
        where: { id: input.id, businessId },
        data: { isActive: input.isActive },
      });
      if (count !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "Proveedor no encontrado." });
      return { message: input.isActive ? "Proveedor reactivado." : "Proveedor archivado." };
    }),

  // Compras y salidas de caja a un proveedor, de la más reciente a la más antigua.
  history: businessProcedure
    .input(z.object({ supplierId: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;
      const supplier = await ctx.db.supplier.findFirst({
        where: { id: input.supplierId, businessId },
        select: { id: true, name: true },
      });
      if (!supplier) throw new TRPCError({ code: "NOT_FOUND", message: "Proveedor no encontrado." });

      const [purchases, movements] = await Promise.all([
        ctx.db.purchase.findMany({
          where: { businessId, supplierId: supplier.id },
          select: {
            id: true, total: true, note: true, dueDate: true, createdAt: true,
            user: { select: { name: true } },
            items: { select: { name: true, quantity: true, unitCost: true, subtotal: true } },
            payments: { select: { amount: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        // Salidas de caja sueltas (no son el pago de una compra registrada).
        ctx.db.cashMovement.findMany({
          where: { businessId, supplierId: supplier.id, supplierPayment: null },
          select: { id: true, amount: true, description: true, note: true, createdAt: true, user: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
      ]);

      return {
        supplier,
        purchases: purchases.map(({ payments, ...p }) => {
          const paid = payments.reduce((s, x) => s + x.amount, 0);
          return { ...p, paid, balance: Math.max(p.total - paid, 0) };
        }),
        movements,
      };
    }),
});
