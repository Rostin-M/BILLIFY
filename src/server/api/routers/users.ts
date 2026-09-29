import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { z } from "zod";

import { passwordPolicySchema } from "~/server/api/routers/auth";
import { createTRPCRouter, ownerProcedure } from "~/server/api/trpc";
import { logAuthEvent } from "~/server/lib/authEvents";
import { sendEmployeeWelcomeEmail } from "~/server/lib/email";
import { getClientIp, getUserAgent } from "~/server/lib/requestMeta";

const createEmployeeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "El nombre es obligatorio")
    .max(80, "El nombre es demasiado largo"),
  document: z
    .string()
    .trim()
    .min(4, "La cédula es obligatoria")
    .max(20, "La cédula es demasiado larga"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Correo electrónico inválido")
    .email("Correo electrónico inválido"),
  // Opcional: si se deja vacía, el servidor genera una contraseña temporal segura
  password: z.union([passwordPolicySchema, z.literal("")]).optional(),
});

const employeeIdSchema = z.string().min(1).max(64);

// Sin caracteres ambiguos (0/O, 1/l/I) para que el propietario pueda dictarla
const TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const TEMP_PASSWORD_LENGTH = 12;

/** Contraseña temporal de 12 caracteres con CSPRNG; siempre incluye letra y número. */
function generateTemporaryPassword(): string {
  for (;;) {
    let password = "";
    for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
      password += TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)];
    }
    if (/[A-Za-z]/.test(password) && /\d/.test(password)) return password;
  }
}

export const usersRouter = createTRPCRouter({
  list: ownerProcedure.query(({ ctx }) => {
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
        mustChangePassword: true,
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

      // La contraseña nunca se envía por correo: se muestra una sola vez al
      // propietario, que la entrega al empleado; este debe cambiarla al ingresar.
      const generated = input.password ? null : generateTemporaryPassword();
      const initialPassword = generated ?? input.password ?? "";
      const passwordHash = await bcrypt.hash(initialPassword, 12);

      const employee = await ctx.db.user.create({
        data: {
          name: input.name,
          email: input.email,
          document: input.document,
          passwordHash,
          role: "CASHIER",
          isActive: true,
          mustChangePassword: true,
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

      // Correo de bienvenida al empleado (sin contraseña) — no bloquea si falla
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
        ).catch(() => null);
      }

      return {
        id: employee.id,
        message: "Empleado creado correctamente.",
        /** Solo presente si la generó el servidor; se muestra una única vez. */
        temporaryPassword: generated,
      };
    }),

  // El propietario restablece la contraseña de un cajero: se genera una temporal,
  // se cierran sus sesiones y deberá cambiarla al ingresar.
  resetEmployeePassword: ownerProcedure
    .input(z.object({ employeeId: employeeIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const { businessId, id: ownerId } = ctx.session.user;

      const employee = await ctx.db.user.findFirst({
        where: { id: input.employeeId, businessId, role: "CASHIER" },
        select: { id: true, name: true, email: true },
      });

      if (!employee) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Empleado no encontrado en este negocio." });
      }

      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await bcrypt.hash(temporaryPassword, 12);

      await ctx.db.$transaction([
        ctx.db.user.update({
          where: { id: employee.id },
          data: {
            passwordHash,
            mustChangePassword: true,
            sessionVersion: { increment: 1 },
            failedLogins: 0,
            lockedUntil: null,
          },
        }),
        ctx.db.passwordResetToken.deleteMany({ where: { userId: employee.id } }),
        ctx.db.auditLog.create({
          data: {
            businessId,
            userId: ownerId,
            action: "RESET_EMPLOYEE_PASSWORD",
            entityType: "User",
            entityId: employee.id,
            detail: { name: employee.name },
          },
        }),
      ]);

      await logAuthEvent({
        type: "SESSION_REVOKED",
        email: employee.email,
        userId: employee.id,
        businessId,
        ip: getClientIp(ctx.headers),
        userAgent: getUserAgent(ctx.headers),
      });

      return {
        message: "Contraseña restablecida. Entrégale la contraseña temporal al empleado.",
        temporaryPassword,
      };
    }),

  setActive: ownerProcedure
    .input(
      z.object({
        employeeId: employeeIdSchema,
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
        select: { id: true, name: true, email: true },
      });

      if (!employee) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Empleado no encontrado en este negocio.",
        });
      }

      // sessionVersion++ corta de inmediato las sesiones abiertas del empleado
      await ctx.db.user.update({
        where: { id: input.employeeId },
        data: { isActive: input.isActive, sessionVersion: { increment: 1 } },
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

      if (!input.isActive) {
        await logAuthEvent({
          type: "SESSION_REVOKED",
          email: employee.email,
          userId: employee.id,
          businessId,
          ip: getClientIp(ctx.headers),
          userAgent: getUserAgent(ctx.headers),
        });
      }

      return {
        message: input.isActive
          ? "Empleado activado correctamente."
          : "Empleado desactivado correctamente.",
      };
    }),

  setCashManagement: ownerProcedure
    .input(
      z.object({
        employeeId: employeeIdSchema,
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

      // canManageCash se lee fresco de la BD en cada petición (loadActiveUser):
      // no hace falta cerrar la sesión del cajero en plena jornada.
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
