import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { businessProcedure, createTRPCRouter, ownerProcedure } from "~/server/api/trpc";
import { adjustStock, stockToRestore } from "~/server/lib/inventory";
import { assertCashRegisterNotStale, resolveSaleCashRegisterId } from "~/server/lib/cashRegisterGuard";
import { idempotencyKeySchema, runIdempotent } from "~/server/lib/idempotency";
import { nextInvoiceNumber } from "~/server/lib/invoiceNumber";
import { enforceRateLimits, RATE_LIMITS } from "~/server/lib/rateLimit";
import { bogotaStartOfDay, getPeriodRangeBogota } from "~/server/lib/bogotaTime";
import { sendInvoiceEmail } from "~/server/lib/email";
import { generateFacturaPdfBuffer } from "~/server/lib/generateFacturaPdf";
import { computeItemTaxBreakdown, computeSaleTotals, type TaxConfig, type TaxLine } from "~/lib/pricing";
import { resolveInvoiceContact } from "~/lib/invoiceContact";
import { createSupabaseServiceClient, RECEIPTS_BUCKET } from "~/lib/supabase-server";
import {
  assertReceiptPath,
  isValidReceiptPath,
  MAX_SALE_ITEMS,
  resolveSaleItem,
  saleItemInputSchema,
} from "~/server/lib/resolveSaleItem";

const PAYMENT_METHODS = ["CASH", "CARD", "CREDIT", "TRANSFER"] as const;

function saleResultMessage(sale: { saleType: string; invoiceNumber: string | null }): string {
  return sale.saleType === "INVOICED"
    ? `Factura ${sale.invoiceNumber} registrada correctamente.`
    : "Venta registrada correctamente.";
}

