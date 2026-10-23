import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { businessProcedure, createTRPCRouter, ownerProcedure } from "~/server/api/trpc";
import { assertCashRegisterNotStale } from "~/server/lib/cashRegisterGuard";
import { idempotencyKeySchema, isUniqueViolation, runIdempotent } from "~/server/lib/idempotency";
import { effectiveMaxCashRegisters } from "~/server/subscription/quotas";
import { cashDifference, isDenomination, sumBreakdown } from "~/lib/cash/denominations";

const MAX_MONEY = 1e9;

const fmtCOP = (v: number) =>
  v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });

/**
 * Cierre ciego: el cajero no ve cuánto efectivo "debería" haber hasta después de contarlo
 * (así no puede ajustar el conteo al número esperado). El dueño siempre lo ve.
 */
async function getCashCloseSettings(db: Prisma.TransactionClient, businessId: string, role: string) {
  const business = await db.business.findUnique({
    where: { id: businessId },
    select: { cashBlindClose: true, cashCountByDenomination: true },
  });
  return {
    blind: role !== "OWNER" && (business?.cashBlindClose ?? true),
    byDenomination: business?.cashCountByDenomination ?? false,
  };
}

// Arqueo por billetes y monedas: { "<denominación>": cantidad }.
const countedBreakdownSchema = z
  .record(z.string(), z.number().int("La cantidad debe ser un número entero").min(0).max(100_000))
  .refine((b) => Object.keys(b).every((k) => isDenomination(Number(k))), "Denominación no válida en el conteo.");

const cashCountSchema = {
  registerId: z.string().min(1).max(64).optional(),
  countedCash: z
    .number({ required_error: "Escribe cuánto efectivo contaste." })
    .finite()
    .min(0, "El efectivo contado no puede ser negativo")
    .max(MAX_MONEY, "Monto demasiado grande"),
  countedBreakdown: countedBreakdownSchema.optional(),
};

/** Valida el conteo contra la configuración del negocio y devuelve el arqueo limpio (sin ceros). */
async function resolveCount(
  db: Prisma.TransactionClient,
  businessId: string,
  role: string,
  input: { countedCash: number; countedBreakdown?: Record<string, number> },
) {
  const { byDenomination } = await getCashCloseSettings(db, businessId, role);
  if (byDenomination && !input.countedBreakdown) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Cuenta los billetes y monedas para cerrar la caja." });
  }
  if (!input.countedBreakdown) return { countedCash: input.countedCash, breakdown: null };

  const breakdown = Object.fromEntries(Object.entries(input.countedBreakdown).filter(([, n]) => n > 0));
  if (Math.round(sumBreakdown(breakdown)) !== Math.round(input.countedCash)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "El total no coincide con los billetes y monedas contados." });
  }
  return { countedCash: input.countedCash, breakdown };
}

// Bloquear el cierre (y el conteo previo) si hay mesas con cuentas pendientes.
async function assertNoPendingTables(db: Prisma.TransactionClient, businessId: string) {
  const openTablesCount = await db.tableSession.count({
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
}

/**
 * Caja que se va a cerrar: por id solo el dueño (caja de otro empleado); si no, la propia,
 * y el dueño sin caja propia cierra la activa del negocio.
 */
async function findRegisterToClose(
  db: Prisma.TransactionClient,
  user: { businessId: string; id: string; role: string },
  registerId?: string,
) {
  const { businessId, id: userId, role } = user;

  if (registerId && role !== "OWNER") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Solo el propietario puede cerrar la caja de otro empleado.",
    });
  }

  // El permiso de caja pudo haber sido retirado después de abrirla
  await assertCanManageCash(db, userId, role);
  await assertNoPendingTables(db, businessId);

  let register: { id: string } | null;
  if (registerId) {
    register = await db.cashRegister.findFirst({
      where: { id: registerId, businessId, status: "OPEN" },
      select: { id: true },
    });
  } else {
    register = await db.cashRegister.findFirst({
      where: { businessId, userId, status: "OPEN" },
      select: { id: true },
    });
    if (!register && role === "OWNER") {
      register = await db.cashRegister.findFirst({
        where: { businessId, status: "OPEN" },
        select: { id: true },
      });
    }
  }

  if (!register) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No se encontró la caja a cerrar.",
    });
  }
  return register.id;
}

