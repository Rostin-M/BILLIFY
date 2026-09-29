import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { after } from "next/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import { logAuthEvent } from "~/server/lib/authEvents";
import { sendPasswordReset, sendVerificationCode, sendWelcomeEmail } from "~/server/lib/email";
import { enforceRateLimits, RATE_LIMITS } from "~/server/lib/rateLimit";
import { getClientIp, getUserAgent } from "~/server/lib/requestMeta";
import { generateNumericCode, hashCode, MAX_CODE_ATTEMPTS, verifyCode } from "~/server/lib/secureCode";

// ─── Validaciones compartidas ──────────────────────────────────────────────

/** Política de contraseñas nuevas: 10–128 caracteres, al menos una letra y un número. */
export const passwordPolicySchema = z
  .string()
  .min(10, "La contraseña debe tener mínimo 10 caracteres")
  .max(128, "La contraseña debe tener máximo 128 caracteres")
  .regex(/[A-Za-z]/, "La contraseña debe incluir al menos una letra")
  .regex(/\d/, "La contraseña debe incluir al menos un número");

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Correo electrónico inválido")
  .email("Correo electrónico inválido");

const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "El código debe tener 6 dígitos");

export const registerOwnerSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, "El nombre del negocio es obligatorio")
    .max(80, "El nombre del negocio es demasiado largo"),
  businessDocument: z
    .string()
    .trim()
    .min(5, "El documento del negocio es obligatorio")
    .max(20, "El documento del negocio es demasiado largo"),
  ownerName: z
    .string()
    .trim()
    .min(2, "El nombre del propietario es obligatorio")
    .max(80, "El nombre del propietario es demasiado largo"),
  ownerDocument: z
    .string()
    .trim()
    .min(4, "La cédula del propietario es obligatoria")
    .max(20, "La cédula del propietario es demasiado larga"),
  ownerEmail: emailSchema,
  ownerPassword: passwordPolicySchema,
});

const CODE_TTL_MINUTES = 15;
const INVALID_CODE_MESSAGE = "Código incorrecto o vencido.";
const FORGOT_PASSWORD_MESSAGE = "Si los datos son correctos, recibirás un correo.";
const RESEND_CODE_MESSAGE = "Si hay un registro pendiente para este correo, te enviamos un nuevo código.";

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/**
 * Límites de envío de correo: estricto por (destinatario, IP), techo diario por
 * destinatario y por IP. Así un tercero no agota el cupo de la víctima.
 */
function sendEmailLimits(email: string, ip: string) {
  return [
    { key: `mail:email-ip:${email}:${ip}`, rule: RATE_LIMITS.sendEmailByEmailIp },
    { key: `mail:email-day:${email}`, rule: RATE_LIMITS.sendEmailByEmailDaily },
    { key: `mail:ip:${ip}`, rule: RATE_LIMITS.sendEmailByIp },
  ];
}

/** Límites para adivinar códigos: estricto por (correo, IP), techo por correo y por IP. */
function verifyCodeLimits(email: string, ip: string) {
  return [
    { key: `verify:email-ip:${email}:${ip}`, rule: RATE_LIMITS.verifyCodeByEmailIp },
    { key: `verify:email:${email}`, rule: RATE_LIMITS.verifyCodeByEmail },
    { key: `verify:ip:${ip}`, rule: RATE_LIMITS.verifyCodeByIp },
  ];
}

/**
 * Ejecuta el envío después de responder. Así el tiempo de respuesta es el mismo
 * exista o no la cuenta (evita enumeración por tiempo). Si no hay contexto de
 * petición (p. ej. llamada directa), se ejecuta en segundo plano.
 */
function runAfterResponse(task: () => Promise<unknown>) {
  const safeTask = async () => {
    try {
      await task();
    } catch (error) {
      console.error("[auth] envío diferido falló", error instanceof Error ? error.message : error);
    }
  };
  try {
    after(safeTask);
  } catch {
    void safeTask();
  }
}

