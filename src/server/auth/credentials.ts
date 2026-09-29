import "server-only";

import bcrypt from "bcryptjs";
import { CredentialsSignin } from "next-auth";
import { z } from "zod";

import { db } from "~/server/db";
import { logAuthEvent } from "~/server/lib/authEvents";
import { consumeRateLimit, RATE_LIMITS, resetRateLimit } from "~/server/lib/rateLimit";
import { getClientIp, getUserAgent } from "~/server/lib/requestMeta";

import { type AuthorizedUser } from "./edge.config";

/**
 * Error que el cliente recibe como `code: "too_many_attempts"` en el resultado
 * de `signIn("credentials", { redirect: false })`. Se usa tanto para el límite
 * de intentos como para la cuenta bloqueada, sin distinguirlos.
 */
export class TooManyAttemptsError extends CredentialsSignin {
  code = "too_many_attempts";
}

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

/**
 * Hash bcrypt (cost 12) de una contraseña aleatoria descartada. Se compara
 * contra él cuando el usuario no existe o no tiene contraseña, para que el
 * tiempo de respuesta no revele si el correo está registrado.
 */
const DUMMY_BCRYPT_HASH =
  "$2b$12$o.qNRvpdO3/HERaDdvEmwOhBzONpSzCFiXAzPBrdK6Kg79.uHBNom";

export async function authorizeCredentials(
  credentials: Partial<Record<string, unknown>>,
  request: Request,
): Promise<AuthorizedUser | null> {
  const parsed = credentialsSchema.safeParse(credentials);
  if (!parsed.success) return null;
  const { email, password } = parsed.data;

  const ip = getClientIp(request.headers);
  const userAgent = getUserAgent(request.headers);

  // ── Límite de intentos ──────────────────────────────────────────────────
  // El bloqueo estricto (5 intentos / 15 min) es por (correo, IP): un atacante
  // no puede dejar al dueño fuera de su cuenta desde otra IP. El techo solo por
  // correo es amplio y frena ataques distribuidos. Se aplica igual exista o no
  // la cuenta, así la respuesta no revela qué correos están registrados.
  const checks = [
    { key: `login:ip:${ip}`, rule: RATE_LIMITS.loginByIp },
    { key: `login:email-ip:${email}:${ip}`, rule: RATE_LIMITS.loginByEmailIp },
    { key: `login:email:${email}`, rule: RATE_LIMITS.loginByEmail },
  ];
  for (const { key, rule } of checks) {
    const result = await consumeRateLimit(key, rule);
    if (!result.allowed) {
      await logAuthEvent({ type: "LOGIN_RATE_LIMITED", email, ip, userAgent });
      throw new TooManyAttemptsError();
    }
  }

  const user = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      passwordHash: true,
      role: true,
      businessId: true,
      isActive: true,
      sessionVersion: true,
      mustChangePassword: true,
      failedLogins: true,
      lockedUntil: true,
    },
  });

  // ── Verificación de contraseña (tiempo constante) ───────────────────────
  const hash = user?.passwordHash ?? DUMMY_BCRYPT_HASH;
  const matches = await bcrypt.compare(password, hash);
  const valid = matches && !!user?.passwordHash;

  if (!user || !valid) {
    // Se cuentan los fallos consecutivos para detectar accesos sospechosos,
    // pero no se bloquea la cuenta completa (eso permitiría a un tercero
    // dejar al dueño fuera); el bloqueo es por (correo, IP) arriba.
    if (user) {
      await db.user.update({
        where: { id: user.id },
        data: { failedLogins: { increment: 1 } },
      });
    }
    await logAuthEvent({
      type: "LOGIN_FAILED",
      email,
      userId: user?.id ?? null,
      businessId: user?.businessId ?? null,
      ip,
      userAgent,
    });
    return null;
  }

  // Contraseña correcta pero cuenta inactiva (p. ej. correo sin verificar o
  // empleado desactivado): se rechaza sin contar como fallo.
  if (!user.isActive) {
    await logAuthEvent({
      type: "LOGIN_FAILED",
      email,
      userId: user.id,
      businessId: user.businessId,
      ip,
      userAgent,
    });
    return null;
  }

  // ── Éxito ───────────────────────────────────────────────────────────────
  if (user.failedLogins !== 0 || user.lockedUntil !== null) {
    await db.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null },
    });
  }
  await resetRateLimit(`login:email-ip:${email}:${ip}`);
  await logAuthEvent({
    type: "LOGIN_SUCCESS",
    email,
    userId: user.id,
    businessId: user.businessId,
    ip,
    userAgent,
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
    businessId: user.businessId,
    isActive: user.isActive,
    sessionVersion: user.sessionVersion,
    mustChangePassword: user.mustChangePassword,
  };
}
