import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { businessProcedure, createTRPCRouter } from "~/server/api/trpc";
import { adjustStock, stockToRestore } from "~/server/lib/inventory";
import { assertCashRegisterNotStale, resolveSaleCashRegisterId } from "~/server/lib/cashRegisterGuard";
import { idempotencyKeySchema, runIdempotent } from "~/server/lib/idempotency";
import { nextInvoiceNumber } from "~/server/lib/invoiceNumber";
import { computeSaleTotals, type TaxConfig } from "~/lib/pricing";
import {
  assertReceiptPath,
  MAX_SALE_ITEMS,
  resolveSaleItem,
  saleItemInputSchema,
} from "~/server/lib/resolveSaleItem";

const PAYMENT_METHODS = ["CASH", "CARD", "CREDIT", "TRANSFER"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const MAX_CHECKOUT_GROUPS = 50;
const MAX_GROUP_GUESTS = 100;

const ALREADY_CHARGED_MESSAGE = "Esta cuenta ya fue cobrada. Actualiza la mesa para ver su estado actual.";

type CheckoutTaxLine = { name: string; rate: number; amount: number };
// stockDeducted ya resuelto: lo guardado en la ronda, o la regla anterior para rondas históricas.
type CheckoutOrderItem = {
  productId: string; name: string; unit: string; price: number; quantity: number; subtotal: number;
  stockDeducted: number;
};
type CheckoutOrder = { subtotal: number; taxAmount: number; taxLines: unknown; total: number; items: CheckoutOrderItem[] };
type CheckoutGuest = { id: string; name: string; customerId: string | null; orders: CheckoutOrder[] };
type CheckoutGroupInput = {
  guestIds: string[];
  paymentMethod: PaymentMethod;
  note?: string;
  invoice: boolean;
  receiptPath?: string;
};
type CheckoutSale = { id: string; invoiceNumber: string | null; total: number };

/**
 * Bloquea la fila de la mesa (SELECT ... FOR UPDATE) hasta el fin de la transacción.
 * Serializa cobro, cancelación, pedidos nuevos y eliminación de rondas sobre la misma mesa:
 * un doble clic en "Cobrar" espera a que termine el primero y luego ve la cuenta ya cobrada.
 */
async function lockTableSession(tx: Prisma.TransactionClient, sessionId: string, businessId: string) {
  const rows = await tx.$queryRaw<{ id: string; name: string; status: string }[]>`
    SELECT "id", "name", "status"::text AS "status"
      FROM "table_sessions"
     WHERE "id" = ${sessionId} AND "business_id" = ${businessId}
     FOR UPDATE
  `;
  return rows[0] ?? null;
}

// Las ventas a crédito deben quedar asociadas a un único cliente registrado,
// igual que en sale.create — de lo contrario la deuda no queda rastreable.
// Regla: todo el grupo a crédito es UN cliente distinto, y cada comensal del grupo está
// vinculado a él (varios comensales pueden ser el mismo cliente). El cliente debe estar
// activo y pertenecer al negocio.
async function assertValidCreditGroups(
  tx: Prisma.TransactionClient,
  businessId: string,
  groups: CheckoutGroupInput[],
  guestMap: Map<string, CheckoutGuest>,
) {
  for (const group of groups) {
    if (group.paymentMethod !== "CREDIT") continue;
    const guestCustomerIds = group.guestIds.map((id) => guestMap.get(id)!.customerId);
    const customerIds = new Set(guestCustomerIds.filter((id): id is string => !!id));
    if (customerIds.size === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Las ventas a crédito requieren un cliente registrado. Identifica al cliente en la mesa antes de cobrar a crédito.",
      });
    }
    if (customerIds.size > 1 || guestCustomerIds.some((id) => !id)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Todos los clientes del grupo a crédito deben ser el mismo cliente registrado.",
      });
    }
    const [customerId] = customerIds;
    const customer = await tx.customer.findFirst({
      where: { id: customerId, businessId, isActive: true },
      select: { id: true },
    });
    if (!customer) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado en este negocio." });
    }
  }
}

