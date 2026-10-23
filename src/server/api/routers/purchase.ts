import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { businessProcedure, createTRPCRouter } from "~/server/api/trpc";
import { recordCashMovement } from "~/server/api/routers/cashRegister";
import { adjustStock } from "~/server/lib/inventory";
import { idempotencyKeySchema, runIdempotent } from "~/server/lib/idempotency";
import { MAX_MONEY, MAX_QUANTITY, MAX_SALE_ITEMS } from "~/server/lib/resolveSaleItem";

// Cómo se le paga al proveedor. Solo el efectivo sale de la caja (como una salida).
const PAY_METHODS = ["CASH", "TRANSFER", "CARD"] as const;
type PayMethod = (typeof PAY_METHODS)[number];

const money = z.number().finite().max(MAX_MONEY, "Monto demasiado grande");

const fmtCOP = (v: number) =>
  v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });

/** Pago a un proveedor: si es en efectivo, sale de la caja como una salida ligada al pago. */
async function registerSupplierPayment(
  tx: Prisma.TransactionClient,
  params: {
    businessId: string;
    userId: string;
    role: string;
    purchaseId: string;
    supplierId: string | null;
    supplierName: string | null;
    amount: number;
    method: PayMethod;
    note: string | null;
    description: string;
    idempotencyKey: string | null;
  },
) {
  const { businessId, userId, purchaseId, amount, method } = params;
  const movement =
    method === "CASH"
      ? await recordCashMovement(tx, {
          businessId,
          userId,
          role: params.role,
          type: "EXPENSE",
          amount,
          description: params.description,
          note: params.note,
          supplierId: params.supplierId,
        })
      : null;

  return tx.supplierPayment.create({
    data: {
      businessId,
      purchaseId,
      userId,
      amount,
      paymentMethod: method,
      cashMovementId: movement?.id ?? null,
      note: params.note,
      idempotencyKey: params.idempotencyKey,
    },
    select: { id: true },
  });
}

