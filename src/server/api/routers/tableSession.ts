import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { businessProcedure, createTRPCRouter } from "~/server/api/trpc";
import { adjustStock } from "~/server/lib/inventory";
import { assertCashRegisterNotStale } from "~/server/lib/cashRegisterGuard";
import { computeSaleTotals, type TaxConfig } from "~/lib/pricing";
import { resolveSaleItem } from "~/server/lib/resolveSaleItem";

const PAYMENT_METHODS = ["CASH", "CARD", "CREDIT", "TRANSFER"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

function generateInvoiceNumber(year: number, sequence: number): string {
  return `F-${year}-${String(sequence).padStart(5, "0")}`;
}

type CheckoutTaxLine = { name: string; rate: number; amount: number };
type CheckoutOrderItem = { productId: string; name: string; unit: string; price: number; quantity: number; subtotal: number };
type CheckoutOrder = { subtotal: number; taxAmount: number; taxLines: unknown; total: number; items: CheckoutOrderItem[] };
type CheckoutGuest = { id: string; name: string; customerId: string | null; orders: CheckoutOrder[] };
type CheckoutGroupInput = {
  guestIds: string[];
  paymentMethod: PaymentMethod;
  note?: string;
  invoice: boolean;
  receiptPath?: string;
};

// Las ventas a crédito deben quedar asociadas a un único cliente registrado,
// igual que en sale.create — de lo contrario la deuda no queda rastreable.
function assertValidCreditGroups(groups: CheckoutGroupInput[], guestMap: Map<string, CheckoutGuest>) {
  for (const group of groups) {
    if (group.paymentMethod !== "CREDIT") continue;
    const customerIds = new Set(
      group.guestIds.map((id) => guestMap.get(id)!.customerId).filter((id): id is string => !!id),
    );
    if (customerIds.size === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Las ventas a crédito requieren un cliente registrado. Identifica al cliente en la mesa antes de cobrar a crédito.",
      });
    }
    if (customerIds.size > 1 || customerIds.size !== group.guestIds.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Todos los clientes del grupo a crédito deben ser el mismo cliente registrado.",
      });
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
    if (ex) { ex.quantity += item.quantity; ex.subtotal += item.subtotal; }
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
  salesSoFar: number;
}) {
  const { tx, businessId, userId, sessionId, sessionName, group, guestMap, keepGuests, salesSoFar } = params;
  const { itemsMap, groupSubtotal, taxLines, groupTaxAmount, groupTotal } = aggregateGroupOrders(group, guestMap);

  let sale: { id: string; invoiceNumber: string | null; total: number } | null = null;

  if (groupTotal > 0 && itemsMap.size > 0) {
    // Por defecto no se genera factura (solo un cobro normal) — el cajero la activa
    // explícitamente por grupo de pago cuando el cliente la pide.
    let invoiceNumber: string | null = null;
    if (group.invoice) {
      const year = new Date().getFullYear();
      const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
      // Shared consecutive counter: counts ALL invoices (mesa + facturadas) for this business/year
      const invoiceCount = await tx.sale.count({
        where: { businessId, invoiceNumber: { not: null }, createdAt: { gte: yearStart } },
      });
      invoiceNumber = generateInvoiceNumber(year, invoiceCount + salesSoFar + 1);
    }

    const firstWithCustomer = group.guestIds.map((id) => guestMap.get(id)!).find((g) => g.customerId);
    const guestNames = group.guestIds.map((id) => guestMap.get(id)!.name).join(", ");
    const rawNote = group.note?.trim();
    const noteText = rawNote !== undefined && rawNote.length > 0 ? rawNote : `Mesa: ${sessionName} · ${guestNames}`;

    sale = await tx.sale.create({
      data: {
        businessId, userId,
        customerId: firstWithCustomer?.customerId ?? null,
        saleType: "TABLE",
        invoiceNumber,
        paymentMethod: group.paymentMethod,
        subtotal: groupSubtotal, taxAmount: groupTaxAmount,
        taxLines: taxLines.length > 0 ? taxLines : undefined,
        total: groupTotal,
        note: noteText,
        receiptPath: group.paymentMethod === "TRANSFER" ? (group.receiptPath ?? null) : null,
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
      await tx.tableOrder.deleteMany({ where: { tableGuestId: guestId } });
    } else {
      await tx.tableGuest.delete({ where: { id: guestId } });
    }
  }

  return sale;
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
    .input(z.object({ name: z.string().trim().min(1, "El nombre de la mesa es obligatorio") }))
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
      sessionId: z.string().min(1),
      name: z.string().trim().optional(),
      description: z.string().trim().optional(),
      document: z.string().trim().optional(),
      phone: z.string().trim().optional(),
      customerId: z.string().optional(),
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
          tableSessionId: input.sessionId,
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
    .input(z.object({ guestId: z.string().min(1), name: z.string().trim().min(1, "El nombre no puede estar vacío") }))
    .mutation(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;
      const guest = await ctx.db.tableGuest.findFirst({
        where: { id: input.guestId, tableSession: { businessId, status: "OPEN" } },
        select: { id: true },
      });
      if (!guest) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado." });

      await ctx.db.tableGuest.update({ where: { id: input.guestId }, data: { name: input.name } });
      return { message: "Cliente renombrado." };
    }),

  // Remove a guest (only allowed if they have no orders)
  removeGuest: businessProcedure
    .input(z.object({ guestId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;
      const guest = await ctx.db.tableGuest.findFirst({
        where: { id: input.guestId, tableSession: { businessId, status: "OPEN" } },
        select: { id: true, _count: { select: { orders: true } } },
      });
      if (!guest) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado." });
      if (guest._count.orders > 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Elimina los pedidos del cliente antes de quitarlo de la mesa." });
      await ctx.db.tableGuest.delete({ where: { id: input.guestId } });
      return { message: "Cliente eliminado de la mesa." };
    }),

  // Add a round/order to a guest — decrements stock immediately — records who served
  addOrder: businessProcedure
    .input(z.object({
      guestId: z.string().min(1),
      items: z.array(z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive(),
        weightKg: z.number().positive().optional(),
        customAmount: z.number().positive().optional(),
      })).min(1),
      note: z.string().trim().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;

      const guest = await ctx.db.tableGuest.findFirst({
        where: { id: input.guestId, tableSession: { businessId, status: "OPEN" } },
        select: { id: true, tableSessionId: true },
      });
      if (!guest) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado." });

      const [products, business] = await Promise.all([
        ctx.db.product.findMany({
          where: { id: { in: input.items.map((i) => i.productId) }, businessId, isActive: true },
          select: { id: true, name: true, unit: true, price: true, trackStock: true, taxSlots: true, openPrice: true, soldByWeight: true },
        }),
        ctx.db.business.findUnique({ where: { id: businessId }, select: { taxes: true, autoTax: true } }),
      ]);

      if (products.length !== input.items.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Uno o más productos no son válidos o están inactivos." });
      }

      const productMap = new Map(products.map((p) => [p.id, p]));
      const resolvedItems = input.items.map((item) => resolveSaleItem(productMap.get(item.productId)!, item));
      const itemsToCreate = resolvedItems.map((resolved) => ({
        productId: resolved.productId, name: resolved.name, unit: resolved.unit,
        price: resolved.price, quantity: resolved.quantity, subtotal: resolved.subtotal,
      }));

      const taxConfigs = (business?.taxes as TaxConfig[]) ?? [];
      const { subtotal, taxAmount, taxLines, total } = computeSaleTotals(
        resolvedItems.map((resolved) => ({
          price: resolved.price, quantity: resolved.quantity, taxSlots: resolved.taxSlots,
        })),
        taxConfigs,
        business?.autoTax ?? false,
      );

      const order = await ctx.db.$transaction(async (tx) => {
        for (const resolved of resolvedItems) {
          if (resolved.stockDelta > 0) {
            await adjustStock({ tx, productId: resolved.productId, businessId, userId, quantity: -resolved.stockDelta, reason: "TABLE_ORDER", note: `Mesa: ${guest.tableSessionId}` });
          }
        }
        return tx.tableOrder.create({
          data: {
            tableGuestId: input.guestId,
            tableSessionId: guest.tableSessionId,
            userId,
            subtotal, taxAmount,
            taxLines: taxLines.length > 0 ? taxLines : undefined,
            total,
            note: input.note?.trim() ?? null,
            items: { create: itemsToCreate },
          },
          select: { id: true, total: true, createdAt: true },
        });
      }, { timeout: 30000, maxWait: 10000 });

      return order;
    }),

  // Move a round to another guest at the same table (e.g. the wrong person was charged with it)
  moveOrder: businessProcedure
    .input(z.object({ orderId: z.string().min(1), toGuestId: z.string().min(1) }))
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

      const toGuest = await ctx.db.tableGuest.findFirst({
        where: { id: input.toGuestId, tableSessionId: order.tableSessionId },
        select: { id: true, name: true },
      });
      if (!toGuest) throw new TRPCError({ code: "BAD_REQUEST", message: "El cliente destino no pertenece a esta mesa." });

      await ctx.db.tableOrder.update({ where: { id: input.orderId }, data: { tableGuestId: input.toGuestId } });
      return { message: `Pedido movido a ${toGuest.name}.` };
    }),

  // Remove a round — re-increments stock
  removeOrder: businessProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;

      const order = await ctx.db.tableOrder.findFirst({
        where: { id: input.orderId, tableSession: { businessId, status: "OPEN" } },
        select: { id: true, items: { select: { productId: true, quantity: true, product: { select: { trackStock: true } } } } },
      });
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido no encontrado." });

      await ctx.db.$transaction(async (tx) => {
        for (const item of order.items) {
          if (item.product.trackStock) {
            await adjustStock({ tx, productId: item.productId, businessId, userId, quantity: item.quantity, reason: "TABLE_ORDER_CANCEL", note: "Cancelación de pedido en mesa" });
          }
        }
        await tx.tableOrder.delete({ where: { id: input.orderId } });
      }, { timeout: 30000, maxWait: 10000 });

      return { message: "Pedido eliminado y stock restaurado." };
    }),

  // Checkout — pays for the provided guest groups.
  // keepGuests: when true, orders are cleared but guest records stay so they can order again.
  //             Session stays OPEN regardless.
  // keepGuests: false (default) — guests are removed after payment; session closes when no guests remain.
  checkout: businessProcedure
    .input(z.object({
      sessionId: z.string().min(1),
      keepGuests: z.boolean().optional().default(false),
      groups: z.array(z.object({
        guestIds: z.array(z.string().min(1)).min(1),
        paymentMethod: z.enum(PAYMENT_METHODS),
        note: z.string().trim().optional(),
        invoice: z.boolean().optional().default(false),
        receiptPath: z.string().trim().optional(),
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;

      await assertCashRegisterNotStale(ctx.db, businessId, userId);

      const session = await ctx.db.tableSession.findFirst({
        where: { id: input.sessionId, businessId, status: "OPEN" },
        select: {
          id: true, name: true,
          guests: {
            select: {
              id: true, name: true, customerId: true,
              orders: {
                select: {
                  subtotal: true, taxAmount: true, taxLines: true, total: true,
                  items: { select: { productId: true, name: true, unit: true, price: true, quantity: true, subtotal: true } },
                },
              },
            },
          },
        },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Mesa no encontrada o ya cerrada." });

      // Validate that all provided guestIds belong to this session
      const validGuestIds = new Set(session.guests.map((g) => g.id));
      const allGroupGuestIds = input.groups.flatMap((g) => g.guestIds);
      for (const id of allGroupGuestIds) {
        if (!validGuestIds.has(id)) throw new TRPCError({ code: "BAD_REQUEST", message: "Uno o más clientes no pertenecen a esta mesa." });
      }
      // Validate no duplicate guest across groups
      const coveredSet = new Set<string>();
      for (const id of allGroupGuestIds) {
        if (coveredSet.has(id)) throw new TRPCError({ code: "BAD_REQUEST", message: "Un cliente aparece en múltiples grupos de pago." });
        coveredSet.add(id);
      }

      const guestMap = new Map(session.guests.map((g) => [g.id, g]));
      assertValidCreditGroups(input.groups, guestMap);

      const result = await ctx.db.$transaction(async (tx) => {
        const sales: { id: string; invoiceNumber: string | null; total: number }[] = [];

        for (const group of input.groups) {
          const sale = await processCheckoutGroup({
            tx, businessId, userId,
            sessionId: input.sessionId, sessionName: session.name,
            group, guestMap, keepGuests: input.keepGuests,
            salesSoFar: sales.length,
          });
          if (sale) sales.push(sale);
        }

        let tableClosed = false;
        if (!input.keepGuests) {
          const remainingGuests = await tx.tableGuest.count({ where: { tableSessionId: input.sessionId } });
          if (remainingGuests === 0) {
            await tx.tableSession.update({ where: { id: input.sessionId }, data: { status: "CLOSED", closedAt: new Date() } });
            tableClosed = true;
          }
        }

        return { sales, tableClosed };
      }, { timeout: 60000, maxWait: 20000 });

      let verb: string;
      if (result.tableClosed) {
        verb = `Mesa "${session.name}" cerrada.`;
      } else if (input.keepGuests) {
        verb = "Cobro registrado. Los clientes permanecen en mesa.";
      } else {
        verb = "Cobro parcial registrado.";
      }
      return { message: `${verb} ${result.sales.length} venta(s) generada(s).`, sales: result.sales, tableClosed: result.tableClosed };
    }),

  // Close table after all guests have been paid (no stock changes).
  // Only allowed when no guest has pending orders.
  close: businessProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;

      const session = await ctx.db.tableSession.findFirst({
        where: { id: input.sessionId, businessId, status: "OPEN" },
        select: { id: true, name: true },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Mesa no encontrada o ya cerrada." });

      const guestsWithOrders = await ctx.db.tableGuest.count({
        where: { tableSessionId: input.sessionId, orders: { some: {} } },
      });
      if (guestsWithOrders > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Hay clientes con pedidos pendientes. Cóbralos primero antes de cerrar la mesa." });
      }

      await ctx.db.tableSession.update({
        where: { id: input.sessionId },
        data: { status: "CLOSED", closedAt: new Date() },
      });

      return { message: `Mesa "${session.name}" cerrada.` };
    }),

  // Cancel table — restore stock, no sales
  cancel: businessProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;

      const session = await ctx.db.tableSession.findFirst({
        where: { id: input.sessionId, businessId, status: "OPEN" },
        select: {
          id: true, name: true,
          guests: { select: { orders: { select: { items: { select: { productId: true, quantity: true, product: { select: { trackStock: true } } } } } } } },
        },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Mesa no encontrada o ya cerrada." });

      await ctx.db.$transaction(async (tx) => {
        for (const guest of session.guests) {
          for (const order of guest.orders) {
            for (const item of order.items) {
              if (item.product.trackStock) {
                await adjustStock({ tx, productId: item.productId, businessId, userId, quantity: item.quantity, reason: "TABLE_ORDER_CANCEL", note: `Cancelación de mesa: ${session.name}` });
              }
            }
          }
        }
        await tx.tableSession.update({ where: { id: input.sessionId }, data: { status: "CLOSED", closedAt: new Date() } });
      }, { timeout: 30000, maxWait: 10000 });

      return { message: `Mesa "${session.name}" cancelada. Stock restaurado.` };
    }),
});
