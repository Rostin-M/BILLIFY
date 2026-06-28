import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { businessProcedure, createTRPCRouter, ownerProcedure } from "~/server/api/trpc";
import { adjustStock } from "~/server/lib/inventory";

const productSchema = z.object({
  name: z.string().trim().min(2, "El nombre del producto es obligatorio"),
  price: z.number().positive("El precio debe ser mayor a cero"),
  cost: z.number().nonnegative("El costo no puede ser negativo").optional(),
  unit: z.string().trim().default("und"),
  taxRate: z.number().min(0, "La tasa no puede ser negativa").max(100).optional(),
  stock: z.number().int().min(0, "El stock no puede ser negativo"),
  trackStock: z.boolean().default(true),
  category: z.string().trim().optional(),
  lotNumber: z.string().trim().optional(),
  expiresAt: z.coerce
    .date()
    .refine((d) => d > new Date(), "La fecha de vencimiento debe ser en el futuro")
    .optional(),
});

export const productRouter = createTRPCRouter({
  // Disponible para OWNER y CASHIER — solo productos activos, usado en inventario y venta
  search: businessProcedure.query(async ({ ctx }) => {
    const { businessId } = ctx.session.user;

    return ctx.db.product.findMany({
      where: { businessId, isActive: true },
      select: {
        id: true,
        name: true,
        price: true,
        unit: true,
        stock: true,
        trackStock: true,
        category: true,
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
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
        taxRate: true,
        stock: true,
        trackStock: true,
        isActive: true,
        category: true,
        lotNumber: true,
        expiresAt: true,
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

    const product = await ctx.db.product.create({
      data: {
        businessId,
        name: input.name,
        price: input.price,
        cost: input.cost ?? null,
        unit: input.unit,
        taxRate: input.taxRate ?? null,
        stock: input.trackStock ? input.stock : 0,
        trackStock: input.trackStock,
        category: input.category ?? null,
        lotNumber: input.lotNumber ?? null,
        expiresAt: input.expiresAt ?? null,
      },
    });

    await ctx.db.auditLog.create({
      data: {
        businessId,
        userId: ownerId,
        action: "CREATE_PRODUCT",
        entityType: "Product",
        entityId: product.id,
        detail: {
          name: input.name,
          price: input.price,
          cost: input.cost,
          unit: input.unit,
          stock: input.stock,
          category: input.category,
          lotNumber: input.lotNumber,
          expiresAt: input.expiresAt,
        },
      },
    });

    return { id: product.id, message: "Producto creado correctamente." };
  }),

  update: ownerProcedure
    .input(productSchema.extend({ id: z.string().min(1) }))
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

      await ctx.db.product.update({
        where: { id: input.id },
        data: {
          name: input.name,
          price: input.price,
          cost: input.cost ?? null,
          unit: input.unit,
          taxRate: input.taxRate ?? null,
          stock: input.trackStock ? input.stock : 0,
          trackStock: input.trackStock,
          category: input.category ?? null,
          lotNumber: input.lotNumber ?? null,
          expiresAt: input.expiresAt ?? null,
        },
      });

      await ctx.db.auditLog.create({
        data: {
          businessId,
          userId: ownerId,
          action: "UPDATE_PRODUCT",
          entityType: "Product",
          entityId: input.id,
          detail: {
            name: input.name,
            price: input.price,
            cost: input.cost,
            unit: input.unit,
            stock: input.stock,
            category: input.category,
            lotNumber: input.lotNumber,
            expiresAt: input.expiresAt,
          },
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