// Vuelca los ítems y las líneas de impuesto de una ronda dentro de los acumulados del grupo
// de pago. Devuelve el subtotal de la ronda para que el llamador lo sume.
function accumulateOrderIntoGroup(
  order: CheckoutOrder,
  itemsMap: Map<string, CheckoutOrderItem>,
  taxLinesMap: Map<string, CheckoutTaxLine>,
): number {
  for (const item of order.items) {
    const ex = itemsMap.get(item.productId);
    if (ex) { ex.quantity += item.quantity; ex.subtotal += item.subtotal; ex.stockDeducted += item.stockDeducted; }
    else itemsMap.set(item.productId, { ...item });
  }
  if (Array.isArray(order.taxLines)) {
    for (const line of order.taxLines as CheckoutTaxLine[]) {
      const key = `${line.name}|${line.rate}`;
      const ex = taxLinesMap.get(key);
      if (ex) ex.amount += line.amount; else taxLinesMap.set(key, { ...line });
    }
  }
  return order.subtotal;
}

// Suma las rondas de todos los clientes de un grupo de pago en una sola línea de ítems
// agregados y un solo desglose de impuestos combinado.
function aggregateGroupOrders(group: CheckoutGroupInput, guestMap: Map<string, CheckoutGuest>) {
  const itemsMap = new Map<string, CheckoutOrderItem>();
  const taxLinesMap = new Map<string, CheckoutTaxLine>();
  let groupSubtotal = 0;

  for (const guestId of group.guestIds) {
    for (const order of guestMap.get(guestId)!.orders) {
      groupSubtotal += accumulateOrderIntoGroup(order, itemsMap, taxLinesMap);
    }
  }

  const taxLines = Array.from(taxLinesMap.values());
  const groupTaxAmount = taxLines.reduce((s, t) => s + t.amount, 0);
  return { itemsMap, groupSubtotal, taxLines, groupTaxAmount, groupTotal: groupSubtotal + groupTaxAmount };
}

// Crea la venta de un grupo de pago (si tiene algo que cobrar) y libera a sus clientes de la mesa.
// Devuelve la venta creada, o null si el grupo no tenía nada que cobrar.
async function processCheckoutGroup(params: {
  tx: Prisma.TransactionClient;
  businessId: string;
  userId: string;
  sessionId: string;
  sessionName: string;
  group: CheckoutGroupInput;
  guestMap: Map<string, CheckoutGuest>;
  keepGuests: boolean;
  idempotencyKey: string | null;
}) {
  const { tx, businessId, userId, sessionId, sessionName, group, guestMap, keepGuests, idempotencyKey } = params;
  const { itemsMap, groupSubtotal, taxLines, groupTaxAmount, groupTotal } = aggregateGroupOrders(group, guestMap);

  let sale: CheckoutSale | null = null;

  if (groupTotal > 0 && itemsMap.size > 0) {
    // Por defecto no se genera factura (solo un cobro normal) — el cajero la activa
    // explícitamente por grupo de pago cuando el cliente la pide.
    // Consecutivo compartido con las ventas facturadas, reservado atómicamente.
    const invoiceNumber = group.invoice ? await nextInvoiceNumber(tx, businessId) : null;

    const firstWithCustomer = group.guestIds.map((id) => guestMap.get(id)!).find((g) => g.customerId);
    const guestNames = group.guestIds.map((id) => guestMap.get(id)!.name).join(", ");
    const rawNote = group.note?.trim();
    const noteText = rawNote !== undefined && rawNote.length > 0 ? rawNote : `Mesa: ${sessionName} · ${guestNames}`;

    // Caja en la que entra el dinero de este grupo (la del cajero que cobra o la única abierta).
    const cashRegisterId = await resolveSaleCashRegisterId(tx, businessId, userId);

    sale = await tx.sale.create({
      data: {
        businessId, userId, cashRegisterId,
        customerId: firstWithCustomer?.customerId ?? null,
        saleType: "TABLE",
        invoiceNumber,
        paymentMethod: group.paymentMethod,
        subtotal: groupSubtotal, taxAmount: groupTaxAmount,
        taxLines: taxLines.length > 0 ? taxLines : undefined,
        total: groupTotal,
        note: noteText.slice(0, 500),
        receiptPath: group.paymentMethod === "TRANSFER" ? assertReceiptPath(businessId, group.receiptPath) : null,
        idempotencyKey,
        tableSessionId: sessionId,
        items: { create: Array.from(itemsMap.values()) },
      },
      select: { id: true, invoiceNumber: true, total: true },
    });

    await tx.auditLog.create({
      data: { businessId, userId, action: "CREATE_SALE", entityType: "Sale", entityId: sale.id, detail: { saleType: "TABLE", tableSessionId: sessionId, invoiceNumber, total: groupTotal, paymentMethod: group.paymentMethod, keepGuests } },
    });
  }

  // Clear paid guests: remove their orders (cascade to items).
  // With keepGuests: keep the guest record so they can order again.
  // Without keepGuests: delete the guest entirely (cascade deletes orders).
  for (const guestId of group.guestIds) {
    if (keepGuests) {
      await tx.tableOrder.deleteMany({ where: { tableGuestId: guestId, tableSessionId: sessionId } });
    } else {
      await tx.tableGuest.deleteMany({ where: { id: guestId, tableSessionId: sessionId } });
    }
  }

  return sale;
}

