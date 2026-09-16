import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { businessProcedure, createTRPCRouter, ownerProcedure } from "~/server/api/trpc";

const customerSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio"),
  alias: z.string().trim().optional(),
  document: z.string().trim().optional(),
  email: z.string().trim().email("El correo no es válido. Ej: nombre@dominio.com").optional().or(z.literal("")),
  phone: z.string().trim().optional(),
});

export const customerRouter = createTRPCRouter({
  // Búsqueda rápida para el POS — ambos roles
  search: businessProcedure
    .input(z.object({ q: z.string().trim().default("") }))
    .query(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;

      return ctx.db.customer.findMany({
        where: {
          businessId,
          isActive: true,
          ...(input.q
            ? {
                OR: [
                  { name: { contains: input.q, mode: "insensitive" } },
                  { document: { contains: input.q, mode: "insensitive" } },
                  { phone: { contains: input.q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        select: { id: true, name: true, alias: true, document: true, phone: true, email: true },
        orderBy: { name: "asc" },
        take: 10,
      });
    }),

  // Lista completa para la página de gestión — solo OWNER
  list: ownerProcedure.query(async ({ ctx }) => {
    const { businessId } = ctx.session.user;

    const [customers, creditTotals, paidTotals] = await Promise.all([
      ctx.db.customer.findMany({
        where: { businessId },
        select: {
          id: true,
          name: true,
          alias: true,
          document: true,
          email: true,
          phone: true,
          isActive: true,
          createdAt: true,
          _count: { select: { sales: true } },
        },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
      }),
      ctx.db.sale.groupBy({
        by: ["customerId"],
        where: { businessId, paymentMethod: "CREDIT", status: "COMPLETED", customerId: { not: null } },
        _sum: { total: true },
      }),
      ctx.db.customerPayment.groupBy({
        by: ["customerId"],
        where: { businessId },
        _sum: { amount: true },
      }),
    ]);

    const creditMap = new Map(creditTotals.map((c) => [c.customerId, c._sum.total ?? 0]));
    const paidMap = new Map(paidTotals.map((p) => [p.customerId, p._sum.amount ?? 0]));

    return customers.map((c) => ({
      ...c,
      debt: (creditMap.get(c.id) ?? 0) - (paidMap.get(c.id) ?? 0),
    }));
  }),

  // Crear cliente — ambos roles (cajero puede crear al vuelo en la venta)
  create: businessProcedure.input(customerSchema).mutation(async ({ ctx, input }) => {
    const { businessId, id: userId } = ctx.session.user;

    const customer = await ctx.db.customer.create({
      data: {
        businessId,
        name: input.name,
        alias: input.alias ?? null,
        document: input.document ?? null,
        email: input.email?.length ? input.email : null,
        phone: input.phone ?? null,
      },
      select: { id: true, name: true },
    });

    await ctx.db.auditLog.create({
      data: {
        businessId,
        userId,
        action: "CREATE_CUSTOMER",
        entityType: "Customer",
        entityId: customer.id,
        detail: { name: input.name },
      },
    });

    return { id: customer.id, name: customer.name, message: "Cliente creado correctamente." };
  }),

  // Editar cliente — solo OWNER
  update: ownerProcedure
    .input(customerSchema.extend({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;

      const existing = await ctx.db.customer.findFirst({
        where: { id: input.id, businessId },
        select: { id: true },
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado en este negocio." });
      }

      await ctx.db.customer.update({
        where: { id: input.id },
        data: {
          name: input.name,
          alias: input.alias ?? null,
          document: input.document ?? null,
          email: input.email?.length ? input.email : null,
          phone: input.phone ?? null,
        },
      });

      await ctx.db.auditLog.create({
        data: {
          businessId,
          userId,
          action: "UPDATE_CUSTOMER",
          entityType: "Customer",
          entityId: input.id,
          detail: { name: input.name },
        },
      });

      return { message: "Cliente actualizado correctamente." };
    }),

  // Activar / desactivar — solo OWNER
  setActive: ownerProcedure
    .input(z.object({ customerId: z.string().min(1), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;

      const customer = await ctx.db.customer.findFirst({
        where: { id: input.customerId, businessId },
        select: { id: true, name: true },
      });

      if (!customer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado en este negocio." });
      }

      await ctx.db.customer.update({
        where: { id: input.customerId },
        data: { isActive: input.isActive },
      });

      await ctx.db.auditLog.create({
        data: {
          businessId,
          userId,
          action: input.isActive ? "ACTIVATE_CUSTOMER" : "DEACTIVATE_CUSTOMER",
          entityType: "Customer",
          entityId: input.customerId,
          detail: { name: customer.name },
        },
      });

      return {
        message: input.isActive ? "Cliente activado correctamente." : "Cliente desactivado correctamente.",
      };
    }),

  // Historial de ventas por cliente — ambos roles
  history: businessProcedure
    .input(z.object({ customerId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;

      const customer = await ctx.db.customer.findFirst({
        where: { id: input.customerId, businessId },
        select: { id: true },
      });

      if (!customer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado en este negocio." });
      }

      const [sales, payments] = await Promise.all([
        ctx.db.sale.findMany({
          where: { customerId: input.customerId, status: "COMPLETED" },
          select: {
            id: true,
            invoiceNumber: true,
            saleType: true,
            total: true,
            paymentMethod: true,
            createdAt: true,
            items: { select: { name: true, quantity: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        ctx.db.customerPayment.findMany({
          where: { customerId: input.customerId },
          select: { id: true, amount: true, note: true, createdAt: true, user: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
      ]);

      const totalSpent = sales.reduce((sum, s) => sum + s.total, 0);
      const creditTotal = sales
        .filter((s) => s.paymentMethod === "CREDIT")
        .reduce((sum, s) => sum + s.total, 0);
      const paidTotal = payments.reduce((sum, p) => sum + p.amount, 0);
      const debt = creditTotal - paidTotal;

      return { sales, payments, totalSpent, creditTotal, paidTotal, debt };
    }),

  // Registrar abono o pago completo de la deuda — ambos roles
  addPayment: businessProcedure
    .input(
      z.object({
        customerId: z.string().min(1),
        amount: z.number().positive("El monto debe ser mayor a cero"),
        note: z.string().trim().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;

      const customer = await ctx.db.customer.findFirst({
        where: { id: input.customerId, businessId },
        select: { id: true, name: true },
      });

      if (!customer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado en este negocio." });
      }

      const [creditTotal, paidTotal] = await Promise.all([
        ctx.db.sale.aggregate({
          where: { businessId, customerId: input.customerId, paymentMethod: "CREDIT", status: "COMPLETED" },
          _sum: { total: true },
        }),
        ctx.db.customerPayment.aggregate({
          where: { businessId, customerId: input.customerId },
          _sum: { amount: true },
        }),
      ]);

      const currentDebt = (creditTotal._sum.total ?? 0) - (paidTotal._sum.amount ?? 0);

      if (currentDebt <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este cliente no tiene deuda pendiente." });
      }
      if (input.amount > currentDebt + 0.01) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `El abono no puede ser mayor a la deuda actual (${currentDebt.toFixed(0)}).`,
        });
      }

      const payment = await ctx.db.customerPayment.create({
        data: {
          businessId,
          customerId: input.customerId,
          userId,
          amount: input.amount,
          note: input.note ?? null,
        },
        select: { id: true },
      });

      await ctx.db.auditLog.create({
        data: {
          businessId,
          userId,
          action: "CREATE_CUSTOMER_PAYMENT",
          entityType: "CustomerPayment",
          entityId: payment.id,
          detail: { customerName: customer.name, amount: input.amount },
        },
      });

      const remainingDebt = currentDebt - input.amount;

      return {
        remainingDebt,
        message:
          remainingDebt <= 0.01
            ? `Deuda de ${customer.name} saldada por completo.`
            : `Abono registrado. Deuda restante: ${remainingDebt.toFixed(0)}.`,
      };
    }),
});
