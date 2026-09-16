import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import { sendPasswordReset, sendVerificationCode, sendWelcomeEmail } from "~/server/lib/email";

export const registerOwnerSchema = z.object({
  businessName: z.string().trim().min(2, "El nombre del negocio es obligatorio"),
  businessDocument: z
    .string()
    .trim()
    .min(5, "El documento del negocio es obligatorio"),
  ownerName: z.string().trim().min(2, "El nombre del propietario es obligatorio"),
  ownerDocument: z
    .string()
    .trim()
    .min(4, "La cédula del propietario es obligatoria"),
  ownerEmail: z.string().trim().toLowerCase().email("Correo electrónico inválido"),
  ownerPassword: z
    .string()
    .min(8, "La contraseña debe tener mínimo 8 caracteres")
    .regex(/[A-Za-z]/, "La contraseña debe incluir al menos una letra")
    .regex(/\d/, "La contraseña debe incluir al menos un número"),
});

function generateCode(): string {
  return String(randomInt(100000, 1000000));
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export const authRouter = createTRPCRouter({
  // ─── Bloque 1: Registro con verificación de correo ───────────────────────
  // Paso 1: valida unicidad → guarda registro pendiente → envía código
  // NO crea Business ni User hasta que el código sea verificado

  registerOwner: publicProcedure
    .input(registerOwnerSchema)
    .mutation(async ({ ctx, input }) => {
      // Validar que el correo no exista en usuarios activos ni pendientes
      const [existingUser, existingPending, existingBusiness] = await Promise.all([
        ctx.db.user.findUnique({
          where: { email: input.ownerEmail },
          select: { id: true },
        }),
        ctx.db.pendingRegistration.findUnique({
          where: { email: input.ownerEmail },
          select: { id: true },
        }),
        ctx.db.business.findUnique({
          where: { document: input.businessDocument },
          select: { id: true },
        }),
      ]);

      if (existingUser || existingPending) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Ya existe una cuenta con este correo electrónico.",
        });
      }
      if (existingBusiness) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Ya existe un negocio registrado con este documento.",
        });
      }

      // Hash de contraseña antes de guardar en pending
      const passwordHash = await bcrypt.hash(input.ownerPassword, 12);
      const code = generateCode();

      // Upsert por si el usuario reintenta el registro con el mismo correo
      await ctx.db.pendingRegistration.upsert({
        where: { email: input.ownerEmail },
        create: {
          email: input.ownerEmail,
          code,
          expiresAt: addMinutes(new Date(), 15),
          businessName: input.businessName,
          businessDocument: input.businessDocument,
          ownerName: input.ownerName,
          ownerDocument: input.ownerDocument,
          passwordHash,
        },
        update: {
          code,
          expiresAt: addMinutes(new Date(), 15),
          businessName: input.businessName,
          businessDocument: input.businessDocument,
          ownerName: input.ownerName,
          ownerDocument: input.ownerDocument,
          passwordHash,
        },
      });

      await sendVerificationCode(input.ownerEmail, code, input.ownerName);

      return { requiresVerification: true };
    }),

  // Paso 2: verifica el código → crea Business + User → elimina registro pendiente
  verifyEmail: publicProcedure
    .input(z.object({ email: z.string().email(), code: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      const pending = await ctx.db.pendingRegistration.findUnique({
        where: { email: input.email },
      });

      if (!pending) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No hay un registro pendiente para este correo.",
        });
      }
      if (pending.code !== input.code) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Código incorrecto." });
      }
      if (pending.expiresAt < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El código ha expirado. Solicita uno nuevo.",
        });
      }

      // Verificar de nuevo que no hayan aparecido duplicados mientras esperaba
      const [dupUser, dupBusiness] = await Promise.all([
        ctx.db.user.findUnique({ where: { email: pending.email }, select: { id: true } }),
        ctx.db.business.findUnique({ where: { document: pending.businessDocument }, select: { id: true } }),
      ]);
      if (dupUser) {
        throw new TRPCError({ code: "CONFLICT", message: "Ya existe una cuenta con este correo." });
      }
      if (dupBusiness) {
        throw new TRPCError({ code: "CONFLICT", message: "Ya existe un negocio con este documento." });
      }

      // Crear negocio y usuario solo ahora que el correo está verificado
      await ctx.db.$transaction(async (tx) => {
        const business = await tx.business.create({
          data: {
            name: pending.businessName,
            document: pending.businessDocument,
          },
        });

        await tx.user.create({
          data: {
            name: pending.ownerName,
            email: pending.email,
            document: pending.ownerDocument,
            passwordHash: pending.passwordHash,
            role: "OWNER",
            isActive: true,
            emailVerified: new Date(),
            businessId: business.id,
          },
        });

        await tx.pendingRegistration.delete({ where: { email: pending.email } });
      }, { maxWait: 10000, timeout: 15000 });

      // Correo de bienvenida — no bloquea si falla
      void sendWelcomeEmail(pending.email, pending.ownerName, pending.businessName).catch(() => null);

      return { message: "Cuenta creada. Ya puedes iniciar sesión." };
    }),

  resendVerificationCode: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const pending = await ctx.db.pendingRegistration.findUnique({
        where: { email: input.email },
      });

      // Respuesta genérica para no revelar si el correo existe
      if (!pending) return { message: "ok" };

      const code = generateCode();
      await ctx.db.pendingRegistration.update({
        where: { email: input.email },
        data: { code, expiresAt: addMinutes(new Date(), 15) },
      });

      await sendVerificationCode(input.email, code, pending.ownerName);
      return { message: "Código reenviado." };
    }),

  // ─── Bloque 2: Recuperar contraseña ──────────────────────────────────────

  forgotPassword: publicProcedure
    .input(
      z.object({
        email: z.string().trim().toLowerCase().email("Correo inválido"),
        document: z.string().trim().min(4, "Cédula inválida"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findFirst({
        where: { email: input.email, document: input.document },
        select: { id: true, name: true, email: true },
      });

      // Respuesta genérica para no revelar si el usuario existe
      if (!user?.email) return { message: "Si los datos son correctos, recibirás un correo." };

      // Invalida tokens anteriores
      await ctx.db.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      const token = generateCode();
      await ctx.db.passwordResetToken.create({
        data: { userId: user.id, token, expiresAt: addMinutes(new Date(), 15) },
      });

      await sendPasswordReset(user.email, token, user.name ?? "");
      return { message: "Si los datos son correctos, recibirás un correo." };
    }),

  resetPassword: publicProcedure
    .input(
      z.object({
        email: z.string().trim().toLowerCase().email(),
        token: z.string().length(6),
        newPassword: z
          .string()
          .min(8, "La contraseña debe tener mínimo 8 caracteres")
          .regex(/[A-Za-z]/, "Debe incluir al menos una letra")
          .regex(/\d/, "Debe incluir al menos un número"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (!user) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Datos incorrectos." });
      }

      const record = await ctx.db.passwordResetToken.findFirst({
        where: { userId: user.id, token: input.token, usedAt: null },
        orderBy: { createdAt: "desc" },
      });

      if (!record) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Código incorrecto." });
      }
      if (record.expiresAt < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El código ha expirado. Solicita uno nuevo.",
        });
      }

      const passwordHash = await bcrypt.hash(input.newPassword, 12);

      await ctx.db.$transaction([
        ctx.db.passwordResetToken.update({
          where: { id: record.id },
          data: { usedAt: new Date() },
        }),
        ctx.db.user.update({
          where: { id: user.id },
          data: { passwordHash },
        }),
      ]);

      return { message: "Contraseña actualizada. Ya puedes iniciar sesión." };
    }),

  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1, "Ingresa tu contraseña actual"),
        newPassword: z
          .string()
          .min(8, "La nueva contraseña debe tener mínimo 8 caracteres")
          .regex(/[A-Za-z]/, "Debe incluir al menos una letra")
          .regex(/\d/, "Debe incluir al menos un número"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { passwordHash: true },
      });

      if (!user?.passwordHash) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Usuario no encontrado." });
      }

      const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La contraseña actual es incorrecta." });
      }

      const passwordHash = await bcrypt.hash(input.newPassword, 12);
      await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { passwordHash },
      });

      return { message: "Contraseña actualizada correctamente." };
    }),
});
