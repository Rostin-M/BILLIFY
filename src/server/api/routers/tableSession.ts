import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { businessProcedure, createTRPCRouter } from "~/server/api/trpc";
import { adjustStock } from "~/server/lib/inventory";
import { computeSaleTotals, type TaxConfig } from "~/lib/pricing";

const PAYMENT_METHODS = ["CASH", "CARD", "CREDIT", "TRANSFER"] as const;

function generateInvoiceNumber(year: number, sequence: number): string {
  return `F-${year}-${String(sequence).padStart(5, "0")}`;
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
      items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().positive() })).min(1),
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
          select: { id: true, name: true, unit: true, price: true, stock: true, trackStock: true, taxSlots: true },
        }),
        ctx.db.business.findUnique({ where: { id: businessId }, select: { taxes: true, autoTax: true } }),
      ]);

      if (products.length !== input.items.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Uno o más productos no son válidos o están inactivos." });
      }

      const productMap = new Map(products.map((p) => [p.id, p]));
      const itemsToCreate = input.items.map((item) => {
        const p = productMap.get(item.productId)!;
        const s = p.price * item.quantity;
        return { productId: item.productId, name: p.name, unit: p.unit, price: p.price, quantity: item.quantity, subtotal: s };
      });

      const taxConfigs = (business?.taxes as TaxConfig[]) ?? [];
      const { subtotal, taxAmount, taxLines, total } = computeSaleTotals(
        input.items.map((item) => {
          const p = productMap.get(item.productId)!;
          return { price: p.price, quantity: item.quantity, taxSlots: p.taxSlots };
        }),
        taxConfigs,
        business?.autoTax ?? false,
      );

      const order = await ctx.db.$transaction(async (tx) => {
        for (const item of input.items) {
          if (productMap.get(item.productId)?.trackStock) {
            await adjustStock({ tx, productId: item.productId, businessId, userId, quantity: -item.quantity, reason: "TABLE_ORDER", note: `Mesa: ${guest.tableSessionId}` });
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
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;

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

      // Las ventas a crédito deben quedar asociadas a un único cliente registrado,
      // igual que en sale.create — de lo contrario la deuda no queda rastreable.
      for (const group of input.groups) {
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

      const result = await ctx.db.$transaction(async (tx) => {
        const sales: { id: string; invoiceNumber: string | null; total: number }[] = [];

        for (const group of input.groups) {
          type ItemAgg = { productId: string; name: string; unit: string; price: number; quantity: number; subtotal: number };
          const itemsMap = new Map<string, ItemAgg>();
          let groupSubtotal = 0;

          for (const guestId of group.guestIds) {
            for (const order of guestMap.get(guestId)!.orders) {
              groupSubtotal += order.subtotal;
              for (const item of order.items) {
                const ex = itemsMap.get(item.productId);
                if (ex) { ex.quantity += item.quantity; ex.subtotal += item.subtotal; }
                else itemsMap.set(item.productId, { ...item });
              }
            }
          }

          type TaxLine = { name: string; rate: number; amount: number };
          const taxLinesMap = new Map<string, TaxLine>();
          for (const guestId of group.guestIds) {
            for (const order of guestMap.get(guestId)!.orders) {
              if (Array.isArray(order.taxLines)) {
                for (const line of order.taxLines as TaxLine[]) {
                  const key = `${line.name}|${line.rate}`;
                  const ex = taxLinesMap.get(key);
                  if (ex) ex.amount += line.amount; else taxLinesMap.set(key, { ...line });
                }
              }
            }
          }
          const taxLines = Array.from(taxLinesMap.values());
          const groupTaxAmount = taxLines.reduce((s, t) => s + t.amount, 0);
          const groupTotal = groupSubtotal + groupTaxAmount;

          if (groupTotal > 0 && itemsMap.size > 0) {
            const year = new Date().getFullYear();
            const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
            // Shared consecutive counter: counts ALL invoices (mesa + facturadas) for this business/year
            const invoiceCount = await tx.sale.count({
              where: { businessId, invoiceNumber: { not: null }, createdAt: { gte: yearStart } },
            });
            const invoiceNumber = generateInvoiceNumber(year, invoiceCount + sales.length + 1);

            const firstWithCustomer = group.guestIds.map((id) => guestMap.get(id)!).find((g) => g.customerId);
            const guestNames = group.guestIds.map((id) => guestMap.get(id)!.name).join(", ");
            const rawNote = group.note?.trim();
            const noteText = rawNote !== undefined && rawNote.length > 0 ? rawNote : `Mesa: ${session.name} · ${guestNames}`;

            const sale = await tx.sale.create({
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
                tableSessionId: input.sessionId,
                items: { create: Array.from(itemsMap.values()) },
              },
              select: { id: true, invoiceNumber: true, total: true },
            });

            await tx.auditLog.create({
              data: { businessId, userId, action: "CREATE_SALE", entityType: "Sale", entityId: sale.id, detail: { saleType: "TABLE", tableSessionId: input.sessionId, invoiceNumber, total: groupTotal, paymentMethod: group.paymentMethod, keepGuests: input.keepGuests } },
            });

            sales.push(sale);
          }

          // Clear paid guests: remove their orders (cascade to items).
          // With keepGuests: keep the guest record so they can order again.
          // Without keepGuests: delete the guest entirely (cascade deletes orders).
          for (const guestId of group.guestIds) {
            if (input.keepGuests) {
              await tx.tableOrder.deleteMany({ where: { tableGuestId: guestId } });
            } else {
              await tx.tableGuest.delete({ where: { id: guestId } });
            }
          }
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

      const verb = result.tableClosed
        ? `Mesa "${session.name}" cerrada.`
        : input.keepGuests
          ? "Cobro registrado. Los clientes permanecen en mesa."
          : "Cobro parcial registrado.";
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
