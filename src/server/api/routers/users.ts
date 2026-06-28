import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { createTRPCRouter, ownerProcedure } from "~/server/api/trpc";
import { sendEmployeeWelcomeEmail } from "~/server/lib/email";

const createEmployeeSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio"),
  document: z.string().trim().min(4, "La cédula es obligatoria"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Correo electrónico inválido"),
  password: z
    .string()
    .min(8, "La contraseña debe tener mínimo 8 caracteres")
    .regex(/[A-Za-z]/, "La contraseña debe incluir al menos una letra")
    .regex(/\d/, "La contraseña debe incluir al menos un número"),
});

export const usersRouter = createTRPCRouter({
  list: ownerProcedure.query(async ({ ctx }) => {
    return ctx.db.user.findMany({
      where: {
        businessId: ctx.session.user.businessId,
        role: "CASHIER",
      },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        canManageCash: true,
      },
      orderBy: { name: "asc" },
    });
  }),

  createEmployee: ownerProcedure
    .input(createEmployeeSchema)
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: ownerId, name: ownerName } = ctx.session.user;

      const existing = await ctx.db.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Ya existe una cuenta con este correo electrónico.",
        });
      }

      const passwordHash = await bcrypt.hash(input.password, 12);

      const employee = await ctx.db.user.create({
        data: {
          name: input.name,
          email: input.email,
          document: input.document,
          passwordHash,
          role: "CASHIER",
          isActive: true,
          businessId,
        },
      });

      await ctx.db.auditLog.create({
        data: {
          businessId,
          userId: ownerId,
          action: "CREATE_EMPLOYEE",
          entityType: "User",
          entityId: employee.id,
          detail: { name: input.name, email: input.email },
        },
      });

      // Correo de bienvenida al empleado — no bloquea si falla
      const business = await ctx.db.business.findUnique({
        where: { id: businessId },
        select: { name: true },
      });
      if (business) {
        void sendEmployeeWelcomeEmail(
          input.email,
          input.name,
          ownerName ?? "El propietario",
          business.name,
          input.email,
          input.password,
        ).catch(() => null);
      }

      return { id: employee.id, message: "Empleado creado correctamente." };
    }),

  setActive: ownerProcedure
    .input(
      z.object({
        employeeId: z.string().min(1),
        isActive: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: ownerId } = ctx.session.user;

      const employee = await ctx.db.user.findFirst({
        where: {
          id: input.employeeId,
          businessId,
          role: "CASHIER",
        },
        select: { id: true, name: true },
      });

      if (!employee) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Empleado no encontrado en este negocio.",
        });
      }

      await ctx.db.user.update({
        where: { id: input.employeeId },
        data: { isActive: input.isActive },
      });

      await ctx.db.auditLog.create({
        data: {
          businessId,
          userId: ownerId,
          action: input.isActive ? "ACTIVATE_EMPLOYEE" : "DEACTIVATE_EMPLOYEE",
          entityType: "User",
          entityId: input.employeeId,
          detail: { name: employee.name },
        },
      });

      return {
        message: input.isActive
          ? "Empleado activado correctamente."
          : "Empleado desactivado correctamente.",
      };
    }),

  setCashManagement: ownerProcedure
    .input(
      z.object({
        employeeId: z.string().min(1),
        canManageCash: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { businessId } = ctx.session.user;

      const employee = await ctx.db.user.findFirst({
        where: { id: input.employeeId, businessId, role: "CASHIER" },
        select: { id: true, name: true },
      });

      if (!employee) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Empleado no encontrado en este negocio." });
      }

      await ctx.db.user.update({
        where: { id: input.employeeId },
        data: { canManageCash: input.canManageCash },
      });

      return {
        message: input.canManageCash
          ? "Permiso de caja activado."
          : "Permiso de caja desactivado.",
      };
    }),
});
