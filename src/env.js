import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string().min(32, "AUTH_SECRET debe tener al menos 32 caracteres")
        : z.string().optional(),
    DATABASE_URL: z.string().url(),
    DIRECT_URL: z.string().url(),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    BREVO_API_KEY: z.string().min(1),
    SMTP_FROM: z.string().email(),
    // ─── Suscripciones ────────────────────────────────────────────────────
    // "mock": pasarela simulada (sin cobros reales). "wompi": cobros reales.
    PAYMENTS_PROVIDER: z.enum(["mock", "wompi"]).default("mock"),
    // La pasarela simulada deja aprobar pagos sin pagar: en producción solo
    // funciona si esto es "true" (útil mientras no haya clientes reales).
    PAYMENTS_ALLOW_MOCK_IN_PRODUCTION: z.enum(["true", "false"]).default("false"),
    WOMPI_PUBLIC_KEY: z.string().optional(),
    WOMPI_INTEGRITY_SECRET: z.string().optional(),
    WOMPI_EVENTS_SECRET: z.string().optional(),
    // Secreto que Vercel Cron envía como "Authorization: Bearer <CRON_SECRET>".
    // Sin él, /api/cron/subscriptions responde 401 y no corre (no se envían avisos).
    CRON_SECRET: z.string().min(16, "CRON_SECRET debe tener al menos 16 caracteres").optional(),
    // IVA de la suscripción como fracción (0.19 = 19 %). 0 = no se cobra IVA.
    // Valídalo con tu contador antes de cambiarlo.
    SUBSCRIPTION_VAT_RATE: z.coerce.number().min(0).max(1).default(0),
    SUBSCRIPTION_PRICES_INCLUDE_VAT: z.enum(["true", "false"]).default("true"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    AUTH_SECRET: process.env.AUTH_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    BREVO_API_KEY: process.env.BREVO_API_KEY,
    SMTP_FROM: process.env.SMTP_FROM,
    PAYMENTS_PROVIDER: process.env.PAYMENTS_PROVIDER,
    PAYMENTS_ALLOW_MOCK_IN_PRODUCTION: process.env.PAYMENTS_ALLOW_MOCK_IN_PRODUCTION,
    WOMPI_PUBLIC_KEY: process.env.WOMPI_PUBLIC_KEY,
    WOMPI_INTEGRITY_SECRET: process.env.WOMPI_INTEGRITY_SECRET,
    WOMPI_EVENTS_SECRET: process.env.WOMPI_EVENTS_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
    SUBSCRIPTION_VAT_RATE: process.env.SUBSCRIPTION_VAT_RATE,
    SUBSCRIPTION_PRICES_INCLUDE_VAT: process.env.SUBSCRIPTION_PRICES_INCLUDE_VAT,
    NODE_ENV: process.env.NODE_ENV,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