// Ventas ya generadas por un cobro con esta clave (una por grupo: "<clave>:<índice>").
async function findCheckoutSales(db: Prisma.TransactionClient, businessId: string, key: string): Promise<CheckoutSale[]> {
  return db.sale.findMany({
    where: { businessId, idempotencyKey: { startsWith: `${key}:` } },
    select: { id: true, invoiceNumber: true, total: true },
    orderBy: { idempotencyKey: "asc" },
  });
}

function checkoutMessage(sessionName: string, tableClosed: boolean, keepGuests: boolean, salesCount: number): string {
  let verb: string;
  if (tableClosed) {
    verb = `Mesa "${sessionName}" cerrada.`;
  } else if (keepGuests) {
    verb = "Cobro registrado. Los clientes permanecen en mesa.";
  } else {
    verb = "Cobro parcial registrado.";
  }
  return `${verb} ${salesCount} venta(s) generada(s).`;
}

export const tableSessionRouter = createTRPCRouter({
  // All OPEN sessions with full nested data
  listActive: businessProcedure.query(async ({ ctx }) => {
    const { businessId } = ctx.session.user;
    return ctx.db.tableSession.findMany({
      where: { businessId, status: "OPEN" },
      select: {
        id: true,
        name: true,
        openedAt: true,
        user: { select: { name: true } },
        guests: {
          select: {
            id: true,
            name: true,
            description: true,
            customerId: true,
            orders: {
              select: {
                id: true,
                createdAt: true,
                note: true,
                subtotal: true,
                taxAmount: true,
                taxLines: true,
                total: true,
                userId: true,
                user: { select: { name: true } },
                items: {
                  select: { id: true, name: true, unit: true, price: true, quantity: true, subtotal: true, productId: true },
                  orderBy: { id: "asc" },
                },
              },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { addedAt: "asc" },
        },
      },
      orderBy: { openedAt: "asc" },
    });
  }),

  // Returns the lowest available "Mesa N" name given currently open sessions
  suggestName: businessProcedure.query(async ({ ctx }) => {
    const sessions = await ctx.db.tableSession.findMany({
      where: { businessId: ctx.session.user.businessId, status: "OPEN" },
      select: { name: true },
    });
    const used = new Set<number>();
    for (const s of sessions) {
      const m = /^Mesa (\d+)$/.exec(s.name);
      if (m) used.add(Number(m[1]));
    }
    let n = 1;
    while (used.has(n)) n++;
    return `Mesa ${n}`;
  }),

  // Open a new table
  create: businessProcedure
    .input(z.object({ name: z.string().trim().min(1, "El nombre de la mesa es obligatorio").max(120) }))
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;

      const register = await ctx.db.cashRegister.findFirst({
        where: { businessId, status: "OPEN" },
        select: { id: true },
      });
      if (!register) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Debes tener una caja abierta para abrir una mesa." });
      }

      const session = await ctx.db.tableSession.create({
        data: { businessId, userId, name: input.name },
        select: { id: true, name: true },
      });
      return session;
    }),

  // Add a guest to a table
  addGuest: businessProcedure
    .input(z.object({
      sessionId: z.string().min(1).max(64),
      name: z.string().trim().max(120).optional(),
      description: z.string().trim().max(500).optional(),
      document: z.string().trim().max(20).optional(),
      phone: z.string().trim().max(20).optional(),
      customerId: z.string().min(1).max(64).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;

      const session = await ctx.db.tableSession.findFirst({
        where: { id: input.sessionId, businessId, status: "OPEN" },
        select: { id: true, guests: { select: { id: true } } },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Mesa no encontrada o ya cerrada." });

      const rawName = input.name?.trim();
      const guestName = rawName !== undefined && rawName.length > 0 ? rawName : `Cliente ${session.guests.length + 1}`;
      let customerId: string | null = null;

      if (input.customerId) {
        const linked = await ctx.db.customer.findFirst({
          where: { id: input.customerId, businessId },
          select: { id: true },
        });
        if (!linked) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado." });
        customerId = linked.id;
      } else if (input.document?.trim()) {
        const existing = await ctx.db.customer.findFirst({
          where: { businessId, document: input.document.trim() },
          select: { id: true },
        });
        if (existing) {
          customerId = existing.id;
        } else {
          const created = await ctx.db.customer.create({
            data: { businessId, name: guestName, document: input.document.trim(), phone: input.phone?.trim() ?? null },
            select: { id: true },
          });
          customerId = created.id;
        }
      }

      const guest = await ctx.db.tableGuest.create({
        data: {
          tableSessionId: session.id,
          name: guestName,
          description: input.description?.trim() ?? null,
          document: input.document?.trim() ?? null,
          phone: input.phone?.trim() ?? null,
          customerId,
        },
        select: { id: true, name: true },
      });
      return guest;
    }),

  // Rename a guest already seated at the table (e.g. once you learn their real name)
  renameGuest: businessProcedure
    .input(z.object({
      guestId: z.string().min(1).max(64),
      name: z.string().trim().min(1, "El nombre no puede estar vacío").max(120),
    }))
    .mutation(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;
      const guest = await ctx.db.tableGuest.findFirst({
        where: { id: input.guestId, tableSession: { businessId, status: "OPEN" } },
        select: { id: true },
      });
      if (!guest) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado." });

      await ctx.db.tableGuest.update({ where: { id: guest.id }, data: { name: input.name } });
      return { message: "Cliente renombrado." };
    }),

  // Remove a guest (only allowed if they have no orders)
  removeGuest: businessProcedure
    .input(z.object({ guestId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;
      const guest = await ctx.db.tableGuest.findFirst({
        where: { id: input.guestId, tableSession: { businessId, status: "OPEN" } },
        select: { id: true, _count: { select: { orders: true } } },
      });
      if (!guest) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado." });
      if (guest._count.orders > 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Elimina los pedidos del cliente antes de quitarlo de la mesa." });
      // Condición en el DELETE: si entre la validación y el borrado le agregaron una ronda, no se borra.
      const { count } = await ctx.db.tableGuest.deleteMany({ where: { id: guest.id, orders: { none: {} } } });
      if (count !== 1) throw new TRPCError({ code: "CONFLICT", message: "Elimina los pedidos del cliente antes de quitarlo de la mesa." });
      return { message: "Cliente eliminado de la mesa." };
    }),

  // Add a round/order to a guest — decrements stock immediately — records who served
  addOrder: businessProcedure
    .input(z.object({
      guestId: z.string().min(1).max(64),
      items: z.array(saleItemInputSchema).min(1).max(MAX_SALE_ITEMS, `Máximo ${MAX_SALE_ITEMS} productos por pedido`),
      note: z.string().trim().max(500).optional(),
      idempotencyKey: idempotencyKeySchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;

      const guest = await ctx.db.tableGuest.findFirst({
        where: { id: input.guestId, tableSession: { businessId, status: "OPEN" } },
        select: { id: true, tableSessionId: true },
      });
      if (!guest) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado." });

      const createOrder = async () => {
        const [products, business] = await Promise.all([
          ctx.db.product.findMany({
            where: { id: { in: input.items.map((i) => i.productId) }, businessId, isActive: true },
            select: { id: true, name: true, unit: true, price: true, trackStock: true, taxSlots: true, openPrice: true, soldByWeight: true },
          }),
          ctx.db.business.findUnique({ where: { id: businessId }, select: { taxes: true, autoTax: true } }),
        ]);

        // Un mismo producto puede venir en varias líneas (p. ej. dos pesajes): comparar con los ids distintos.
        if (products.length !== new Set(input.items.map((i) => i.productId)).size) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Uno o más productos no son válidos o están inactivos." });
        }

        const productMap = new Map(products.map((p) => [p.id, p]));
        const resolvedItems = input.items.map((item) => resolveSaleItem(productMap.get(item.productId)!, item));
        const itemsToCreate = resolvedItems.map((resolved) => ({
          productId: resolved.productId, name: resolved.name, unit: resolved.unit,
          price: resolved.price, quantity: resolved.quantity, subtotal: resolved.subtotal,
          // Lo descontado del stock ahora: al eliminar la ronda o cancelar la mesa se devuelve esto.
          stockDeducted: resolved.stockDelta,
        }));

        const taxConfigs = (business?.taxes as TaxConfig[]) ?? [];
        const { subtotal, taxAmount, taxLines, total } = computeSaleTotals(
          resolvedItems.map((resolved) => ({
            price: resolved.price, quantity: resolved.quantity, taxSlots: resolved.taxSlots,
          })),
          taxConfigs,
          business?.autoTax ?? false,
        );

        return ctx.db.$transaction(async (tx) => {
          // La mesa podría haberse cobrado o cancelado mientras tanto: bloquear y revalidar.
          const locked = await lockTableSession(tx, guest.tableSessionId, businessId);
          if (locked?.status !== "OPEN") {
            throw new TRPCError({ code: "CONFLICT", message: "La mesa ya fue cerrada." });
          }
          const stillSeated = await tx.tableGuest.findFirst({
            where: { id: guest.id, tableSessionId: guest.tableSessionId },
            select: { id: true },
          });
          if (!stillSeated) {
            throw new TRPCError({ code: "CONFLICT", message: "Este cliente ya no está en la mesa (su cuenta pudo haber sido cobrada)." });
          }

          for (const resolved of resolvedItems) {
            if (resolved.stockDelta > 0) {
              await adjustStock({ tx, productId: resolved.productId, businessId, userId, quantity: -resolved.stockDelta, reason: "TABLE_ORDER", note: `Mesa: ${guest.tableSessionId}` });
            }
          }
          return tx.tableOrder.create({
            data: {
              tableGuestId: guest.id,
              tableSessionId: guest.tableSessionId,
              userId,
              subtotal, taxAmount,
              taxLines: taxLines.length > 0 ? taxLines : undefined,
              total,
              note: input.note?.trim() ?? null,
              idempotencyKey: input.idempotencyKey ?? null,
              items: { create: itemsToCreate },
            },
            select: { id: true, total: true, createdAt: true },
          });
        }, { timeout: 30000, maxWait: 10000 });
      };

      // Doble envío del mismo pedido → devolver la ronda ya creada (sin descontar stock otra vez).
      return runIdempotent({
        key: input.idempotencyKey,
        findExisting: () =>
          ctx.db.tableOrder.findFirst({
            where: { tableSessionId: guest.tableSessionId, idempotencyKey: input.idempotencyKey },
            select: { id: true, total: true, createdAt: true },
          }),
        run: createOrder,
      });
    }),

  // Move a round to another guest at the same table (e.g. the wrong person was charged with it)
  moveOrder: businessProcedure
    .input(z.object({ orderId: z.string().min(1).max(64), toGuestId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;

      const order = await ctx.db.tableOrder.findFirst({
        where: { id: input.orderId, tableSession: { businessId, status: "OPEN" } },
        select: { id: true, tableSessionId: true, tableGuestId: true },
      });
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido no encontrado." });

      if (order.tableGuestId === input.toGuestId) {
        return { message: "El pedido ya pertenece a ese cliente." };
      }

      // Bajo el bloqueo de la mesa: si se mueve un pedido mientras se cobra,
      // podría cobrarse dos veces o borrarse sin cobrar.
      const toGuest = await ctx.db.$transaction(async (tx) => {
        const locked = await lockTableSession(tx, order.tableSessionId, businessId);
        if (locked?.status !== "OPEN") {
          throw new TRPCError({ code: "CONFLICT", message: "La mesa ya fue cerrada." });
        }
        const current = await tx.tableOrder.findFirst({
          where: { id: order.id, tableSessionId: order.tableSessionId },
          select: { id: true },
        });
        if (!current) throw new TRPCError({ code: "CONFLICT", message: "Este pedido ya fue cobrado o eliminado." });

        const guest = await tx.tableGuest.findFirst({
          where: { id: input.toGuestId, tableSessionId: order.tableSessionId },
          select: { id: true, name: true },
        });
        if (!guest) throw new TRPCError({ code: "BAD_REQUEST", message: "El cliente destino no pertenece a esta mesa." });

        await tx.tableOrder.update({ where: { id: order.id }, data: { tableGuestId: guest.id } });
        return guest;
      });
      return { message: `Pedido movido a ${toGuest.name}.` };
    }),

  // Remove a round — re-increments stock
  removeOrder: businessProcedure
    .input(z.object({ orderId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;

      const order = await ctx.db.tableOrder.findFirst({
        where: { id: input.orderId, tableSession: { businessId, status: "OPEN" } },
        select: { id: true, tableSessionId: true },
      });
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido no encontrado." });

      await ctx.db.$transaction(async (tx) => {
        const locked = await lockTableSession(tx, order.tableSessionId, businessId);
        if (locked?.status !== "OPEN") {
          throw new TRPCError({ code: "CONFLICT", message: "La mesa ya fue cerrada." });
        }

        // Releer dentro del bloqueo: un doble clic no debe restaurar el stock dos veces.
        const current = await tx.tableOrder.findFirst({
          where: { id: order.id, tableSessionId: order.tableSessionId },
          select: {
            id: true, total: true,
            tableGuest: { select: { name: true } },
            items: {
              select: {
                productId: true, name: true, quantity: true, stockDeducted: true,
                product: { select: { trackStock: true, openPrice: true, soldByWeight: true } },
              },
            },
          },
        });
        if (!current) {
          throw new TRPCError({ code: "CONFLICT", message: "Este pedido ya fue eliminado o cobrado." });
        }

        await tx.tableOrder.delete({ where: { id: current.id } });

        for (const item of current.items) {
          const quantity = stockToRestore(item);
          if (quantity > 0) {
            await adjustStock({ tx, productId: item.productId, businessId, userId, quantity, reason: "TABLE_ORDER_CANCEL", note: "Cancelación de pedido en mesa" });
          }
        }

        await tx.auditLog.create({
          data: {
            businessId, userId, action: "REMOVE_TABLE_ORDER", entityType: "TableOrder", entityId: current.id,
            detail: {
              tableSessionId: order.tableSessionId,
              tableName: locked.name,
              guestName: current.tableGuest.name,
              total: current.total,
              items: current.items.map((i) => ({ name: i.name, quantity: i.quantity })),
            },
          },
        });
      }, { timeout: 30000, maxWait: 10000 });

      return { message: "Pedido eliminado y stock restaurado." };
    }),

  // Checkout — pays for the provided guest groups.
  // keepGuests: when true, orders are cleared but guest records stay so they can order again.
  //             Session stays OPEN regardless.
  // keepGuests: false (default) — guests are removed after payment; session closes when no guests remain.
  // idempotencyKey: generada por el cliente al abrir el cobro; cada venta guarda "<clave>:<grupo>".
  checkout: businessProcedure
    .input(z.object({
      sessionId: z.string().min(1).max(64),
      keepGuests: z.boolean().optional().default(false),
      groups: z.array(z.object({
        guestIds: z.array(z.string().min(1).max(64)).min(1).max(MAX_GROUP_GUESTS),
        paymentMethod: z.enum(PAYMENT_METHODS),
        note: z.string().trim().max(500).optional(),
        invoice: z.boolean().optional().default(false),
        receiptPath: z.string().trim().max(300).optional(),
      })).min(1).max(MAX_CHECKOUT_GROUPS),
      idempotencyKey: idempotencyKeySchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;
      const key = input.idempotencyKey ?? null;

      // Validaciones que no dependen del estado de la mesa (antes de abrir la transacción)
      const allGroupGuestIds = input.groups.flatMap((g) => g.guestIds);
      if (new Set(allGroupGuestIds).size !== allGroupGuestIds.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Un cliente aparece en múltiples grupos de pago." });
      }
      for (const group of input.groups) {
        if (group.paymentMethod === "TRANSFER") assertReceiptPath(businessId, group.receiptPath);
      }

      const previousResult = async () => {
        if (!key) return null;
        const sales = await findCheckoutSales(ctx.db, businessId, key);
        if (sales.length === 0) return null;
        const session = await ctx.db.tableSession.findFirst({
          where: { id: input.sessionId, businessId },
          select: { name: true, status: true },
        });
        const tableClosed = session?.status === "CLOSED";
        return {
          message: checkoutMessage(session?.name ?? "", tableClosed, input.keepGuests, sales.length),
          sales,
          tableClosed,
        };
      };

      const runCheckout = async () => {
        await assertCashRegisterNotStale(ctx.db, businessId, userId);

        const result = await ctx.db.$transaction(async (tx) => {
          // 1. Bloquear la mesa: un segundo cobro simultáneo espera aquí hasta que el primero termine.
          const locked = await lockTableSession(tx, input.sessionId, businessId);
          if (!locked) throw new TRPCError({ code: "NOT_FOUND", message: "Mesa no encontrada." });

          // 2. Si este mismo cobro ya se procesó (doble clic / reintento), devolver lo ya cobrado.
          if (key) {
            const prior = await findCheckoutSales(tx, businessId, key);
            if (prior.length > 0) return { sales: prior, tableClosed: locked.status === "CLOSED", sessionName: locked.name };
          }

          if (locked.status !== "OPEN") {
            throw new TRPCError({ code: "CONFLICT", message: ALREADY_CHARGED_MESSAGE });
          }

          // 3. Releer clientes y rondas DENTRO del bloqueo — nunca cobrar con datos leídos antes.
          const guestRows = await tx.tableGuest.findMany({
            where: { tableSessionId: locked.id },
            select: {
              id: true, name: true, customerId: true,
              orders: {
                select: {
                  subtotal: true, taxAmount: true, taxLines: true, total: true,
                  items: {
                    select: {
                      productId: true, name: true, unit: true, price: true, quantity: true, subtotal: true,
                      stockDeducted: true,
                      product: { select: { trackStock: true, openPrice: true, soldByWeight: true } },
                    },
                  },
                },
              },
            },
          });

          // La venta hereda lo que cada ronda descontó del stock (regla anterior solo para rondas
          // históricas sin stockDeducted), así una anulación posterior devuelve exactamente eso.
          const guests: CheckoutGuest[] = guestRows.map((g) => ({
            ...g,
            orders: g.orders.map((o) => ({
              ...o,
              items: o.items.map(({ product, stockDeducted, ...item }) => ({
                ...item,
                stockDeducted: stockToRestore({ quantity: item.quantity, stockDeducted, product }),
              })),
            })),
          }));

          const guestMap = new Map<string, CheckoutGuest>(guests.map((g) => [g.id, g]));
          // Un cliente que ya no está en la mesa normalmente significa que su cuenta ya se cobró.
          for (const id of allGroupGuestIds) {
            if (!guestMap.has(id)) throw new TRPCError({ code: "CONFLICT", message: ALREADY_CHARGED_MESSAGE });
          }
          const ordersToCharge = allGroupGuestIds.reduce((n, id) => n + guestMap.get(id)!.orders.length, 0);
          if (ordersToCharge === 0) {
            throw new TRPCError({ code: "CONFLICT", message: ALREADY_CHARGED_MESSAGE });
          }

          await assertValidCreditGroups(tx, businessId, input.groups, guestMap);

          const sales: CheckoutSale[] = [];
          for (const [index, group] of input.groups.entries()) {
            const sale = await processCheckoutGroup({
              tx, businessId, userId,
              sessionId: locked.id, sessionName: locked.name,
              group, guestMap, keepGuests: input.keepGuests,
              idempotencyKey: key ? `${key}:${String(index).padStart(2, "0")}` : null,
            });
            if (sale) sales.push(sale);
          }

          let tableClosed = false;
          if (!input.keepGuests) {
            const remainingGuests = await tx.tableGuest.count({ where: { tableSessionId: locked.id } });
            if (remainingGuests === 0) {
              await tx.tableSession.update({ where: { id: locked.id }, data: { status: "CLOSED", closedAt: new Date() } });
              tableClosed = true;
            }
          }

          return { sales, tableClosed, sessionName: locked.name };
        }, { timeout: 60000, maxWait: 20000 });

        return {
          message: checkoutMessage(result.sessionName, result.tableClosed, input.keepGuests, result.sales.length),
          sales: result.sales,
          tableClosed: result.tableClosed,
        };
      };

      return runIdempotent({ key: key ?? undefined, findExisting: previousResult, run: runCheckout });
    }),

  // Close table after all guests have been paid (no stock changes).
  // Only allowed when no guest has pending orders.
  close: businessProcedure
    .input(z.object({ sessionId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;

      const session = await ctx.db.tableSession.findFirst({
        where: { id: input.sessionId, businessId, status: "OPEN" },
        select: { id: true, name: true },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Mesa no encontrada o ya cerrada." });

      // Condición en el UPDATE: solo se cierra si sigue abierta y sin rondas pendientes.
      const { count } = await ctx.db.tableSession.updateMany({
        where: { id: session.id, businessId, status: "OPEN", orders: { none: {} } },
        data: { status: "CLOSED", closedAt: new Date() },
      });
      if (count !== 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Hay clientes con pedidos pendientes. Cóbralos primero antes de cerrar la mesa." });
      }

      return { message: `Mesa "${session.name}" cerrada.` };
    }),

  // Cancel table — restore stock, no sales
  cancel: businessProcedure
    .input(z.object({ sessionId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;

      const session = await ctx.db.tableSession.findFirst({
        where: { id: input.sessionId, businessId, status: "OPEN" },
        select: { id: true, name: true },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Mesa no encontrada o ya cerrada." });

      await ctx.db.$transaction(async (tx) => {
        // Transición condicional OPEN → CLOSED (también bloquea la fila): una doble cancelación
        // o un cobro simultáneo no pueden restaurar el stock dos veces.
        const { count } = await tx.tableSession.updateMany({
          where: { id: session.id, businessId, status: "OPEN" },
          data: { status: "CLOSED", closedAt: new Date() },
        });
        if (count !== 1) {
          throw new TRPCError({ code: "CONFLICT", message: "Esta mesa ya fue cerrada o cancelada." });
        }

        const orders = await tx.tableOrder.findMany({
          where: { tableSessionId: session.id },
          select: {
            total: true,
            items: {
              select: {
                productId: true, quantity: true, stockDeducted: true,
                product: { select: { trackStock: true, openPrice: true, soldByWeight: true } },
              },
            },
          },
        });

        for (const order of orders) {
          for (const item of order.items) {
            const quantity = stockToRestore(item);
            if (quantity > 0) {
              await adjustStock({ tx, productId: item.productId, businessId, userId, quantity, reason: "TABLE_ORDER_CANCEL", note: `Cancelación de mesa: ${session.name}` });
            }
          }
        }

        await tx.auditLog.create({
          data: {
            businessId, userId, action: "CANCEL_TABLE", entityType: "TableSession", entityId: session.id,
            detail: {
              name: session.name,
              orderCount: orders.length,
              total: orders.reduce((s, o) => s + o.total, 0),
            },
          },
        });
      }, { timeout: 30000, maxWait: 10000 });

      return { message: `Mesa "${session.name}" cancelada. Stock restaurado.` };
    }),
});
