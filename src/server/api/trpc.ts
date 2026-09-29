/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */

import { randomInt } from "node:crypto";

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import { env } from "~/env";
import { auth } from "~/server/auth";
import { loadActiveUser } from "~/server/auth/currentUser";
import { db } from "~/server/db";
import { getClientIp, getUserAgent } from "~/server/lib/requestMeta";

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth();

  return {
    db,
    session,
    /** IP del cliente (para rate limiting en routers: `ctx.ip`). */
    ip: getClientIp(opts.headers),
    userAgent: getUserAgent(opts.headers),
    ...opts,
  };
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const isProd = env.NODE_ENV === "production";
    // En producción no se filtran mensajes internos (Prisma, stack, etc.).
    const hideMessage = isProd && error.code === "INTERNAL_SERVER_ERROR";
    return {
      ...shape,
      message: hideMessage ? "Error interno. Inténtalo de nuevo." : shape.message,
      data: {
        ...shape.data,
        stack: isProd ? undefined : shape.data.stack,
        zodError:
          error.code === "BAD_REQUEST" && error.cause instanceof ZodError
            ? error.cause.flatten()
            : null,
      },
    };
  },
});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Middleware for timing procedure execution and adding an artificial delay in development.
 *
 * You can remove this if you don't like it, but it can help catch unwanted waterfalls by simulating
 * network latency that would occur in production but not in local development.
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
  // Solo en desarrollo: en producción no se registra nada por petición.
  if (env.NODE_ENV !== "development") return next();

  const start = Date.now();
  // artificial delay in dev
  const waitMs = randomInt(100, 500);
  await new Promise((resolve) => setTimeout(resolve, waitMs));

  const result = await next();

  const end = Date.now();
  console.log(`[TRPC] ${path} took ${end - start}ms to execute`);

  return result;
});

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure.use(timingMiddleware);

/**
 * Protected (authenticated) procedure
 *
 * Revalida la sesión contra la BD en cada llamada (`loadActiveUser`): usuario
 * activo, sessionVersion vigente y plazo absoluto de 24 h. Rol, negocio y
 * permisos de caja se toman siempre frescos de la BD, nunca del JWT.
 * Expone `ctx.user` (ActiveUser) y `ctx.session.user` con los valores frescos.
 *
 * Si el usuario debe cambiar su contraseña, solo se permiten procedimientos
 * del router `auth.`.
 *
 * @see https://trpc.io/docs/procedures
 */
export const protectedProcedure = t.procedure
  .use(timingMiddleware)
  .use(async ({ ctx, next, path }) => {
    const user = await loadActiveUser(ctx.session);
    if (!user || !ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    if (user.mustChangePassword && !path.startsWith("auth.")) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Debes cambiar tu contraseña",
      });
    }

    return next({
      ctx: {
        user,
        session: {
          ...ctx.session,
          user: {
            ...ctx.session.user,
            name: user.name,
            email: user.email,
            role: user.role,
            businessId: user.businessId,
            canManageCash: user.canManageCash,
            mustChangePassword: user.mustChangePassword,
          },
        },
      },
    });
  });

/**
 * Business-scoped procedure (OWNER + CASHIER)
 *
 * Extiende protectedProcedure garantizando que businessId sea no nulo.
 * Centraliza el aislamiento lógico por negocio para ambos roles.
 */
export const businessProcedure = protectedProcedure.use(({ ctx, next }) => {
  const { businessId } = ctx.user;

  if (!businessId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cuenta sin negocio asociado.",
    });
  }

  return next({
    ctx: {
      user: { ...ctx.user, businessId },
      session: {
        ...ctx.session,
        user: { ...ctx.session.user, businessId },
      },
    },
  });
});

/**
 * Owner-only procedure
 *
 * Extiende protectedProcedure verificando que el usuario tenga rol OWNER
 * y un businessId asociado. Garantiza aislamiento de datos por negocio.
 */
export const ownerProcedure = protectedProcedure.use(({ ctx, next }) => {
  const { role, businessId } = ctx.user;

  if (role !== "OWNER") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Solo el propietario puede realizar esta acción.",
    });
  }

  if (!businessId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cuenta sin negocio asociado.",
    });
  }

  return next({
    ctx: {
      user: { ...ctx.user, businessId },
      session: {
        ...ctx.session,
        user: { ...ctx.session.user, businessId },
      },
    },
  });
});