// Los cajeros necesitan el permiso "gestionar caja" (leído fresco de la BD, no de la sesión).
async function assertCanManageCash(
  db: Prisma.TransactionClient,
  userId: string,
  role: string,
  message = "No tienes permisos para gestionar la caja.",
) {
  if (role === "OWNER") return;
  const userData = await db.user.findFirst({
    where: { id: userId },
    select: { canManageCash: true },
  });
  if (!userData?.canManageCash) {
    throw new TRPCError({ code: "FORBIDDEN", message });
  }
}

/**
 * Bloquea la fila de una caja abierta (SELECT ... FOR UPDATE) hasta el fin de la transacción.
 * Serializa movimientos y cierre sobre la misma caja: el saldo se calcula y se valida con
 * la caja bloqueada, así dos salidas simultáneas no pueden dejarla en negativo.
 */
async function lockOpenRegister(tx: Prisma.TransactionClient, registerId: string, businessId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "cash_registers"
     WHERE "id" = ${registerId} AND "business_id" = ${businessId} AND "status" = 'OPEN'
     FOR UPDATE
  `;
  return rows.length > 0;
}

/**
 * Ventas de UNA caja (Sale.cashRegisterId), no de todo el negocio: con varias cajas abiertas,
 * cada cajero solo ve y responde por el dinero que entró a la suya.
 */
async function getRegisterSales(db: Prisma.TransactionClient, businessId: string, registerId: string) {
  const [cashSalesAgg, nonCashGroups, cashPaymentsAgg, nonCashPaymentGroups] = await Promise.all([
    db.sale.aggregate({
      where: { businessId, cashRegisterId: registerId, paymentMethod: "CASH", status: "COMPLETED" },
      _sum: { total: true },
      _count: true,
    }),
    db.sale.groupBy({
      by: ["paymentMethod"],
      where: { businessId, cashRegisterId: registerId, paymentMethod: { not: "CASH" }, status: "COMPLETED" },
      _sum: { total: true },
      _count: { _all: true },
    }),
    // Abonos de fiado que entraron a esta caja: el efectivo suma al saldo; el resto es informativo.
    db.customerPayment.aggregate({
      where: { businessId, cashRegisterId: registerId, paymentMethod: "CASH" },
      _sum: { amount: true },
      _count: true,
    }),
    db.customerPayment.groupBy({
      by: ["paymentMethod"],
      where: { businessId, cashRegisterId: registerId, paymentMethod: { not: "CASH" } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);
  return {
    cashSalesTotal: cashSalesAgg._sum.total ?? 0,
    cashSalesCount: cashSalesAgg._count,
    nonCashSales: nonCashGroups.map((g) => ({
      paymentMethod: g.paymentMethod,
      total: g._sum.total ?? 0,
      count: g._count._all,
    })),
    cashPaymentsTotal: cashPaymentsAgg._sum.amount ?? 0,
    cashPaymentsCount: cashPaymentsAgg._count,
    nonCashPayments: nonCashPaymentGroups.map((g) => ({
      paymentMethod: g.paymentMethod,
      total: g._sum.amount ?? 0,
      count: g._count._all,
    })),
  };
}

// Saldo en efectivo de una caja: fondo + ventas y abonos en efectivo de esa caja + movimientos manuales.
async function computeRegisterBalance(
  db: Prisma.TransactionClient,
  businessId: string,
  registerId: string,
) {
  const register = await db.cashRegister.findFirst({
    where: { id: registerId, businessId },
    select: { openingBalance: true, movements: { select: { type: true, amount: true } } },
  });
  if (!register) {
    throw new TRPCError({ code: "NOT_FOUND", message: "No se encontró la caja." });
  }
  const { cashSalesTotal, cashSalesCount, cashPaymentsTotal } = await getRegisterSales(db, businessId, registerId);
  const manualBalance = register.movements.reduce((sum, m) => sum + signedMovementAmount(m), 0);
  return {
    openingBalance: register.openingBalance,
    cashSalesTotal,
    cashSalesCount,
    cashPaymentsTotal,
    manualBalance,
    balance: register.openingBalance + cashSalesTotal + cashPaymentsTotal + manualBalance,
  };
}

function movementMessage(type: string): string {
  return type === "INCOME" ? "Entrada registrada correctamente." : "Salida registrada correctamente.";
}

// Entradas suman al saldo, salidas restan; cualquier otro tipo de movimiento no afecta el saldo.
function signedMovementAmount(m: { type: string; amount: number }): number {
  if (m.type === "INCOME") return m.amount;
  if (m.type === "EXPENSE") return -m.amount;
  return 0;
}

/**
 * Ventas anuladas y ventas a crédito de una caja, y abonos registrados dentro de su
 * jornada — para el reporte de cierre y la vista en curso, así el dueño tiene control
 * de quién hizo qué durante el día, no solo los totales.
 * Los abonos (CustomerPayment) no están ligados a una caja: se listan los de todo el
 * negocio dentro de la ventana de la jornada (no suman al saldo de la caja).
 */
async function getRegisterActivity(
  db: Prisma.TransactionClient,
  businessId: string,
  registerId: string,
  from: Date,
  to: Date,
) {
  const [voidedSalesRaw, creditSales, payments] = await Promise.all([
    db.sale.findMany({
      where: { businessId, cashRegisterId: registerId, status: "VOIDED" },
      select: {
        id: true, invoiceNumber: true, total: true, voidReason: true, voidedAt: true,
        user: { select: { name: true } },
      },
      orderBy: { voidedAt: "asc" },
    }),
    db.sale.findMany({
      where: { businessId, cashRegisterId: registerId, paymentMethod: "CREDIT", status: "COMPLETED" },
      select: {
        id: true, invoiceNumber: true, total: true, createdAt: true,
        customer: { select: { name: true } },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.customerPayment.findMany({
      where: {
        businessId,
        OR: [{ cashRegisterId: registerId }, { cashRegisterId: null, createdAt: { gte: from, lte: to } }],
      },
      select: {
        id: true, amount: true, createdAt: true, paymentMethod: true, cashRegisterId: true,
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

export async function recordCashMovement(
  tx: Prisma.TransactionClient,
  params: {
    businessId: string;
    userId: string;
    role: string;
    type: "INCOME" | "EXPENSE";
    amount: number;
    description: string;
    note?: string | null;
    supplierId?: string | null;
    idempotencyKey?: string | null;
  },
): Promise<{ id: string }> {
  const { businessId, userId, role } = params;
  await assertCanManageCash(tx, userId, role, "No tienes permisos para registrar movimientos en caja.");
  await assertCashRegisterNotStale(tx, businessId, userId);

  let register = await tx.cashRegister.findFirst({
    where: { businessId, userId, status: "OPEN" },
    select: { id: true },
  });
  if (!register && role === "OWNER") {
    register = await tx.cashRegister.findFirst({
      where: { businessId, status: "OPEN" },
      select: { id: true },
    });
  }
  if (!register) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        role === "OWNER"
          ? "No hay caja abierta. Abre la caja primero."
          : "No tienes una caja abierta. Abre tu caja para registrar movimientos.",
    });
  }

  if (!(await lockOpenRegister(tx, register.id, businessId))) {
    throw new TRPCError({ code: "CONFLICT", message: "La caja ya fue cerrada." });
  }

  if (params.type === "EXPENSE") {
    const { balance } = await computeRegisterBalance(tx, businessId, register.id);
    if (params.amount > balance) {
      // En cierre ciego el cajero no debe enterarse del saldo por este mensaje.
      const { blind } = await getCashCloseSettings(tx, businessId, role);
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: blind
          ? "La salida es mayor al efectivo que debería haber en caja. Registra una entrada primero y luego la salida."
          : `Saldo insuficiente (${fmtCOP(balance)} disponible). Registra una entrada primero y luego la salida.`,
      });
    }
  }

  return tx.cashMovement.create({
    data: {
      cashRegisterId: register.id,
      businessId,
      userId,
      type: params.type,
      amount: params.amount,
      description: params.description,
      note: params.note ?? null,
      supplierId: params.supplierId ?? null,
      idempotencyKey: params.idempotencyKey ?? null,
    },
    select: { id: true },
  });
}

export const cashRegisterRouter = createTRPCRouter({
  // Caja activa del negocio con saldo calculado en tiempo real
  getActive: businessProcedure.query(async ({ ctx }) => {
    const { businessId, id: userId, role } = ctx.session.user;

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
          note: true,
          createdAt: true,
          user: { select: { name: true } },
          supplier: { select: { name: true } },
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

    const { cashSalesTotal, cashSalesCount, nonCashSales, cashPaymentsTotal, cashPaymentsCount, nonCashPayments } =
      await getRegisterSales(ctx.db, businessId, register.id);

    const manualIncome = register.movements
      .filter((m) => m.type === "INCOME")
      .reduce((sum, m) => sum + m.amount, 0);
    const manualExpense = register.movements
      .filter((m) => m.type === "EXPENSE")
      .reduce((sum, m) => sum + m.amount, 0);
    const manualBalance = manualIncome - manualExpense;
    const currentBalance = register.openingBalance + cashSalesTotal + cashPaymentsTotal + manualBalance;
    const closeSettings = await getCashCloseSettings(ctx.db, businessId, role);

    return {
      id: register.id,
      openingBalance: register.openingBalance,
      openedAt: register.openedAt,
      user: register.user,
      movements: register.movements,
      // Cierre ciego: el cajero no recibe el efectivo esperado (ni las ventas en efectivo, que lo delatan).
      cashSalesTotal: closeSettings.blind ? null : cashSalesTotal,
      cashSalesCount,
      nonCashSales,
      // Abonos de fiado en efectivo que entraron a esta caja (también ocultos en cierre ciego).
      cashPaymentsTotal: closeSettings.blind ? null : cashPaymentsTotal,
      cashPaymentsCount,
      nonCashPayments,
      manualIncome,
      manualExpense,
      manualBalance,
      currentBalance: closeSettings.blind ? null : currentBalance,
      isOwnRegister: register.userId === userId,
      closeSettings,
    };
  }),

  // Abrir caja — respeta maxCashRegisters y una caja por usuario
  open: businessProcedure
    .input(
      z.object({
        openingBalance: z
          .number()
          .finite()
          .min(0, "El fondo inicial no puede ser negativo")
          .max(MAX_MONEY, "Monto demasiado grande"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId, role } = ctx.session.user;

      await assertCanManageCash(ctx.db, userId, role);

      try {
        const register = await ctx.db.$transaction(async (tx) => {
          // Bloquear el negocio serializa aperturas simultáneas: el conteo contra
          // maxCashRegisters no puede quedar desactualizado entre dos peticiones.
          // NO KEY UPDATE: no bloquea las ventas (sus FK solo toman KEY SHARE sobre el negocio).
          await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id" = ${businessId} FOR NO KEY UPDATE`;

          const [ownRegister, openCount, business] = await Promise.all([
            tx.cashRegister.findFirst({ where: { businessId, userId, status: "OPEN" }, select: { id: true } }),
            tx.cashRegister.count({ where: { businessId, status: "OPEN" } }),
            tx.business.findUnique({ where: { id: businessId }, select: { maxCashRegisters: true } }),
          ]);

          if (ownRegister) {
            throw new TRPCError({ code: "CONFLICT", message: "Ya tienes una caja abierta." });
          }

          // Lo configurado por el dueño, sin pasar el tope del plan.
          const max = effectiveMaxCashRegisters(business?.maxCashRegisters ?? 1, ctx.subscription.billing.plan);
          if (openCount >= max) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `Se alcanzó el límite de ${max} caja${max > 1 ? "s" : ""} abiertas simultáneamente.`,
            });
          }

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
      } catch (error) {
        // Índice único parcial "una caja OPEN por usuario": doble clic en "Abrir caja"
        if (isUniqueViolation(error)) {
          throw new TRPCError({ code: "CONFLICT", message: "Ya tienes una caja abierta." });
        }
        throw error;
      }
    }),

  // Registrar movimiento manual (entrada o salida) durante la jornada.
  // El cajero solo puede usar SU caja abierta; el owner, si no tiene la suya, la activa del negocio.
  addMovement: businessProcedure
    .input(
      z.object({
        type: z.enum(["INCOME", "EXPENSE"]),
        amount: z
          .number()
          .finite()
          .positive("El monto debe ser mayor a cero")
          .max(MAX_MONEY, "Monto demasiado grande"),
        description: z
          .string()
          .trim()
          .min(3, "La descripción es obligatoria (mín. 3 caracteres)")
          .max(500, "La descripción es demasiado larga (máx. 500 caracteres)"),
        note: z.string().trim().max(500, "La nota es demasiado larga (máx. 500 caracteres)").optional(),
        supplierId: z.string().min(1).max(64).optional(),
        idempotencyKey: idempotencyKeySchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId, role } = ctx.session.user;

      const registerMovement = async () => {
        if (input.supplierId) {
          const supplier = await ctx.db.supplier.findFirst({
            where: { id: input.supplierId, businessId },
            select: { id: true },
          });
          if (!supplier) throw new TRPCError({ code: "NOT_FOUND", message: "Proveedor no encontrado." });
        }

        await ctx.db.$transaction((tx) =>
          recordCashMovement(tx, {
            businessId,
            userId,
            role,
            type: input.type,
            amount: input.amount,
            description: input.description,
            note: input.note?.length ? input.note : null,
            supplierId: input.type === "EXPENSE" ? (input.supplierId ?? null) : null,
            idempotencyKey: input.idempotencyKey ?? null,
          }),
        );

        return { message: movementMessage(input.type) };
      };

      // Doble clic / reintento con la misma clave → no registrar el movimiento dos veces.
      return runIdempotent({
        key: input.idempotencyKey,
        findExisting: async () => {
          const existing = await ctx.db.cashMovement.findFirst({
            where: { businessId, idempotencyKey: input.idempotencyKey },
            select: { type: true },
          });
          return existing ? { message: movementMessage(existing.type) } : null;
        },
        run: registerMovement,
      });
    }),

  // Cerrar caja — el owner puede cerrar cualquier caja; el cajero solo la propia
  // Conteo previo del cierre ciego: el cajero ya contó; aquí se le dice cuánto esperaba el sistema
  // y la diferencia. Cada conteo queda en la auditoría (así un "volver a contar" se puede revisar).
  countCash: businessProcedure
    .input(z.object(cashCountSchema))
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;
      const registerId = await findRegisterToClose(ctx.db, ctx.session.user, input.registerId);
      const { countedCash, breakdown } = await resolveCount(ctx.db, businessId, ctx.session.user.role, input);
      const { balance } = await computeRegisterBalance(ctx.db, businessId, registerId);
      const difference = cashDifference(countedCash, balance);

      await ctx.db.auditLog.create({
        data: {
          businessId,
          userId,
          action: "CASH_COUNT",
          entityType: "CashRegister",
          entityId: registerId,
          detail: { countedCash, expected: balance, difference, countedBreakdown: breakdown },
        },
      });

      return { expected: balance, countedCash, difference };
    }),

  // Cerrar caja — el owner puede cerrar cualquier caja; el cajero solo la propia.
  // Exige el efectivo contado; si no cuadra con lo esperado, exige el motivo en la nota.
  close: businessProcedure
    .input(
      z.object({
        ...cashCountSchema,
        closingNote: z.string().trim().max(500, "La nota es demasiado larga (máx. 500 caracteres)").optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId, role } = ctx.session.user;
      const registerId = await findRegisterToClose(ctx.db, ctx.session.user, input.registerId);
      const { countedCash, breakdown } = await resolveCount(ctx.db, businessId, role, input);
      // La nota ya viene recortada: una nota de solo espacios cuenta como "sin nota".
      const closingNote = input.closingNote === "" ? null : (input.closingNote ?? null);

      const result = await ctx.db.$transaction(async (tx) => {
        // Bloquear la caja y calcular el saldo con ella bloqueada (ningún movimiento se cuela)
        if (!(await lockOpenRegister(tx, registerId, businessId))) {
          throw new TRPCError({ code: "CONFLICT", message: "Esta caja ya fue cerrada." });
        }

        const totals = await computeRegisterBalance(tx, businessId, registerId);
        const difference = cashDifference(countedCash, totals.balance);
        if (difference !== 0 && !closingNote) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${difference < 0 ? "Faltan" : "Sobran"} ${fmtCOP(Math.abs(difference))}. Escribe el motivo para cerrar la caja.`,
          });
        }

        // Transición condicional OPEN → CLOSED: un doble cierre no genera dos cierres
        const { count } = await tx.cashRegister.updateMany({
          where: { id: registerId, businessId, status: "OPEN" },
          data: {
            status: "CLOSED",
            closedAt: new Date(),
            closingBalance: totals.balance,
            closingNote,
            countedCash,
            countedBreakdown: breakdown ?? undefined,
          },
        });
        if (count !== 1) {
          throw new TRPCError({ code: "CONFLICT", message: "Esta caja ya fue cerrada." });
        }

        await tx.auditLog.create({
          data: {
            businessId,
            userId,
            action: "CLOSE_CASH_REGISTER",
            entityType: "CashRegister",
            entityId: registerId,
            detail: {
              openingBalance: totals.openingBalance,
              closingBalance: totals.balance,
              cashSalesTotal: totals.cashSalesTotal,
              cashSalesCount: totals.cashSalesCount,
              cashPaymentsTotal: totals.cashPaymentsTotal,
              manualBalance: totals.manualBalance,
              countedCash,
              difference,
              countedBreakdown: breakdown,
              closingNote,
            },
          },
        });

        return { closingBalance: totals.balance, difference };
      });

      return {
        closingBalance: result.closingBalance,
        countedCash,
        difference: result.difference,
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
    .input(z.object({ id: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const { businessId, id: userId, role } = ctx.session.user;

      // El cajero solo puede ver el reporte de sus propias cajas
      const register = await ctx.db.cashRegister.findFirst({
        where: { id: input.id, businessId, ...(role === "OWNER" ? {} : { userId }) },
        select: {
          id: true,
          openingBalance: true,
          closingBalance: true,
          closingNote: true,
          countedCash: true,
          countedBreakdown: true,
          openedAt: true,
          closedAt: true,
          status: true,
          user: { select: { name: true } },
          movements: {
            select: {
              id: true, type: true, amount: true, description: true, note: true, createdAt: true,
              user: { select: { name: true } },
              supplier: { select: { name: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!register) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Caja no encontrada." });
      }

      // Cierre ciego: con la caja abierta el reporte revelaría el efectivo esperado.
      if (register.status === "OPEN" && (await getCashCloseSettings(ctx.db, businessId, role)).blind) {
        throw new TRPCError({ code: "FORBIDDEN", message: "El reporte de la caja estará disponible después del cierre." });
      }

      const periodEnd = register.closedAt ?? new Date();
      const [
        { cashSalesTotal, cashSalesCount, nonCashSales, cashPaymentsTotal, cashPaymentsCount, nonCashPayments },
        activity,
      ] = await Promise.all([
        getRegisterSales(ctx.db, businessId, register.id),
        getRegisterActivity(ctx.db, businessId, register.id, register.openedAt, periodEnd),
      ]);

      const manualIncome = register.movements
        .filter((m) => m.type === "INCOME")
        .reduce((s, m) => s + m.amount, 0);
      const manualExpense = register.movements
        .filter((m) => m.type === "EXPENSE")
        .reduce((s, m) => s + m.amount, 0);
      const totalBalance = register.openingBalance + cashSalesTotal + cashPaymentsTotal + manualIncome - manualExpense;

      return {
        ...register,
        cashSalesTotal,
        cashSalesCount,
        nonCashSales,
        cashPaymentsTotal,
        cashPaymentsCount,
        nonCashPayments,
        manualIncome,
        manualExpense,
        totalBalance,
        ...activity,
      };
    }),

  // Historial de cierres — solo OWNER
  listHistory: ownerProcedure.query(({ ctx }) => {
    return ctx.db.cashRegister.findMany({
      where: { businessId: ctx.session.user.businessId, status: "CLOSED" },
      select: {
        id: true,
        openingBalance: true,
        closingBalance: true,
        closingNote: true,
        countedCash: true,
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
