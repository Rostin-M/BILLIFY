import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { businessProcedure, createTRPCRouter, ownerProcedure } from "~/server/api/trpc";
import { assertCashRegisterNotStale } from "~/server/lib/cashRegisterGuard";

// Entradas suman al saldo, salidas restan; cualquier otro tipo de movimiento no afecta el saldo.
function signedMovementAmount(m: { type: string; amount: number }): number {
  if (m.type === "INCOME") return m.amount;
  if (m.type === "EXPENSE") return -m.amount;
  return 0;
}

/**
 * Ventas anuladas, ventas a crédito y abonos registrados dentro de la jornada
 * de una caja — para el reporte de cierre y la vista en curso, así el dueño
 * tiene control de quién hizo qué durante el día, no solo los totales.
 */
async function getRegisterActivity(db: Prisma.TransactionClient, businessId: string, from: Date, to: Date) {
  const [voidedSalesRaw, creditSales, payments] = await Promise.all([
    db.sale.findMany({
      where: { businessId, status: "VOIDED", voidedAt: { gte: from, lte: to } },
      select: {
        id: true, invoiceNumber: true, total: true, voidReason: true, voidedAt: true,
        user: { select: { name: true } },
      },
      orderBy: { voidedAt: "asc" },
    }),
    db.sale.findMany({
      where: { businessId, paymentMethod: "CREDIT", status: "COMPLETED", createdAt: { gte: from, lte: to } },
      select: {
        id: true, invoiceNumber: true, total: true, createdAt: true,
        customer: { select: { name: true } },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.customerPayment.findMany({
      where: { businessId, createdAt: { gte: from, lte: to } },
      select: {
        id: true, amount: true, createdAt: true,
        customer: { select: { name: true } },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const voidedIds = voidedSalesRaw.map((s) => s.id);
  const voidAuditLogs = voidedIds.length
    ? await db.auditLog.findMany({
        where: { businessId, action: "VOID_SALE", entityId: { in: voidedIds } },
        select: { entityId: true, user: { select: { name: true } } },
      })
    : [];
  const voidedByMap = new Map(voidAuditLogs.map((a) => [a.entityId, a.user?.name ?? null]));

  const voidedSales = voidedSalesRaw.map((s) => ({
    id: s.id,
    invoiceNumber: s.invoiceNumber,
    total: s.total,
    voidReason: s.voidReason,
    voidedAt: s.voidedAt!,
    createdByName: s.user?.name ?? null,
    voidedByName: voidedByMap.get(s.id) ?? null,
  }));

  return { voidedSales, creditSales, payments };
}

export const cashRegisterRouter = createTRPCRouter({
  // Caja activa del negocio con saldo calculado en tiempo real
  getActive: businessProcedure.query(async ({ ctx }) => {
    const { businessId, id: userId, role } = ctx.session.user;

    // Verificar permiso de caja para cajeros
    if (role !== "OWNER") {
      const userData = await ctx.db.user.findFirst({
        where: { id: userId },
        select: { canManageCash: true },
      });
      if (!userData?.canManageCash) {
        return { noCashAccess: true as const };
      }
    }

    const selectFields = {
      id: true,
      userId: true,
      openingBalance: true,
      openedAt: true,
      user: { select: { name: true } },
      movements: {
        select: {
          id: true,
          type: true,
          amount: true,
          description: true,
          createdAt: true,
          user: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" as const },
      },
    };

    // Propia caja primero; si no tiene la suya, ve cualquier caja abierta del negocio
    let register = await ctx.db.cashRegister.findFirst({
      where: { businessId, userId, status: "OPEN" },
      select: selectFields,
    });

    register ??= await ctx.db.cashRegister.findFirst({
      where: { businessId, status: "OPEN" },
      select: selectFields,
    });

    if (!register) return null;

    const [cashSalesAgg, nonCashGroups] = await Promise.all([
      ctx.db.sale.aggregate({
        where: { businessId, paymentMethod: "CASH", status: "COMPLETED", createdAt: { gte: register.openedAt } },
        _sum: { total: true },
        _count: true,
      }),
      ctx.db.sale.groupBy({
        by: ["paymentMethod"],
        where: { businessId, paymentMethod: { not: "CASH" }, status: "COMPLETED", createdAt: { gte: register.openedAt } },
        _sum: { total: true },
        _count: { _all: true },
      }),
    ]);

    const cashSalesTotal = cashSalesAgg._sum.total ?? 0;
    const cashSalesCount = cashSalesAgg._count;
    const nonCashSales = nonCashGroups.map((g) => ({
      paymentMethod: g.paymentMethod,
      total: g._sum.total ?? 0,
      count: g._count._all,
    }));

    const manualIncome = register.movements
      .filter((m) => m.type === "INCOME")
      .reduce((sum, m) => sum + m.amount, 0);
    const manualExpense = register.movements
      .filter((m) => m.type === "EXPENSE")
      .reduce((sum, m) => sum + m.amount, 0);
    const manualBalance = manualIncome - manualExpense;
    const currentBalance = register.openingBalance + cashSalesTotal + manualBalance;

    return {
      id: register.id,
      openingBalance: register.openingBalance,
      openedAt: register.openedAt,
      user: register.user,
      movements: register.movements,
      cashSalesTotal,
      cashSalesCount,
      nonCashSales,
      manualIncome,
      manualExpense,
      manualBalance,
      currentBalance,
      isOwnRegister: register.userId === userId,
    };
  }),

  // Abrir caja — respeta maxCashRegisters y una caja por usuario
  open: businessProcedure
    .input(
      z.object({
        openingBalance: z
          .number()
          .min(0, "El fondo inicial no puede ser negativo"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId, role } = ctx.session.user;

      if (role !== "OWNER") {
        const userData = await ctx.db.user.findFirst({
          where: { id: userId },
          select: { canManageCash: true },
        });
        if (!userData?.canManageCash) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No tienes permisos para gestionar la caja." });
        }
      }

      const ownRegister = await ctx.db.cashRegister.findFirst({
        where: { businessId, userId, status: "OPEN" },
        select: { id: true },
      });

      if (ownRegister) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Ya tienes una caja abierta.",
        });
      }

      const [openCount, business] = await Promise.all([
        ctx.db.cashRegister.count({ where: { businessId, status: "OPEN" } }),
        ctx.db.business.findUnique({ where: { id: businessId }, select: { maxCashRegisters: true } }),
      ]);

      const max = business?.maxCashRegisters ?? 1;
      if (openCount >= max) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Se alcanzó el límite de ${max} caja${max > 1 ? "s" : ""} abiertas simultáneamente.`,
        });
      }

      const register = await ctx.db.$transaction(async (tx) => {
        const newRegister = await tx.cashRegister.create({
          data: { businessId, userId, openingBalance: input.openingBalance },
          select: { id: true, openedAt: true },
        });

        // Movimiento inicial como registro del fondo
        await tx.cashMovement.create({
          data: {
            cashRegisterId: newRegister.id,
            businessId,
            userId,
            type: "OPENING",
            amount: input.openingBalance,
            description: "Fondo inicial de caja",
          },
        });

        await tx.auditLog.create({
          data: {
            businessId,
            userId,
            action: "OPEN_CASH_REGISTER",
            entityType: "CashRegister",
            entityId: newRegister.id,
            detail: { openingBalance: input.openingBalance },
          },
        });

        return newRegister;
      });

      return { id: register.id, message: "Caja abierta correctamente." };
    }),

  // Registrar movimiento manual (entrada o salida) durante la jornada
  addMovement: businessProcedure
    .input(
      z.object({
        type: z.enum(["INCOME", "EXPENSE"]),
        amount: z.number().positive("El monto debe ser mayor a cero"),
        description: z
          .string()
          .trim()
          .min(3, "La descripción es obligatoria (mín. 3 caracteres)"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId, role } = ctx.session.user;

      if (role !== "OWNER") {
        const userData = await ctx.db.user.findFirst({
          where: { id: userId },
          select: { canManageCash: true },
        });
        if (!userData?.canManageCash) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No tienes permisos para registrar movimientos en caja." });
        }
      }

      await assertCashRegisterNotStale(ctx.db, businessId, userId);

      const registerSelect = {
        id: true,
        openingBalance: true,
        openedAt: true,
        movements: { select: { type: true, amount: true } },
      };

      let register = await ctx.db.cashRegister.findFirst({
        where: { businessId, userId, status: "OPEN" },
        select: registerSelect,
      });

      // Puede usar cualquier caja abierta del negocio si no tiene la propia
      register ??= await ctx.db.cashRegister.findFirst({
        where: { businessId, status: "OPEN" },
        select: registerSelect,
      });

      if (!register) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No hay caja abierta. Abre la caja primero.",
        });
      }

      if (input.type === "EXPENSE") {
        const cashSalesAgg = await ctx.db.sale.aggregate({
          where: {
            businessId,
            paymentMethod: "CASH",
            status: "COMPLETED",
            createdAt: { gte: register.openedAt },
          },
          _sum: { total: true },
        });
        const cashSalesTotal = cashSalesAgg._sum.total ?? 0;
        const manualBalance = register.movements.reduce(
          (sum, m) => sum + signedMovementAmount(m),
          0,
        );
        const currentBalance = register.openingBalance + cashSalesTotal + manualBalance;

        if (input.amount > currentBalance) {
          const fmt = (v: number) =>
            v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Saldo insuficiente (${fmt(currentBalance)} disponible). Registra una entrada primero y luego la salida.`,
          });
        }
      }

      await ctx.db.cashMovement.create({
        data: {
          cashRegisterId: register.id,
          businessId,
          userId,
          type: input.type,
          amount: input.amount,
          description: input.description,
        },
      });

      return {
        message:
          input.type === "INCOME"
            ? "Entrada registrada correctamente."
            : "Salida registrada correctamente.",
      };
    }),

  // Cerrar caja — el owner puede cerrar cualquier caja; el cajero solo la propia
  close: businessProcedure
    .input(
      z.object({
        registerId: z.string().optional(),
        closingNote: z.string().trim().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId, role } = ctx.session.user;

      // Solo el owner puede cerrar la caja de otro empleado por ID
      if (input.registerId && role !== "OWNER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Solo el propietario puede cerrar la caja de otro empleado.",
        });
      }

      // Bloquear cierre si hay mesas con cuentas pendientes
      const openTablesCount = await ctx.db.tableSession.count({
        where: {
          businessId,
          status: "OPEN",
          guests: { some: { orders: { some: {} } } },
        },
      });

      if (openTablesCount > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Hay ${openTablesCount} mesa${openTablesCount > 1 ? "s" : ""} con cuentas pendientes. Ciérralas o cóbralas antes de cerrar la caja.`,
        });
      }

      let register;
      if (input.registerId) {
        register = await ctx.db.cashRegister.findFirst({
          where: { id: input.registerId, businessId, status: "OPEN" },
          select: {
            id: true,
            openedAt: true,
            openingBalance: true,
            movements: { select: { type: true, amount: true } },
          },
        });
      } else {
        // Buscar propia caja primero; si el owner no tiene la suya, cerrar la activa del negocio
        register = await ctx.db.cashRegister.findFirst({
          where: { businessId, userId, status: "OPEN" },
          select: {
            id: true,
            openedAt: true,
            openingBalance: true,
            movements: { select: { type: true, amount: true } },
          },
        });
        if (!register && role === "OWNER") {
          register = await ctx.db.cashRegister.findFirst({
            where: { businessId, status: "OPEN" },
            select: {
              id: true,
              openedAt: true,
              openingBalance: true,
              movements: { select: { type: true, amount: true } },
            },
          });
        }
      }

      if (!register) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No se encontró la caja a cerrar.",
        });
      }

      const cashSalesAgg = await ctx.db.sale.aggregate({
        where: {
          businessId,
          paymentMethod: "CASH",
          status: "COMPLETED",
          createdAt: { gte: register.openedAt },
        },
        _sum: { total: true },
        _count: true,
      });

      const cashSalesTotal = cashSalesAgg._sum.total ?? 0;
      const cashSalesCount = cashSalesAgg._count;

      const manualBalance = register.movements.reduce(
        (sum, m) => sum + signedMovementAmount(m),
        0,
      );

      const closingBalance = register.openingBalance + cashSalesTotal + manualBalance;

      await ctx.db.$transaction(async (tx) => {
        await tx.cashRegister.update({
          where: { id: register.id },
          data: {
            status: "CLOSED",
            closedAt: new Date(),
            closingBalance,
            closingNote: input.closingNote ?? null,
          },
        });

        await tx.auditLog.create({
          data: {
            businessId,
            userId,
            action: "CLOSE_CASH_REGISTER",
            entityType: "CashRegister",
            entityId: register.id,
            detail: {
              openingBalance: register.openingBalance,
              closingBalance,
              cashSalesTotal,
              cashSalesCount,
              manualBalance,
              closingNote: input.closingNote ?? null,
            },
          },
        });
      });

      return {
        closingBalance,
        message: "Caja cerrada correctamente.",
      };
    }),

  // Cajas abiertas de otros usuarios — solo OWNER
  listActive: ownerProcedure.query(async ({ ctx }) => {
    const { businessId, id: userId } = ctx.session.user;

    const registers = await ctx.db.cashRegister.findMany({
      where: { businessId, status: "OPEN", userId: { not: userId } },
      select: {
        id: true,
        openingBalance: true,
        openedAt: true,
        user: { select: { name: true } },
        movements: { select: { type: true, amount: true } },
      },
      orderBy: { openedAt: "asc" },
    });

    return registers.map((r) => {
      const manualIncome = r.movements.filter((m) => m.type === "INCOME").reduce((s, m) => s + m.amount, 0);
      const manualExpense = r.movements.filter((m) => m.type === "EXPENSE").reduce((s, m) => s + m.amount, 0);
      return {
        id: r.id,
        openingBalance: r.openingBalance,
        openedAt: r.openedAt,
        user: r.user,
        manualIncome,
        manualExpense,
        movementsBalance: r.openingBalance + manualIncome - manualExpense,
      };
    });
  }),

  // Reporte completo de una caja (para PDF)
  getReport: businessProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;

      const register = await ctx.db.cashRegister.findFirst({
        where: { id: input.id, businessId },
        select: {
          id: true,
          openingBalance: true,
          closingBalance: true,
          closingNote: true,
          openedAt: true,
          closedAt: true,
          status: true,
          user: { select: { name: true } },
          movements: {
            select: {
              id: true, type: true, amount: true, description: true, createdAt: true,
              user: { select: { name: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!register) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Caja no encontrada." });
      }

      const periodEnd = register.closedAt ?? new Date();
      const [cashSalesAgg, nonCashGroups, activity] = await Promise.all([
        ctx.db.sale.aggregate({
          where: { businessId, paymentMethod: "CASH", status: "COMPLETED", createdAt: { gte: register.openedAt, lte: periodEnd } },
          _sum: { total: true },
          _count: true,
        }),
        ctx.db.sale.groupBy({
          by: ["paymentMethod"],
          where: { businessId, paymentMethod: { not: "CASH" }, status: "COMPLETED", createdAt: { gte: register.openedAt, lte: periodEnd } },
          _sum: { total: true },
          _count: { _all: true },
        }),
        getRegisterActivity(ctx.db, businessId, register.openedAt, periodEnd),
      ]);

      const cashSalesTotal = cashSalesAgg._sum.total ?? 0;
      const cashSalesCount = cashSalesAgg._count;
      const nonCashSales = nonCashGroups.map((g) => ({
        paymentMethod: g.paymentMethod,
        total: g._sum.total ?? 0,
        count: g._count._all,
      }));

      const manualIncome = register.movements
        .filter((m) => m.type === "INCOME")
        .reduce((s, m) => s + m.amount, 0);
      const manualExpense = register.movements
        .filter((m) => m.type === "EXPENSE")
        .reduce((s, m) => s + m.amount, 0);
      const totalBalance = register.openingBalance + cashSalesTotal + manualIncome - manualExpense;

      return {
        ...register,
        cashSalesTotal,
        cashSalesCount,
        nonCashSales,
        manualIncome,
        manualExpense,
        totalBalance,
        ...activity,
      };
    }),

  // Historial de cierres — solo OWNER
  listHistory: ownerProcedure.query(async ({ ctx }) => {
    return ctx.db.cashRegister.findMany({
      where: { businessId: ctx.session.user.businessId, status: "CLOSED" },
      select: {
        id: true,
        openingBalance: true,
        closingBalance: true,
        closingNote: true,
        openedAt: true,
        closedAt: true,
        user: { select: { name: true } },
        _count: { select: { movements: true } },
      },
      orderBy: { closedAt: "desc" },
      take: 30,
    });
  }),
});
