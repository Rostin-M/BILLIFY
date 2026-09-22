import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, ownerProcedure } from "~/server/api/trpc";

const taxItemSchema = z.object({
  name: z.string().trim().min(1, "El nombre del impuesto es obligatorio"),
  rate: z.number().min(0, "La tasa no puede ser negativa").max(100, "La tasa no puede superar el 100%"),
  enabled: z.boolean(),
});

const contactSourceSchema = z.enum(["NONE", "OWNER", "BUSINESS"]);
const taxDetailSchema = z.enum(["SUMMARY", "PER_ITEM"]);

const updateSettingsSchema = z
  .object({
    name: z.string().trim().min(2, "El nombre del negocio es obligatorio"),
    address: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    email: z.string().trim().toLowerCase().email("Correo del negocio inválido").optional(),
    ownerPhone: z.string().trim().optional(),
    invoicePhoneSource: contactSourceSchema.default("NONE"),
    invoiceEmailSource: contactSourceSchema.default("NONE"),
    invoiceTaxDetail: taxDetailSchema.default("SUMMARY"),
    taxes: z.array(taxItemSchema).max(3, "Máximo 3 impuestos").default([]),
    autoTax: z.boolean().default(false),
    maxCashRegisters: z.number().int().min(1).max(10).default(1),
    categories: z
      .array(z.string().trim().min(1))
      .max(40, "Máximo 40 categorías")
      .default([]),
    produceModuleEnabled: z.boolean().default(false),
  })
  .refine((data) => data.invoicePhoneSource !== "BUSINESS" || !!data.phone, {
    message: "Ingresa el teléfono del negocio para poder mostrarlo en la factura.",
    path: ["phone"],
  })
  .refine((data) => data.invoicePhoneSource !== "OWNER" || !!data.ownerPhone, {
    message: "Ingresa tu teléfono personal para poder mostrarlo en la factura.",
    path: ["ownerPhone"],
  })
  .refine((data) => data.invoiceEmailSource !== "BUSINESS" || !!data.email, {
    message: "Ingresa el correo del negocio para poder mostrarlo en la factura.",
    path: ["email"],
  });

export const businessRouter = createTRPCRouter({
  getSettings: ownerProcedure.query(async ({ ctx }) => {
    const [business, owner] = await Promise.all([
      ctx.db.business.findUnique({
        where: { id: ctx.session.user.businessId },
        select: {
          id: true,
          name: true,
          document: true,
          address: true,
          phone: true,
          email: true,
          invoicePhoneSource: true,
          invoiceEmailSource: true,
          invoiceTaxDetail: true,
          taxes: true,
          autoTax: true,
          plan: true,
          maxCashRegisters: true,
          logoUrl: true,
          categories: true,
          produceModuleEnabled: true,
        },
      }),
      ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { phone: true, email: true },
      }),
    ]);

    if (!business) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Negocio no encontrado.",
      });
    }

    return {
      ...business,
      ownerPhone: owner?.phone ?? null,
      ownerEmail: owner?.email ?? null,
    };
  }),

  updateSettings: ownerProcedure
    .input(updateSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: ownerId } = ctx.session.user;

      const [business] = await Promise.all([
        ctx.db.business.update({
          where: { id: businessId },
          data: {
            name: input.name,
            address: input.address ?? null,
            phone: input.phone ?? null,
            email: input.email ?? null,
            invoicePhoneSource: input.invoicePhoneSource,
            invoiceEmailSource: input.invoiceEmailSource,
            invoiceTaxDetail: input.invoiceTaxDetail,
            taxes: input.taxes,
            autoTax: input.autoTax,
            maxCashRegisters: input.maxCashRegisters,
            categories: input.categories,
            produceModuleEnabled: input.produceModuleEnabled,
          },
          select: { id: true, name: true },
        }),
        ctx.db.user.update({
          where: { id: ownerId },
          data: { phone: input.ownerPhone ?? null },
        }),
      ]);

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
            categories: input.categories,
          },
        },
      });

      return { message: "Configuración guardada correctamente." };
    }),
});
