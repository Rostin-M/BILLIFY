import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { businessProcedure, createTRPCRouter, ownerProcedure } from "~/server/api/trpc";
import { adjustStock } from "~/server/lib/inventory";

const baseProductSchema = z.object({
  name: z.string().trim().min(2, "El nombre del producto es obligatorio"),
  price: z.number().positive("El precio debe ser mayor a cero"),
  cost: z.number().nonnegative("El costo no puede ser negativo").optional(),
  unit: z.string().trim().default("und"),
  taxSlots: z.array(z.number().int().min(0).max(2)).max(3).default([]),
  stock: z.number().int().min(0, "El stock no puede ser negativo"),
  trackStock: z.boolean().default(true),
  category: z.string().trim().optional(),
  lotNumber: z.string().trim().optional(),
  barcode: z.string().trim().optional(),
  brand: z.string().trim().optional(),
  presentation: z.string().trim().optional(),
  openPrice: z.boolean().default(false),
  soldByWeight: z.boolean().default(false),
  expiresAt: z.coerce
    .date()
    .refine((d) => d > new Date(), "La fecha de vencimiento debe ser en el futuro")
    .optional(),
});

function noOpenPriceAndWeight(v: { openPrice: boolean; soldByWeight: boolean }): boolean {
  return !(v.openPrice && v.soldByWeight);
}
const mutualExclusionRefinement: { message: string; path: (string | number)[] } = {
  message: "Un producto no puede ser 'monto libre' y 'se vende por peso' a la vez.",
  path: ["openPrice"],
};

const productSchema = baseProductSchema.refine(noOpenPriceAndWeight, mutualExclusionRefinement);

type ProductInput = z.infer<typeof baseProductSchema>;

function productData(input: ProductInput) {
  // Los productos de monto libre o por peso no tienen un conteo de unidades físicas
  // que tenga sentido descontar automáticamente — igual que trackStock: false.
  const trackStock = input.trackStock && !input.openPrice && !input.soldByWeight;
  return {
    name: input.name,
    price: input.price,
    cost: input.cost ?? null,
    unit: input.unit,
    taxSlots: input.taxSlots,
    stock: trackStock ? input.stock : 0,
    trackStock,
    category: input.category ?? null,
    lotNumber: input.lotNumber ?? null,
    barcode: input.barcode ?? null,
    brand: input.brand ?? null,
    presentation: input.presentation ?? null,
    openPrice: input.openPrice,
    soldByWeight: input.soldByWeight,
    expiresAt: input.expiresAt ?? null,
  };
}

function productAuditDetail(input: ProductInput) {
  return {
    name: input.name,
    price: input.price,
    cost: input.cost,
    unit: input.unit,
    stock: input.stock,
    category: input.category,
    lotNumber: input.lotNumber,
    expiresAt: input.expiresAt,
  };
}

async function assertBarcodeAvailable(
  db: PrismaClient,
  businessId: string,
  barcode: string,
  excludeId?: string,
) {
  const duplicate = await db.product.findFirst({
    where: { businessId, barcode, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (duplicate) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Ya existe un producto con ese código de barras.",
    });
  }
}

