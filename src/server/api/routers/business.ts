import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, ownerProcedure } from "~/server/api/trpc";

const taxItemSchema = z.object({
  name: z.string().trim().min(1, "El nombre del impuesto es obligatorio"),
  rate: z.number().min(0, "La tasa no puede ser negativa").max(100, "La tasa no puede superar el 100%"),
  enabled: z.boolean(),
});

const updateSettingsSchema = z.object({
  name: z.string().trim().min(2, "El nombre del negocio es obligatorio"),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  taxes: z.array(taxItemSchema).max(3, "Máximo 3 impuestos").default([]),
  autoTax: z.boolean().default(false),
  maxCashRegisters: z.number().int().min(1).max(10).default(1),
});

export const businessRouter = createTRPCRouter({
  getSettings: ownerProcedure.query(async ({ ctx }) => {
    const business = await ctx.db.business.findUnique({
      where: { id: ctx.session.user.businessId },
      select: {
        id: true,
        name: true,
        document: true,
        address: true,
        phone: true,
        taxes: true,
        autoTax: true,
        plan: true,
        maxCashRegisters: true,
        logoUrl: true,
      },
    });

    if (!business) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Negocio no encontrado.",
      });
    }

    return business;
  }),

  updateSettings: ownerProcedure
    .input(updateSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: ownerId } = ctx.session.user;

      const business = await ctx.db.business.update({
        where: { id: businessId },
        data: {
          name: input.name,
          address: input.address ?? null,
          phone: input.phone ?? null,
          taxes: input.taxes,
          autoTax: input.autoTax,
          maxCashRegisters: input.maxCashRegisters,
        },
        select: { id: true, name: true },
      });

      await ctx.db.auditLog.create({
        data: {
          businessId,
          userId: ownerId,
          action: "UPDATE_BUSINESS_SETTINGS",
          entityType: "Business",
          entityId: business.id,
          detail: {
            name: input.name,
            taxes: input.taxes,
            autoTax: input.autoTax,
            maxCashRegisters: input.maxCashRegisters,
          },
        },
      });

      return { message: "Configuración guardada correctamente." };
    }),
});
