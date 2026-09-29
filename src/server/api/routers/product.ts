import { TRPCError } from "@trpc/server";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import { businessProcedure, createTRPCRouter, ownerProcedure } from "~/server/api/trpc";
import { adjustStock } from "~/server/lib/inventory";

const MAX_MONEY = 1e9;
const MAX_STOCK = 10_000_000;
const MAX_ADJUST_QUANTITY = 100000;

const priceSchema = z
  .number()
  .finite()
  .positive("El precio debe ser mayor a cero")
  .max(MAX_MONEY, "El precio es demasiado alto");

const baseProductSchema = z.object({
  name: z.string().trim().min(2, "El nombre del producto es obligatorio").max(120, "El nombre es demasiado largo"),
  price: priceSchema,
  cost: z.number().finite().nonnegative("El costo no puede ser negativo").max(MAX_MONEY).optional(),
  unit: z.string().trim().max(20).default("und"),
  taxSlots: z.array(z.number().int().min(0).max(2)).max(3).default([]),
  stock: z.number().int().min(0, "El stock no puede ser negativo").max(MAX_STOCK, "Stock demasiado grande"),
  trackStock: z.boolean().default(true),
  category: z.string().trim().max(120).optional(),
  lotNumber: z.string().trim().max(64).optional(),
  barcode: z.string().trim().max(64, "El código de barras es demasiado largo").optional(),
  brand: z.string().trim().max(120).optional(),
  presentation: z.string().trim().max(120).optional(),
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

// Permiso de cambio de precio: el owner siempre; el cajero solo si el owner lo habilitó.
// Se lee fresco de la BD para que retirar el permiso tenga efecto inmediato.
async function canEditPrices(
  db: Prisma.TransactionClient,
  businessId: string,
  role: string,
): Promise<boolean> {
  if (role === "OWNER") return true;
  const business = await db.business.findUnique({
    where: { id: businessId },
    select: { cashiersCanEditPrices: true },
  });
  return business?.cashiersCanEditPrices ?? false;
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
  // Permisos del usuario actual sobre el catálogo (la UI oculta controles según esto)
  permissions: businessProcedure.query(async ({ ctx }) => {
    const { businessId, role } = ctx.session.user;
    return { canEditPrices: await canEditPrices(ctx.db, businessId, role) };
  }),

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
        .extend({ id: z.string().min(1).max(64) })
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

  // OWNER siempre; CASHIER solo si el negocio lo habilitó — actualizar solo el precio;
  // genera AuditLog con usuario y cambio
  updatePrice: businessProcedure
    .input(
      z.object({
        productId: z.string().min(1).max(64),
        price: priceSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId, role } = ctx.session.user;

      if (!(await canEditPrices(ctx.db, businessId, role))) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "El propietario no ha habilitado el cambio de precios para cajeros.",
        });
      }

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

      await ctx.db.$transaction([
        ctx.db.product.updateMany({
          where: { id: product.id, businessId },
          data: { price: input.price },
        }),
        ctx.db.auditLog.create({
          data: {
            businessId,
            userId,
            action: "UPDATE_PRICE",
            entityType: "Product",
            entityId: product.id,
            detail: {
              name: product.name,
              role,
              precioAnterior: product.price,
              precioNuevo: input.price,
            },
          },
        }),
      ]);

      return { message: `Precio de "${product.name}" actualizado correctamente.` };
    }),

  // OWNER y CASHIER — ajuste manual de stock; queda registrado en AuditLog (antes/después/motivo)
  adjustStock: businessProcedure
    .input(
      z.object({
        productId: z.string().min(1).max(64),
        quantity: z
          .number()
          .int()
          .min(-MAX_ADJUST_QUANTITY, "Cantidad demasiado grande")
          .max(MAX_ADJUST_QUANTITY, "Cantidad demasiado grande")
          .refine((v) => v !== 0, "La cantidad no puede ser cero"),
        note: z.string().trim().max(500, "El motivo es demasiado largo (máx. 500 caracteres)").optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: userId, role } = ctx.session.user;

      const { newStock } = await ctx.db.$transaction(async (tx) => {
        const result = await adjustStock({
          tx,
          productId: input.productId,
          businessId,
          userId,
          quantity: input.quantity,
          reason: "MANUAL_ADJUSTMENT",
          note: input.note,
        });

        const product = await tx.product.findFirst({
          where: { id: input.productId, businessId },
          select: { name: true },
        });

        await tx.auditLog.create({
          data: {
            businessId,
            userId,
            action: "ADJUST_STOCK",
            entityType: "Product",
            entityId: input.productId,
            detail: {
              name: product?.name ?? null,
              role,
              stockAnterior: result.previousStock,
              stockNuevo: result.newStock,
              cantidad: input.quantity,
              motivo: input.note ?? null,
            },
          },
        });

        return result;
      });

      return {
        newStock,
        message:
          input.quantity > 0
            ? `Stock incrementado en ${input.quantity}. Nuevo total: ${newStock}.`
            : `Stock reducido en ${Math.abs(input.quantity)}. Nuevo total: ${newStock}.`,
      };
    }),

  listMovements: businessProcedure
    .input(z.object({ productId: z.string().min(1).max(64) }))
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
        where: { productId: input.productId, businessId: ctx.session.user.businessId },
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
    .input(z.object({ productId: z.string().min(1).max(64) }))
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
    .input(z.object({ productId: z.string().min(1).max(64), isActive: z.boolean() }))
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
