import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { getPlan } from "~/lib/subscription/catalog";
import { createTRPCRouter, ownerProcedure } from "~/server/api/trpc";

// Límites de longitud: evitan payloads gigantes sin romper los datos válidos actuales
const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label}: máximo ${max} caracteres`).optional();

const taxItemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre del impuesto es obligatorio")
    .max(40, "El nombre del impuesto admite máximo 40 caracteres"),
  rate: z
    .number()
    .finite("La tasa debe ser un número válido")
    .min(0, "La tasa no puede ser negativa")
    .max(100, "La tasa no puede superar el 100%"),
  enabled: z.boolean(),
});

const contactSourceSchema = z.enum(["NONE", "OWNER", "BUSINESS"]);
const taxDetailSchema = z.enum(["SUMMARY", "PER_ITEM"]);

const updateSettingsSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "El nombre del negocio es obligatorio")
      .max(80, "El nombre del negocio admite máximo 80 caracteres"),
    address: optionalText(200, "Dirección"),
    phone: optionalText(20, "Teléfono del negocio"),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254, "El correo admite máximo 254 caracteres")
      .email("Correo del negocio inválido")
      .optional(),
    ownerPhone: optionalText(20, "Teléfono personal"),
    invoicePhoneSource: contactSourceSchema.default("NONE"),
    invoiceEmailSource: contactSourceSchema.default("NONE"),
    invoiceTaxDetail: taxDetailSchema.default("SUMMARY"),
    taxes: z.array(taxItemSchema).max(3, "Máximo 3 impuestos").default([]),
    autoTax: z.boolean().default(false),
    maxCashRegisters: z.number().int().min(1).max(10).default(1),
    categories: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(50, "Cada categoría admite máximo 50 caracteres"),
      )
      .max(40, "Máximo 40 categorías")
      .default([]),
    produceModuleEnabled: z.boolean().default(false),
    // Opcional: si un cliente viejo no lo envía, se conserva el valor guardado
    cashiersCanEditPrices: z.boolean().optional(),
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
          cashiersCanEditPrices: true,
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

      const plan = getPlan(ctx.subscription.billing.plan);
      if (input.maxCashRegisters > plan.limits.cashRegisters) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Tu plan ${plan.name} permite máximo ${plan.limits.cashRegisters} caja${
            plan.limits.cashRegisters > 1 ? "s" : ""
          } abierta${plan.limits.cashRegisters > 1 ? "s" : ""} al mismo tiempo.`,
        });
      }

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
            ...(input.cashiersCanEditPrices !== undefined && {
              cashiersCanEditPrices: input.cashiersCanEditPrices,
            }),
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
            produceModuleEnabled: input.produceModuleEnabled,
            cashiersCanEditPrices: input.cashiersCanEditPrices,
          },
        },
      });

      return { message: "Configuración guardada correctamente." };
    }),
});