export const authRouter = createTRPCRouter({
  // ─── Bloque 1: Registro con verificación de correo ───────────────────────
  // Paso 1: valida unicidad → guarda registro pendiente → envía código
  // NO crea Business ni User hasta que el código sea verificado

  registerOwner: publicProcedure
    .input(registerOwnerSchema)
    .mutation(async ({ ctx, input }) => {
      const ip = getClientIp(ctx.headers);
      await enforceRateLimits([{ key: `register:ip:${ip}`, rule: RATE_LIMITS.registerByIp }]);

      const now = new Date();

      // Limpieza oportunista de registros pendientes vencidos hace más de un día
      await ctx.db.pendingRegistration.deleteMany({
        where: { expiresAt: { lt: new Date(now.getTime() - 24 * 60 * 60_000) } },
      });

      // Validar que el correo no exista en usuarios activos ni pendientes vigentes
      const [existingUser, existingPending, existingBusiness] = await Promise.all([
        ctx.db.user.findUnique({
          where: { email: input.ownerEmail },
          select: { id: true },
        }),
        ctx.db.pendingRegistration.findUnique({
          where: { email: input.ownerEmail },
          select: { id: true, expiresAt: true },
        }),
        ctx.db.business.findUnique({
          where: { document: input.businessDocument },
          select: { id: true },
        }),
      ]);

      // Un pendiente vencido se sobrescribe; uno vigente bloquea (mismo mensaje que
      // una cuenta existente para no revelar más información que antes).
      const pendingIsActive = existingPending !== null && existingPending.expiresAt > now;
      if (existingUser || pendingIsActive) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Ya existe una cuenta o un registro pendiente con este correo. Si te registraste hace poco, revisa tu correo o ingresa el código.",
        });
      }
      if (existingBusiness) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Ya existe un negocio registrado con este documento.",
        });
      }

      await enforceRateLimits(
        sendEmailLimits(input.ownerEmail, ip),
        "Demasiados correos enviados. Espera unos minutos e inténtalo de nuevo.",
      );

      // Hash de contraseña antes de guardar en pending
      const passwordHash = await bcrypt.hash(input.ownerPassword, 12);
      const code = generateNumericCode();
      const data = {
        codeHash: hashCode(code),
        attempts: 0,
        expiresAt: addMinutes(now, CODE_TTL_MINUTES),
        businessName: input.businessName,
        businessDocument: input.businessDocument,
        ownerName: input.ownerName,
        ownerDocument: input.ownerDocument,
        passwordHash,
      };

      // Upsert: sobrescribe un pendiente vencido del mismo correo
      await ctx.db.pendingRegistration.upsert({
        where: { email: input.ownerEmail },
        create: { email: input.ownerEmail, ...data },
        update: data,
      });

      await sendVerificationCode(input.ownerEmail, code, input.ownerName);

      return { requiresVerification: true };
    }),

  // Paso 2: verifica el código → crea Business + User → elimina registro pendiente
  verifyEmail: publicProcedure
    .input(z.object({ email: emailSchema, code: codeSchema }))
    .mutation(async ({ ctx, input }) => {
      const ip = getClientIp(ctx.headers);
      const userAgent = getUserAgent(ctx.headers);
      await enforceRateLimits(verifyCodeLimits(input.email, ip));

      const pending = await ctx.db.pendingRegistration.findUnique({
        where: { email: input.email },
      });

      if (!pending || pending.expiresAt < new Date()) {
        await logAuthEvent({ type: "VERIFY_CODE_FAILED", email: input.email, ip, userAgent });
        throw new TRPCError({ code: "BAD_REQUEST", message: INVALID_CODE_MESSAGE });
      }

      const tooManyAttempts = new TRPCError({
        code: "BAD_REQUEST",
        message: "Demasiados intentos fallidos. Regístrate de nuevo para recibir un código nuevo.",
      });

      if (pending.attempts >= MAX_CODE_ATTEMPTS) {
        await ctx.db.pendingRegistration.deleteMany({ where: { id: pending.id } });
        throw tooManyAttempts;
      }

      if (!verifyCode(input.code, pending.codeHash)) {
        await logAuthEvent({ type: "VERIFY_CODE_FAILED", email: input.email, ip, userAgent });
        // Incremento atómico: evita que peticiones simultáneas se salten el tope
        const updated = await ctx.db.pendingRegistration.update({
          where: { id: pending.id },
          data: { attempts: { increment: 1 } },
          select: { attempts: true },
        });
        if (updated.attempts >= MAX_CODE_ATTEMPTS) {
          await ctx.db.pendingRegistration.deleteMany({ where: { id: pending.id } });
          throw tooManyAttempts;
        }
        throw new TRPCError({ code: "BAD_REQUEST", message: INVALID_CODE_MESSAGE });
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
        // Consumir el pendiente primero: si otra petición ya lo usó, se aborta
        const consumed = await tx.pendingRegistration.deleteMany({
          where: { id: pending.id, codeHash: pending.codeHash },
        });
        if (consumed.count === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: INVALID_CODE_MESSAGE });
        }

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
      }, { maxWait: 10000, timeout: 15000 });

      // Correo de bienvenida — no bloquea si falla
      void sendWelcomeEmail(pending.email, pending.ownerName, pending.businessName).catch(() => null);

      return { message: "Cuenta creada. Ya puedes iniciar sesión." };
    }),

  resendVerificationCode: publicProcedure
    .input(z.object({ email: emailSchema }))
    .mutation(async ({ ctx, input }) => {
      const ip = getClientIp(ctx.headers);
      // Los límites se aplican siempre, exista o no el registro (sin enumeración)
      await enforceRateLimits(
        sendEmailLimits(input.email, ip),
        "Demasiados correos enviados. Espera unos minutos e inténtalo de nuevo.",
      );

      const pending = await ctx.db.pendingRegistration.findUnique({
        where: { email: input.email },
        select: { id: true, ownerName: true },
      });

      if (pending) {
        const code = generateNumericCode();
        await ctx.db.pendingRegistration.update({
          where: { id: pending.id },
          data: {
            codeHash: hashCode(code),
            attempts: 0,
            expiresAt: addMinutes(new Date(), CODE_TTL_MINUTES),
          },
        });
        runAfterResponse(() => sendVerificationCode(input.email, code, pending.ownerName));
      }

      // Respuesta genérica para no revelar si el correo existe
      return { message: RESEND_CODE_MESSAGE };
    }),

  // ─── Bloque 2: Recuperar contraseña ──────────────────────────────────────

  forgotPassword: publicProcedure
    .input(
      z.object({
        email: emailSchema,
        document: z.string().trim().min(4, "Cédula inválida").max(20, "Cédula inválida"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ip = getClientIp(ctx.headers);
      const userAgent = getUserAgent(ctx.headers);
      // Los límites se aplican siempre, exista o no el usuario (sin enumeración)
      await enforceRateLimits(
        sendEmailLimits(input.email, ip),
        "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
      );

      const user = await ctx.db.user.findFirst({
        where: { email: input.email, document: input.document },
        select: { id: true, name: true, email: true, businessId: true },
      });

      if (user?.email) {
        const now = new Date();
        const code = generateNumericCode();
        const userEmail = user.email;

        await ctx.db.$transaction([
          // Invalida tokens anteriores sin usar y limpia los vencidos hace más de un día
          ctx.db.passwordResetToken.updateMany({
            where: { userId: user.id, usedAt: null },
            data: { usedAt: now },
          }),
          ctx.db.passwordResetToken.deleteMany({
            where: { expiresAt: { lt: new Date(now.getTime() - 24 * 60 * 60_000) } },
          }),
          ctx.db.passwordResetToken.create({
            data: {
              userId: user.id,
              tokenHash: hashCode(code),
              attempts: 0,
              expiresAt: addMinutes(now, CODE_TTL_MINUTES),
            },
          }),
        ]);

        await logAuthEvent({
          type: "PASSWORD_RESET_REQUESTED",
          email: userEmail,
          userId: user.id,
          businessId: user.businessId,
          ip,
          userAgent,
        });

        runAfterResponse(() => sendPasswordReset(userEmail, code, user.name ?? ""));
      }

      // Respuesta genérica para no revelar si el usuario existe
      return { message: FORGOT_PASSWORD_MESSAGE };
    }),

  resetPassword: publicProcedure
    .input(
      z.object({
        email: emailSchema,
        token: codeSchema,
        newPassword: passwordPolicySchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ip = getClientIp(ctx.headers);
      const userAgent = getUserAgent(ctx.headers);
      await enforceRateLimits(verifyCodeLimits(input.email, ip));

      // Todo fallo responde igual, incluido un correo inexistente (sin enumeración)
      const fail = async (userId: string | null, businessId: string | null): Promise<never> => {
        await logAuthEvent({
          type: "PASSWORD_RESET_FAILED",
          email: input.email,
          userId,
          businessId,
          ip,
          userAgent,
        });
        throw new TRPCError({ code: "BAD_REQUEST", message: INVALID_CODE_MESSAGE });
      };

      const user = await ctx.db.user.findUnique({
        where: { email: input.email },
        select: { id: true, businessId: true },
      });
      if (!user) return fail(null, null);

      const now = new Date();
      const record = await ctx.db.passwordResetToken.findFirst({
        where: { userId: user.id, usedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
      });
      if (!record) return fail(user.id, user.businessId);

      if (record.attempts >= MAX_CODE_ATTEMPTS) {
        await ctx.db.passwordResetToken.update({
          where: { id: record.id },
          data: { usedAt: now },
        });
        return fail(user.id, user.businessId);
      }

      if (!verifyCode(input.token, record.tokenHash)) {
        // Incremento atómico; al llegar al tope el código queda invalidado
        const updated = await ctx.db.passwordResetToken.update({
          where: { id: record.id },
          data: { attempts: { increment: 1 } },
          select: { attempts: true },
        });
        if (updated.attempts >= MAX_CODE_ATTEMPTS) {
          await ctx.db.passwordResetToken.update({
            where: { id: record.id },
            data: { usedAt: now },
          });
        }
        return fail(user.id, user.businessId);
      }

      const passwordHash = await bcrypt.hash(input.newPassword, 12);

      await ctx.db.$transaction(async (tx) => {
        // Consumir el token de forma atómica: evita doble uso concurrente
        const consumed = await tx.passwordResetToken.updateMany({
          where: { id: record.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (consumed.count === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: INVALID_CODE_MESSAGE });
        }

        await tx.passwordResetToken.deleteMany({
          where: { userId: user.id, id: { not: record.id } },
        });

        // sessionVersion++ cierra todas las sesiones abiertas con la contraseña anterior
        await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            sessionVersion: { increment: 1 },
            failedLogins: 0,
            lockedUntil: null,
            mustChangePassword: false,
          },
        });
      });

      await logAuthEvent({
        type: "PASSWORD_RESET_SUCCESS",
        email: input.email,
        userId: user.id,
        businessId: user.businessId,
        ip,
        userAgent,
      });

      return { message: "Contraseña actualizada. Ya puedes iniciar sesión." };
    }),

  // Cambio de contraseña con sesión iniciada. También lo usa el flujo de
  // contraseña temporal (mustChangePassword): se exige la contraseña temporal actual.
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z
          .string()
          .min(1, "Ingresa tu contraseña actual")
          .max(128, "La contraseña actual es incorrecta."),
        newPassword: passwordPolicySchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await enforceRateLimits([
        { key: `pwchange:user:${userId}`, rule: RATE_LIMITS.verifyCodeByEmailIp },
      ]);

      const user = await ctx.db.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true, email: true, businessId: true },
      });

      if (!user?.passwordHash) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Usuario no encontrado." });
      }

      const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La contraseña actual es incorrecta." });
      }

      if (input.newPassword === input.currentPassword) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "La nueva contraseña debe ser diferente a la actual.",
        });
      }

      const passwordHash = await bcrypt.hash(input.newPassword, 12);
      // sessionVersion++ invalida todas las sesiones (incluida la actual): el
      // cliente debe cerrar sesión y volver a ingresar con la nueva contraseña.
      await ctx.db.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          sessionVersion: { increment: 1 },
          mustChangePassword: false,
          failedLogins: 0,
          lockedUntil: null,
        },
      });

      await logAuthEvent({
        type: "PASSWORD_CHANGED",
        email: user.email,
        userId,
        businessId: user.businessId,
        ip: getClientIp(ctx.headers),
        userAgent: getUserAgent(ctx.headers),
      });

      return {
        message: "Contraseña actualizada. Inicia sesión con tu nueva contraseña.",
        requiresReLogin: true as const,
      };
    }),
});
