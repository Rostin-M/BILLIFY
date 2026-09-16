import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { businessProcedure, createTRPCRouter, ownerProcedure } from "~/server/api/trpc";
import { adjustStock } from "~/server/lib/inventory";
import { bogotaStartOfDay, getPeriodRangeBogota } from "~/server/lib/bogotaTime";
import { sendInvoiceEmail } from "~/server/lib/email";
import { generateFacturaPdfBuffer } from "~/server/lib/generateFacturaPdf";

const PAYMENT_METHODS = ["CASH", "CARD", "CREDIT", "TRANSFER"] as const;

const saleItemInput = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive("La cantidad debe ser mayor a cero"),
});

function generateInvoiceNumber(year: number, sequence: number): string {
  return `F-${year}-${String(sequence).padStart(5, "0")}`;
}

type TaxLine = { name: string; rate: number; amount: number };

export const saleRouter = createTRPCRouter({
  create: businessProcedure
    .input(
      z.object({
        items: z.array(saleItemInput).min(1, "La venta debe tener al menos un producto"),
        saleType: z.enum(["QUICK", "INVOICED"]).default("QUICK"),
        paymentMethod: z.enum(PAYMENT_METHODS).default("CASH"),
        customerId: z.string().optional(),
        note: z.string().trim().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;

      if (input.paymentMethod === "CREDIT" && !input.customerId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Las ventas a crédito requieren seleccionar un cliente registrado.",
        });
      }

      const [products, business] = await Promise.all([
        ctx.db.product.findMany({
          where: { id: { in: input.items.map((i) => i.productId) }, businessId, isActive: true },
          select: { id: true, name: true, unit: true, price: true, stock: true, trackStock: true },
        }),
        ctx.db.business.findUnique({
          where: { id: businessId },
          select: { taxes: true, autoTax: true },
        }),
      ]);

      if (products.length !== input.items.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Uno o más productos no son válidos o están inactivos.",
        });
      }

      const productMap = new Map(products.map((p) => [p.id, p]));

      let subtotal = 0;
      const itemsToCreate = input.items.map((item) => {
        const product = productMap.get(item.productId)!;
        const itemSubtotal = product.price * item.quantity;
        subtotal += itemSubtotal;
        return { productId: item.productId, name: product.name, unit: product.unit, price: product.price, quantity: item.quantity, subtotal: itemSubtotal };
      });

      const taxConfigs = (business?.taxes as Array<{ name: string; rate: number; enabled: boolean }>) ?? [];
      const autoTax = business?.autoTax ?? false;
      const activeTaxes = autoTax ? taxConfigs.filter((t) => t.enabled && t.rate > 0) : [];

      let taxAmount = 0;
      const taxLines: TaxLine[] = [];
      for (const tax of activeTaxes) {
        const lineAmt = subtotal * (tax.rate / 100);
        taxAmount += lineAmt;
        taxLines.push({ name: tax.name, rate: tax.rate, amount: lineAmt });
      }
      const total = subtotal + taxAmount;

      const sale = await ctx.db.$transaction(async (tx) => {
        let invoiceNumber: string | null = null;
        if (input.saleType === "INVOICED") {
          const year = new Date().getFullYear();
          const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
          // Shared counter with table checkouts: count ALL invoices (INVOICED + TABLE) for this business/year
          const count = await tx.sale.count({
            where: { businessId, invoiceNumber: { not: null }, createdAt: { gte: yearStart } },
          });
          invoiceNumber = generateInvoiceNumber(year, count + 1);
        }

        for (const item of input.items) {
          const product = productMap.get(item.productId);
          if (product?.trackStock) {
            await adjustStock({ tx, productId: item.productId, businessId, userId, quantity: -item.quantity, reason: "SALE", note: invoiceNumber ?? undefined });
          }
        }

        const newSale = await tx.sale.create({
          data: {
            businessId, userId, customerId: input.customerId ?? null, saleType: input.saleType,
            invoiceNumber, paymentMethod: input.paymentMethod, subtotal, taxAmount,
            taxLines: taxLines.length > 0 ? taxLines : undefined,
            total,
            note: input.note ?? null, items: { create: itemsToCreate },
          },
          select: { id: true, total: true, invoiceNumber: true, saleType: true },
        });

        await tx.auditLog.create({
          data: {
            businessId, userId, action: "CREATE_SALE", entityType: "Sale", entityId: newSale.id,
            detail: { saleType: input.saleType, invoiceNumber, total, paymentMethod: input.paymentMethod, itemCount: input.items.length },
          },
        });

        return newSale;
      }, { timeout: 30000, maxWait: 10000 });

      const message =
        sale.saleType === "INVOICED"
          ? `Factura ${sale.invoiceNumber} registrada correctamente.`
          : "Venta registrada correctamente.";

      return { id: sale.id, total: sale.total, invoiceNumber: sale.invoiceNumber, message };
    }),

  list: businessProcedure
    .input(z.object({ date: z.coerce.date().optional() }))
    .query(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;

      // Use Bogotá timezone boundaries
      const from = bogotaStartOfDay(input.date ?? new Date());
      const to = new Date(from.getTime() + 24 * 60 * 60 * 1000 - 1);

      return ctx.db.sale.findMany({
        where: { businessId, createdAt: { gte: from, lte: to } },
        select: {
          id: true, saleType: true, invoiceNumber: true, status: true, total: true,
          subtotal: true, taxAmount: true, taxLines: true, paymentMethod: true, createdAt: true,
          note: true, voidedAt: true, voidReason: true,
          user: { select: { name: true } },
          customer: { select: { name: true } },
          items: { select: { name: true, unit: true, quantity: true, price: true, subtotal: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  void: ownerProcedure
    .input(
      z.object({
        saleId: z.string().min(1),
        reason: z.string().trim().min(3, "El motivo de anulación es obligatorio (mín. 3 caracteres)"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;

      const sale = await ctx.db.sale.findFirst({
        where: { id: input.saleId, businessId },
        select: {
          id: true, status: true, invoiceNumber: true,
          items: {
            select: {
              productId: true, quantity: true,
              product: { select: { trackStock: true } },
            },
          },
        },
      });

      if (!sale) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Venta no encontrada en este negocio." });
      }
      if (sale.status !== "COMPLETED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Solo se pueden anular ventas en estado completado." });
      }

      await ctx.db.$transaction(async (tx) => {
        for (const item of sale.items) {
          if (item.product.trackStock) {
            await adjustStock({ tx, productId: item.productId, businessId, userId, quantity: item.quantity, reason: "RETURN", note: `Anulación: ${input.reason}` });
          }
        }
        await tx.sale.update({
          where: { id: input.saleId },
          data: { status: "VOIDED", voidedAt: new Date(), voidReason: input.reason },
        });
        await tx.auditLog.create({
          data: {
            businessId, userId, action: "VOID_SALE", entityType: "Sale", entityId: input.saleId,
            detail: { reason: input.reason, invoiceNumber: sale.invoiceNumber, itemCount: sale.items.length },
          },
        });
      });

      return { message: "Venta anulada correctamente. El stock ha sido restaurado." };
    }),

  // ─── Bloque 3: Enviar factura PDF por correo ──────────────────────────────
  sendInvoiceEmail: businessProcedure
    .input(
      z.object({
        saleId: z.string().min(1),
        customerEmail: z.string().trim().toLowerCase().email("Correo del cliente inválido"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;

      const [sale, business] = await Promise.all([
        ctx.db.sale.findFirst({
          where: { id: input.saleId, businessId },
          select: {
            id: true,
            invoiceNumber: true,
            createdAt: true,
            paymentMethod: true,
            subtotal: true,
            taxAmount: true,
            taxLines: true,
            total: true,
            note: true,
            status: true,
            customer: { select: { name: true, document: true } },
            user: { select: { name: true } },
            items: { select: { name: true, unit: true, quantity: true, price: true, subtotal: true } },
          },
        }),
        ctx.db.business.findUnique({
          where: { id: businessId },
          select: { name: true, document: true, address: true, phone: true, logoUrl: true },
        }),
      ]);

      if (!sale || !business) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Venta no encontrada." });
      }
      if (!sale.invoiceNumber) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Solo se pueden enviar por correo las ventas con número de factura.",
        });
      }

      const pdfBuffer = await generateFacturaPdfBuffer(
        { name: business.name, document: business.document, address: business.address, phone: business.phone, logoUrl: business.logoUrl },
        {
          invoiceNumber: sale.invoiceNumber,
          createdAt: sale.createdAt,
          customer: sale.customer ?? null,
          user: sale.user,
          items: sale.items,
          subtotal: sale.subtotal,
          taxAmount: sale.taxAmount,
          taxLines: sale.taxLines as TaxLine[] | null,
          total: sale.total,
          paymentMethod: sale.paymentMethod,
          note: sale.note,
        },
      );

      await sendInvoiceEmail(input.customerEmail, sale.invoiceNumber, business.name, pdfBuffer);

      return { message: `Factura ${sale.invoiceNumber} enviada a ${input.customerEmail}.` };
    }),

  // Exportación completa de ventas del período (para CSV)
  exportForPeriod: ownerProcedure
    .input(z.object({ period: z.enum(["today", "week", "month"]) }))
    .query(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;
      const { from, to } = getPeriodRangeBogota(input.period);

      return ctx.db.sale.findMany({
        where: { businessId, createdAt: { gte: from, lte: to } },
        select: {
          id: true, createdAt: true, status: true, saleType: true, invoiceNumber: true,
          paymentMethod: true, subtotal: true, taxAmount: true, total: true,
          note: true, voidReason: true,
          customer: { select: { name: true, document: true } },
          user: { select: { name: true } },
          items: { select: { name: true, unit: true, quantity: true, price: true, subtotal: true } },
        },
        orderBy: { createdAt: "asc" },
      });
    }),
});