export const productRouter = createTRPCRouter({
  // Disponible para OWNER y CASHIER — solo productos activos, usado en inventario y venta.
  // Se ordena por cantidad vendida histórica (más vendidos primero) para que cerveza, café,
  // fritos, etc. aparezcan de primeros en la grilla de venta/mesas sin depender de categorías fijas.
  search: businessProcedure.query(async ({ ctx }) => {
    const { businessId } = ctx.session.user;

    const [products, soldByProduct] = await Promise.all([
      ctx.db.product.findMany({
        where: { businessId, isActive: true },
        select: {
          id: true,
          name: true,
          price: true,
          unit: true,
          stock: true,
          trackStock: true,
          category: true,
          barcode: true,
          taxSlots: true,
          brand: true,
          presentation: true,
          openPrice: true,
          soldByWeight: true,
        },
      }),
      ctx.db.saleItem.groupBy({
        by: ["productId"],
        where: { sale: { businessId, status: "COMPLETED" } },
        _sum: { quantity: true },
      }),
    ]);

    const soldQtyByProductId = new Map(
      soldByProduct.map((s) => [s.productId, s._sum.quantity ?? 0]),
    );

    return products.sort((a, b) => {
      const qtyDiff = (soldQtyByProductId.get(b.id) ?? 0) - (soldQtyByProductId.get(a.id) ?? 0);
      if (qtyDiff !== 0) return qtyDiff;
      return a.name.localeCompare(b.name);
    });
  }),

  // OWNER y CASHIER — catálogo completo (activos e inactivos); cost solo para OWNER
  list: businessProcedure.query(async ({ ctx }) => {
    const { businessId, role } = ctx.session.user;
    const products = await ctx.db.product.findMany({
      where: { businessId },
      select: {
        id: true,
        name: true,
        price: true,
        cost: true,
        unit: true,
        taxSlots: true,
        stock: true,
        trackStock: true,
        isActive: true,
        category: true,
        lotNumber: true,
        expiresAt: true,
        barcode: true,
        brand: true,
        presentation: true,
        openPrice: true,
        soldByWeight: true,
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
    if (role !== "OWNER") {
      return products.map(({ cost: _cost, ...rest }) => ({ ...rest, cost: null }));
    }
    return products;
  }),

  create: ownerProcedure.input(productSchema).mutation(async ({ ctx, input }) => {
    const { businessId, id: ownerId } = ctx.session.user;

    if (input.barcode) {
      await assertBarcodeAvailable(ctx.db, businessId, input.barcode);
    }

    const product = await ctx.db.product.create({
      data: { businessId, ...productData(input) },
    });

    await ctx.db.auditLog.create({
      data: {
        businessId,
        userId: ownerId,
        action: "CREATE_PRODUCT",
        entityType: "Product",
        entityId: product.id,
        detail: productAuditDetail(input),
      },
    });

    return { id: product.id, message: "Producto creado correctamente." };
  }),

  update: ownerProcedure
    .input(
      baseProductSchema
        .extend({ id: z.string().min(1) })
        .refine(noOpenPriceAndWeight, mutualExclusionRefinement),
    )
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: ownerId } = ctx.session.user;

      const existing = await ctx.db.product.findFirst({
        where: { id: input.id, businessId },
        select: { id: true },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Producto no encontrado en este negocio.",
        });
      }

      if (input.barcode) {
        await assertBarcodeAvailable(ctx.db, businessId, input.barcode, input.id);
      }

      await ctx.db.product.update({
        where: { id: input.id },
        data: productData(input),
      });

      await ctx.db.auditLog.create({
        data: {
          businessId,
          userId: ownerId,
          action: "UPDATE_PRODUCT",
          entityType: "Product",
          entityId: input.id,
          detail: productAuditDetail(input),
        },
      });

      return { message: "Producto actualizado correctamente." };
    }),

  // OWNER y CASHIER — actualizar solo el precio; genera AuditLog con usuario y cambio
  updatePrice: businessProcedure
    .input(
      z.object({
        productId: z.string().min(1),
        price: z.number().positive("El precio debe ser mayor a cero"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;

      const product = await ctx.db.product.findFirst({
        where: { id: input.productId, businessId },
        select: { id: true, name: true, price: true },
      });

      if (!product) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Producto no encontrado en este negocio.",
        });
      }

      await ctx.db.product.update({
        where: { id: input.productId },
        data: { price: input.price },
      });

      await ctx.db.auditLog.create({
        data: {
          businessId,
          userId,
          action: "UPDATE_PRICE",
          entityType: "Product",
          entityId: input.productId,
          detail: {
            name: product.name,
            precioAnterior: product.price,
            precioNuevo: input.price,
          },
        },
      });

      return { message: `Precio de "${product.name}" actualizado correctamente.` };
    }),

  adjustStock: businessProcedure
    .input(
      z.object({
        productId: z.string().min(1),
        quantity: z
          .number()
          .int()
          .refine((v) => v !== 0, "La cantidad no puede ser cero"),
        note: z.string().trim().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId } = ctx.session.user;

      const { newStock } = await ctx.db.$transaction((tx) =>
        adjustStock({
          tx,
          productId: input.productId,
          businessId,
          userId,
          quantity: input.quantity,
          reason: "MANUAL_ADJUSTMENT",
          note: input.note,
        }),
      );

      return {
        newStock,
        message:
          input.quantity > 0
            ? `Stock incrementado en ${input.quantity}. Nuevo total: ${newStock}.`
            : `Stock reducido en ${Math.abs(input.quantity)}. Nuevo total: ${newStock}.`,
      };
    }),

  listMovements: businessProcedure
    .input(z.object({ productId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const product = await ctx.db.product.findFirst({
        where: { id: input.productId, businessId: ctx.session.user.businessId },
        select: { id: true },
      });

      if (!product) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Producto no encontrado en este negocio.",
        });
      }

      return ctx.db.inventoryMovement.findMany({
        where: { productId: input.productId },
        select: {
          id: true,
          quantity: true,
          reason: true,
          note: true,
          stockAfter: true,
          createdAt: true,
          user: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
    }),

  listProductSales: businessProcedure
    .input(z.object({ productId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const product = await ctx.db.product.findFirst({
        where: { id: input.productId, businessId: ctx.session.user.businessId },
        select: { id: true },
      });
      if (!product) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Producto no encontrado en este negocio." });
      }
      return ctx.db.saleItem.findMany({
        where: {
          productId: input.productId,
          sale: { businessId: ctx.session.user.businessId, status: "COMPLETED" },
        },
        select: {
          id: true,
          quantity: true,
          price: true,
          sale: {
            select: {
              createdAt: true,
              invoiceNumber: true,
              user: { select: { name: true } },
            },
          },
        },
        orderBy: { sale: { createdAt: "desc" } },
        take: 20,
      });
    }),

  setActive: ownerProcedure
    .input(z.object({ productId: z.string().min(1), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: ownerId } = ctx.session.user;

      const product = await ctx.db.product.findFirst({
        where: { id: input.productId, businessId },
        select: { id: true, name: true },
      });

      if (!product) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Producto no encontrado en este negocio.",
        });
      }

      await ctx.db.product.update({
        where: { id: input.productId },
        data: { isActive: input.isActive },
      });

      await ctx.db.auditLog.create({
        data: {
          businessId,
          userId: ownerId,
          action: input.isActive ? "ACTIVATE_PRODUCT" : "DEACTIVATE_PRODUCT",
          entityType: "Product",
          entityId: input.productId,
          detail: { name: product.name },
        },
      });

      return {
        message: input.isActive
          ? "Producto activado correctamente."
          : "Producto desactivado correctamente.",
      };
    }),
});