// Compras con saldo pendiente (lo que se le debe a los proveedores).
async function pendingPurchaseIds(db: Prisma.TransactionClient, businessId: string, supplierId?: string) {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT p."id"
      FROM "purchases" p
      LEFT JOIN (
        SELECT "purchase_id", SUM("amount") AS "paid" FROM "supplier_payments" GROUP BY "purchase_id"
      ) pay ON pay."purchase_id" = p."id"
     WHERE p."business_id" = ${businessId}
       AND (${supplierId ?? null}::text IS NULL OR p."supplier_id" = ${supplierId ?? null})
       AND p."total" - COALESCE(pay."paid", 0) > 0.01
  `;
  return rows.map((r) => r.id);
}

const purchaseListSelect = {
  id: true, total: true, note: true, dueDate: true, createdAt: true,
  supplier: { select: { id: true, name: true } },
  user: { select: { name: true } },
  items: { select: { id: true, name: true, quantity: true, unitCost: true, subtotal: true } },
  payments: {
    select: { id: true, amount: true, paymentMethod: true, createdAt: true, user: { select: { name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.PurchaseSelect;

type PurchaseRow = Prisma.PurchaseGetPayload<{ select: typeof purchaseListSelect }>;

function withBalance(p: PurchaseRow) {
  const paid = p.payments.reduce((s, x) => s + x.amount, 0);
  return { ...p, paid, balance: Math.max(p.total - paid, 0) };
}

type PurchaseProduct = { id: string; name: string; trackStock: boolean; openPrice: boolean; soldByWeight: boolean };

// Guarda los productos de la compra, los suma al inventario y, si se pide, actualiza su costo.
async function receivePurchaseItems(
  tx: Prisma.TransactionClient,
  params: {
    businessId: string;
    userId: string;
    purchaseId: string;
    label: string;
    items: { productId: string; quantity: number; unitCost: number }[];
    productMap: Map<string, PurchaseProduct>;
    updateCosts: boolean;
  },
) {
  const { businessId, userId, label } = params;
  for (const item of params.items) {
    const product = params.productMap.get(item.productId)!;
    // Monto libre y por peso no llevan unidades en el inventario.
    const countsStock = product.trackStock && !product.openPrice && !product.soldByWeight;
    if (countsStock) {
      await adjustStock({ tx, productId: product.id, businessId, userId, quantity: item.quantity, reason: "PURCHASE", note: label });
    }
    if (params.updateCosts && item.unitCost > 0) {
      await tx.product.update({ where: { id: product.id }, data: { cost: item.unitCost } });
    }
    await tx.purchaseItem.create({
      data: {
        purchaseId: params.purchaseId,
        productId: product.id,
        name: product.name,
        quantity: item.quantity,
        unitCost: item.unitCost,
        subtotal: item.quantity * item.unitCost,
        stockAdded: countsStock ? item.quantity : 0,
      },
    });
  }
}

/** Total de la compra (productos o monto suelto) validado contra lo que se paga ahora. */
function purchaseTotals(input: {
  items: { quantity: number; unitCost: number }[];
  amount?: number;
  paidNow: number;
  supplierId?: string;
}) {
  if (input.items.length === 0 && input.amount === undefined) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Agrega los productos que llegaron o escribe el total de la compra." });
  }
  const total = input.items.length > 0
    ? input.items.reduce((s, i) => s + i.quantity * i.unitCost, 0)
    : input.amount!;
  if (total <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "El total de la compra debe ser mayor a cero." });
  if (input.paidNow > total + 0.01) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `El pago no puede ser mayor al total de la compra (${fmtCOP(total)}).` });
  }
  const pending = total - input.paidNow > 0.01;
  if (pending && !input.supplierId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Para dejar saldo pendiente, elige el proveedor al que se le debe." });
  }
  return { total, pending };
}

function paymentMessage(balance: number) {
  return balance > 0.01 ? `Pago registrado. Queda debiendo ${fmtCOP(balance)}.` : "Compra pagada por completo.";
}

export const purchaseRouter = createTRPCRouter({
  // Registrar la compra de un pedido: suma al inventario lo recibido y registra lo que se pagó.
  // Lo que no se pague ahora queda como saldo pendiente con el proveedor.
  create: businessProcedure
    .input(z.object({
      supplierId: z.string().min(1).max(64).optional(),
      items: z.array(z.object({
        productId: z.string().min(1).max(64),
        quantity: z.number().int().positive("La cantidad debe ser mayor a cero").max(MAX_QUANTITY, "Cantidad demasiado grande"),
        unitCost: money.nonnegative("El costo no puede ser negativo"),
      })).max(MAX_SALE_ITEMS, `Máximo ${MAX_SALE_ITEMS} productos por compra`),
      // Total cuando la compra no lleva productos del catálogo (p. ej. insumos, servicios).
      amount: money.positive("El monto debe ser mayor a cero").optional(),
      note: z.string().trim().max(500).optional(),
      paidNow: money.nonnegative("El pago no puede ser negativo"),
      paymentMethod: z.enum(PAY_METHODS).default("CASH"),
      dueDate: z.string().date("Fecha inválida").optional(),
      // Guardar el costo unitario de esta compra como costo del producto.
      updateCosts: z.boolean().default(true),
      idempotencyKey: idempotencyKeySchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId, role } = ctx.session.user;

      const { total, pending } = purchaseTotals(input);

      const createPurchase = async () => {
        const supplier = input.supplierId
          ? await ctx.db.supplier.findFirst({ where: { id: input.supplierId, businessId }, select: { id: true, name: true } })
          : null;
        if (input.supplierId && !supplier) throw new TRPCError({ code: "NOT_FOUND", message: "Proveedor no encontrado." });

        const products = await ctx.db.product.findMany({
          where: { id: { in: input.items.map((i) => i.productId) }, businessId },
          select: { id: true, name: true, trackStock: true, openPrice: true, soldByWeight: true },
        });
        if (products.length !== new Set(input.items.map((i) => i.productId)).size) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Uno o más productos no son válidos." });
        }
        const productMap = new Map(products.map((p) => [p.id, p]));
        const label = supplier ? `Compra a ${supplier.name}` : "Compra";

        return ctx.db.$transaction(async (tx) => {
          const purchase = await tx.purchase.create({
            data: {
              businessId,
              supplierId: supplier?.id ?? null,
              userId,
              total,
              note: input.note?.length ? input.note : null,
              dueDate: pending && input.dueDate ? new Date(`${input.dueDate}T12:00:00-05:00`) : null,
              idempotencyKey: input.idempotencyKey ?? null,
            },
            select: { id: true },
          });

          await receivePurchaseItems(tx, {
            businessId, userId, purchaseId: purchase.id, label,
            items: input.items, productMap, updateCosts: input.updateCosts,
          });

          if (input.paidNow > 0) {
            await registerSupplierPayment(tx, {
              businessId, userId, role,
              purchaseId: purchase.id,
              supplierId: supplier?.id ?? null,
              supplierName: supplier?.name ?? null,
              amount: input.paidNow,
              method: input.paymentMethod,
              note: input.note?.length ? input.note : null,
              description: label,
              idempotencyKey: null,
            });
          }

          await tx.auditLog.create({
            data: {
              businessId, userId, action: "CREATE_PURCHASE", entityType: "Purchase", entityId: purchase.id,
              detail: {
                supplierName: supplier?.name ?? null,
                total,
                paidNow: input.paidNow,
                paymentMethod: input.paymentMethod,
                itemCount: input.items.length,
              },
            },
          });

          const balance = total - input.paidNow;
          return {
            id: purchase.id,
            total,
            balance: Math.max(balance, 0),
            message: balance > 0.01 ? `Compra registrada. Quedas debiendo ${fmtCOP(balance)}.` : "Compra registrada y pagada.",
          };
        }, { timeout: 30000, maxWait: 10000 });
      };

      // Doble clic / reintento → no sumar al inventario ni pagar dos veces.
      return runIdempotent({
        key: input.idempotencyKey,
        findExisting: async () => {
          const existing = await ctx.db.purchase.findFirst({
            where: { businessId, idempotencyKey: input.idempotencyKey },
            select: purchaseListSelect,
          });
          if (!existing) return null;
          const { balance } = withBalance(existing);
          return {
            id: existing.id,
            total: existing.total,
            balance,
            message: balance > 0.01 ? `Compra registrada. Quedas debiendo ${fmtCOP(balance)}.` : "Compra registrada y pagada.",
          };
        },
        run: createPurchase,
      });
    }),

  // Abono o pago del saldo de una compra.
  addPayment: businessProcedure
    .input(z.object({
      purchaseId: z.string().min(1).max(64),
      amount: money.positive("El monto debe ser mayor a cero"),
      paymentMethod: z.enum(PAY_METHODS).default("CASH"),
      note: z.string().trim().max(500).optional(),
      idempotencyKey: idempotencyKeySchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId, role } = ctx.session.user;

      const pay = () => ctx.db.$transaction(async (tx) => {
        // Bloquear la compra: dos abonos simultáneos no pueden pagar más del saldo.
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "purchases" WHERE "id" = ${input.purchaseId} AND "business_id" = ${businessId} FOR UPDATE
        `;
        if (!locked[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Compra no encontrada." });

        const purchase = await tx.purchase.findUniqueOrThrow({ where: { id: input.purchaseId }, select: purchaseListSelect });
        const { balance } = withBalance(purchase);
        if (balance <= 0.01) throw new TRPCError({ code: "BAD_REQUEST", message: "Esta compra ya está pagada." });
        if (input.amount > balance + 0.01) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `El pago no puede ser mayor a lo que se debe (${fmtCOP(balance)}).` });
        }

        await registerSupplierPayment(tx, {
          businessId, userId, role,
          purchaseId: purchase.id,
          supplierId: purchase.supplier?.id ?? null,
          supplierName: purchase.supplier?.name ?? null,
          amount: input.amount,
          method: input.paymentMethod,
          note: input.note?.length ? input.note : null,
          description: purchase.supplier ? `Pago a ${purchase.supplier.name}` : "Pago de compra",
          idempotencyKey: input.idempotencyKey ?? null,
        });

        await tx.auditLog.create({
          data: {
            businessId, userId, action: "CREATE_SUPPLIER_PAYMENT", entityType: "Purchase", entityId: purchase.id,
            detail: { supplierName: purchase.supplier?.name ?? null, amount: input.amount, balanceBefore: balance, paymentMethod: input.paymentMethod },
          },
        });

        const remaining = Math.max(balance - input.amount, 0);
        return { balance: remaining, message: paymentMessage(remaining) };
      });

      return runIdempotent({
        key: input.idempotencyKey,
        findExisting: async () => {
          const existing = await ctx.db.supplierPayment.findFirst({
            where: { businessId, idempotencyKey: input.idempotencyKey },
            select: { purchase: { select: purchaseListSelect } },
          });
          if (!existing) return null;
          const { balance } = withBalance(existing.purchase);
          return { balance, message: paymentMessage(balance) };
        },
        run: pay,
      });
    }),

  // Compras recientes, o solo las que tienen saldo pendiente (las vencidas primero).
  list: businessProcedure
    .input(z.object({
      pendingOnly: z.boolean().default(false),
      supplierId: z.string().min(1).max(64).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;
      const where: Prisma.PurchaseWhereInput = { businessId, ...(input.supplierId ? { supplierId: input.supplierId } : {}) };
      if (input.pendingOnly) where.id = { in: await pendingPurchaseIds(ctx.db, businessId, input.supplierId) };

      const purchases = await ctx.db.purchase.findMany({
        where,
        select: purchaseListSelect,
        orderBy: input.pendingOnly ? [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] : { createdAt: "desc" },
        take: input.pendingOnly ? 200 : 60,
      });
      return purchases.map(withBalance);
    }),

  // Total por pagar a proveedores y cuántas compras ya pasaron su fecha de pago.
  payablesSummary: businessProcedure.query(async ({ ctx }) => {
    const { businessId } = ctx.session.user;
    const ids = await pendingPurchaseIds(ctx.db, businessId);
    if (ids.length === 0) return { total: 0, count: 0, overdue: 0 };
    const purchases = await ctx.db.purchase.findMany({ where: { id: { in: ids } }, select: purchaseListSelect });
    const now = Date.now();
    const rows = purchases.map(withBalance);
    return {
      total: rows.reduce((s, p) => s + p.balance, 0),
      count: rows.length,
      overdue: rows.filter((p) => p.dueDate && p.dueDate.getTime() < now).length,
    };
  }),

  // Productos de la última compra a un proveedor, con su costo, para repetir el pedido de siempre.
  lastForSupplier: businessProcedure
    .input(z.object({ supplierId: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;
      const last = await ctx.db.purchase.findFirst({
        where: { businessId, supplierId: input.supplierId, items: { some: {} } },
        select: {
          createdAt: true,
          items: {
            select: { productId: true, quantity: true, unitCost: true, product: { select: { name: true, isActive: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      if (!last) return null;
      return {
        createdAt: last.createdAt,
        items: last.items
          .filter((i) => i.productId && i.product?.isActive)
          .map((i) => ({ productId: i.productId!, name: i.product!.name, quantity: i.quantity, unitCost: i.unitCost })),
      };
    }),
});
