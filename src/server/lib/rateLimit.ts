import "server-only";

import { TRPCError } from "@trpc/server";

import { db } from "~/server/db";

/**
 * Límite de intentos con ventana fija, persistido en Postgres (tabla rate_limits).
 * En Vercel cada invocación puede caer en una instancia distinta, así que el
 * contador no puede vivir en memoria. Una sola sentencia atómica (upsert) evita
 * carreras entre peticiones simultáneas.
 */

export type RateLimitRule = {
  /** Máximo de intentos permitidos dentro de la ventana. */
  limit: number;
  /** Duración de la ventana en segundos. */
  windowSec: number;
};

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  /** Segundos hasta que se reinicia la ventana. */
  retryAfterSec: number;
};

export const RATE_LIMITS = {
  // Los límites estrictos van por (correo, IP): un atacante desde otra IP no
  // puede agotar el cupo del dueño legítimo y dejarlo fuera de su cuenta.
  // Los límites solo por correo son un techo amplio contra ataques distribuidos.
  loginByIp: { limit: 20, windowSec: 15 * 60 },
  loginByEmailIp: { limit: 5, windowSec: 15 * 60 },
  loginByEmail: { limit: 100, windowSec: 15 * 60 },
  verifyCodeByEmailIp: { limit: 5, windowSec: 15 * 60 },
  verifyCodeByEmail: { limit: 30, windowSec: 15 * 60 },
  verifyCodeByIp: { limit: 30, windowSec: 15 * 60 },
  sendEmailByEmailIp: { limit: 3, windowSec: 15 * 60 },
  sendEmailByEmailDaily: { limit: 20, windowSec: 24 * 60 * 60 },
  sendEmailByIp: { limit: 10, windowSec: 60 * 60 },
  registerByIp: { limit: 5, windowSec: 60 * 60 },
  invoiceEmailByUser: { limit: 20, windowSec: 60 * 60 },
  invoiceEmailByBusiness: { limit: 60, windowSec: 60 * 60 },
  invoiceEmailByBusinessDaily: { limit: 200, windowSec: 24 * 60 * 60 },
  uploadByUser: { limit: 30, windowSec: 10 * 60 },
} satisfies Record<string, RateLimitRule>;

export async function consumeRateLimit(
  key: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const rows = await db.$queryRaw<{ count: number; window_start: Date }[]>`
    INSERT INTO "rate_limits" ("key", "count", "window_start", "expires_at")
    VALUES (${key}, 1, now(), now() + make_interval(secs => ${rule.windowSec}))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "rate_limits"."expires_at" <= now() THEN 1
                     ELSE "rate_limits"."count" + 1 END,
      "window_start" = CASE WHEN "rate_limits"."expires_at" <= now() THEN now()
                            ELSE "rate_limits"."window_start" END,
      "expires_at" = CASE WHEN "rate_limits"."expires_at" <= now()
                          THEN now() + make_interval(secs => ${rule.windowSec})
                          ELSE "rate_limits"."expires_at" END
    RETURNING "count", "window_start"
  `;

  // Limpieza oportunista (~1 % de las llamadas) para que la tabla no crezca sin límite.
  if (Math.random() < 0.01) void purgeExpiredRateLimits().catch(() => null);

  const row = rows[0];
  const count = row?.count ?? 1;
  const windowStart = row?.window_start ?? new Date();
  const retryAfterSec = Math.max(
    0,
    Math.ceil((windowStart.getTime() + rule.windowSec * 1000 - Date.now()) / 1000),
  );

  return { allowed: count <= rule.limit, count, retryAfterSec };
}

/** Reinicia un contador (p. ej. tras un login exitoso). */
export async function resetRateLimit(key: string): Promise<void> {
  await db.rateLimit.deleteMany({ where: { key } });
}

/**
 * Consume varios contadores y lanza TOO_MANY_REQUESTS si alguno se excede.
 * Uso típico en procedimientos tRPC públicos.
 */
export async function enforceRateLimits(
  checks: { key: string; rule: RateLimitRule }[],
  message = "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
): Promise<void> {
  for (const { key, rule } of checks) {
    const result = await consumeRateLimit(key, rule);
    if (!result.allowed) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message });
    }
  }
}

/** Borra contadores vencidos. Llamar de forma oportunista o desde un cron. */
export async function purgeExpiredRateLimits(): Promise<void> {
  await db.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