export const saleRouter = createTRPCRouter({
  create: businessProcedure
    .input(
      z.object({
        items: z
          .array(saleItemInputSchema)
          .min(1, "La venta debe tener al menos un producto")
          .max(MAX_SALE_ITEMS, `Máximo ${MAX_SALE_ITEMS} productos por venta`),
        saleType: z.enum(["QUICK", "INVOICED"]).default("QUICK"),
        paymentMethod: z.enum(PAYMENT_METHODS).default("CASH"),
        customerId: z.string().min(1).max(64).optional(),
        note: z.string().trim().max(500).optional(),
        receiptPath: z.string().trim().max(300).optional(),
        idempotencyKey: idempotencyKeySchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;

      const createSale = async () => {
        await assertCashRegisterNotStale(ctx.db, businessId, userId);

        if (input.paymentMethod === "CREDIT" && !input.customerId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Las ventas a crédito requieren seleccionar un cliente registrado.",
          });
        }

        // El cliente debe pertenecer a este negocio — nunca confiar en un id enviado por el navegador.
        if (input.customerId) {
          const customer = await ctx.db.customer.findFirst({
            where: { id: input.customerId, businessId, isActive: true },
            select: { id: true },
          });
          if (!customer) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado en este negocio." });
          }
        }

        const receiptPath =
          input.paymentMethod === "TRANSFER" ? assertReceiptPath(businessId, input.receiptPath) : null;

        const [products, business] = await Promise.all([
          ctx.db.product.findMany({
            where: { id: { in: input.items.map((i) => i.productId) }, businessId, isActive: true },
            select: { id: true, name: true, unit: true, price: true, trackStock: true, taxSlots: true, openPrice: true, soldByWeight: true },
          }),
          ctx.db.business.findUnique({
            where: { id: businessId },
            select: { taxes: true, autoTax: true },
          }),
        ]);

        // Un mismo producto puede venir en varias líneas (p. ej. dos pesajes): comparar con los ids distintos.
        if (products.length !== new Set(input.items.map((i) => i.productId)).size) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Uno o más productos no son válidos o están inactivos.",
          });
        }

        const productMap = new Map(products.map((p) => [p.id, p]));
        const taxConfigs = (business?.taxes as TaxConfig[]) ?? [];
        const autoTax = business?.autoTax ?? false;

        const resolvedItems = input.items.map((item) => resolveSaleItem(productMap.get(item.productId)!, item));

        const itemsToCreate = resolvedItems.map((resolved) => {
          const itemTaxLines = autoTax
            ? computeItemTaxBreakdown(
                { price: resolved.price, quantity: resolved.quantity, taxSlots: resolved.taxSlots },
                taxConfigs,
              ).taxLines
            : [];
          return {
            productId: resolved.productId,
            name: resolved.name,
            unit: resolved.unit,
            price: resolved.price,
            quantity: resolved.quantity,
            subtotal: resolved.subtotal,
            taxLines: itemTaxLines.length > 0 ? itemTaxLines : undefined,
            // Lo que realmente se descuenta del stock: al anular se devuelve exactamente esto.
            stockDeducted: resolved.stockDelta,
          };
        });

        const { subtotal, taxAmount, taxLines, total } = computeSaleTotals(
          resolvedItems.map((resolved) => ({
            price: resolved.price,
            quantity: resolved.quantity,
            taxSlots: resolved.taxSlots,
          })),
          taxConfigs,
          autoTax,
        );

        const sale = await ctx.db.$transaction(async (tx) => {
          let invoiceNumber: string | null = null;
          if (input.saleType === "INVOICED") {
            // Consecutivo compartido con los cobros de mesa, reservado atómicamente
            invoiceNumber = await nextInvoiceNumber(tx, businessId);
          }

          for (const resolved of resolvedItems) {
            if (resolved.stockDelta > 0) {
              await adjustStock({ tx, productId: resolved.productId, businessId, userId, quantity: -resolved.stockDelta, reason: "SALE", note: invoiceNumber ?? undefined });
            }
          }

          // Caja en la que entra el dinero (la del vendedor o la única abierta).
          const cashRegisterId = await resolveSaleCashRegisterId(tx, businessId, userId);

          const newSale = await tx.sale.create({
            data: {
              businessId, userId, cashRegisterId, customerId: input.customerId ?? null, saleType: input.saleType,
              invoiceNumber, paymentMethod: input.paymentMethod, subtotal, taxAmount,
              taxLines: taxLines.length > 0 ? taxLines : undefined,
              total,
              note: input.note ?? null,
              receiptPath,
              idempotencyKey: input.idempotencyKey ?? null,
              items: { create: itemsToCreate },
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

        return { id: sale.id, total: sale.total, invoiceNumber: sale.invoiceNumber, message: saleResultMessage(sale) };
      };

      // Reintento o doble clic con la misma clave → devolver la venta ya registrada.
      return runIdempotent({
        key: input.idempotencyKey,
        findExisting: async () => {
          const existing = await ctx.db.sale.findFirst({
            where: { businessId, idempotencyKey: input.idempotencyKey },
            select: { id: true, total: true, invoiceNumber: true, saleType: true },
          });
          return existing
            ? { id: existing.id, total: existing.total, invoiceNumber: existing.invoiceNumber, message: saleResultMessage(existing) }
            : null;
        },
        run: createSale,
      });
    }),

  list: businessProcedure
    .input(z.object({ date: z.coerce.date().optional() }))
    .query(({ ctx, input }) => {
      const { businessId } = ctx.session.user;

      // Use Bogotá timezone boundaries
      const from = bogotaStartOfDay(input.date ?? new Date());
      const to = new Date(from.getTime() + 24 * 60 * 60 * 1000 - 1);

      return ctx.db.sale.findMany({
        where: { businessId, createdAt: { gte: from, lte: to } },
        select: {
          id: true, saleType: true, invoiceNumber: true, status: true, total: true,
          subtotal: true, taxAmount: true, taxLines: true, paymentMethod: true, createdAt: true,
          note: true, voidedAt: true, voidReason: true, receiptPath: true,
          user: { select: { name: true } },
          customer: { select: { name: true } },
          items: { select: { id: true, name: true, unit: true, quantity: true, price: true, subtotal: true, taxLines: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  // Devuelve una URL firmada y temporal del comprobante — el bucket es privado
  getReceiptUrl: businessProcedure
    .input(z.object({ saleId: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;
      const sale = await ctx.db.sale.findFirst({
        where: { id: input.saleId, businessId },
        select: { receiptPath: true },
      });
      // Solo se firman archivos dentro de la carpeta de este negocio
      if (!sale?.receiptPath || !isValidReceiptPath(businessId, sale.receiptPath)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Esta venta no tiene comprobante adjunto." });
      }

      const supabase = createSupabaseServiceClient();
      const { data, error } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .createSignedUrl(sale.receiptPath, 300);

      if (error || !data) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo generar el enlace del comprobante." });
      }
      return { url: data.signedUrl };
    }),

  void: ownerProcedure
    .input(
      z.object({
        saleId: z.string().min(1).max(64),
        reason: z
          .string()
          .trim()
          .min(3, "El motivo de anulación es obligatorio (mín. 3 caracteres)")
          .max(500, "El motivo es demasiado largo (máx. 500 caracteres)"),
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
              productId: true, quantity: true, stockDeducted: true,
              product: { select: { trackStock: true, openPrice: true, soldByWeight: true } },
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
        // Transición de estado condicional: si dos anulaciones llegan a la vez, solo una
        // cambia la fila y solo esa restaura el stock.
        const { count } = await tx.sale.updateMany({
          where: { id: input.saleId, businessId, status: "COMPLETED" },
          data: { status: "VOIDED", voidedAt: new Date(), voidReason: input.reason },
        });
        if (count !== 1) {
          throw new TRPCError({ code: "CONFLICT", message: "Esta venta ya fue anulada." });
        }
        for (const item of sale.items) {
          const quantity = stockToRestore(item);
          if (quantity > 0) {
            await adjustStock({ tx, productId: item.productId, businessId, userId, quantity, reason: "RETURN", note: `Anulación: ${input.reason}` });
          }
        }
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
        saleId: z.string().min(1).max(64),
        customerEmail: z.string().trim().toLowerCase().max(254).email("Correo del cliente inválido"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;

      // Límite por usuario, por negocio (hora) y techo diario por negocio:
      // evita usar el remitente de BILLIFY para enviar correos masivos.
      await enforceRateLimits(
        [
          { key: `invoice-mail:user:${userId}`, rule: RATE_LIMITS.invoiceEmailByUser },
          { key: `invoice-mail:biz:${businessId}`, rule: RATE_LIMITS.invoiceEmailByBusiness },
          { key: `invoice-mail:biz-day:${businessId}`, rule: RATE_LIMITS.invoiceEmailByBusinessDaily },
        ],
        "Se alcanzó el límite de facturas enviadas por correo. Inténtalo de nuevo más tarde.",
      );

      const [sale, business, owner] = await Promise.all([
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
            items: { select: { id: true, name: true, unit: true, quantity: true, price: true, subtotal: true, taxLines: true } },
          },
        }),
        ctx.db.business.findUnique({
          where: { id: businessId },
          select: {
            name: true,
            document: true,
            address: true,
            phone: true,
            email: true,
            invoicePhoneSource: true,
            invoiceEmailSource: true,
            invoiceTaxDetail: true,
            logoUrl: true,
          },
        }),
        ctx.db.user.findFirst({
          where: { businessId, role: "OWNER" },
          select: { phone: true, email: true },
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
      if (sale.status !== "COMPLETED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No se puede enviar una factura anulada." });
      }

      const pdfBuffer = await generateFacturaPdfBuffer(
        {
          name: business.name,
          document: business.document,
          address: business.address,
          phone: resolveInvoiceContact(business.invoicePhoneSource, owner?.phone ?? null, business.phone),
          email: resolveInvoiceContact(business.invoiceEmailSource, owner?.email ?? null, business.email),
          invoiceTaxDetail: business.invoiceTaxDetail,
          logoUrl: business.logoUrl,
        },
        {
          invoiceNumber: sale.invoiceNumber,
          createdAt: sale.createdAt,
          customer: sale.customer ?? null,
          user: sale.user,
          items: sale.items.map((item) => ({
            ...item,
            taxLines: item.taxLines as TaxLine[] | null,
          })),
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
    .query(({ ctx, input }) => {
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
