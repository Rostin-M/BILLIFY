import { adminRouter } from "~/server/api/routers/admin";
import { authRouter } from "~/server/api/routers/auth";
import { auditLogRouter } from "~/server/api/routers/auditLog";
import { billingRouter } from "~/server/api/routers/billing";
import { businessRouter } from "~/server/api/routers/business";
import { cashRegisterRouter } from "~/server/api/routers/cashRegister";
import { customerRouter } from "~/server/api/routers/customer";
import { dashboardRouter } from "~/server/api/routers/dashboard";
import { productRouter } from "~/server/api/routers/product";
import { saleRouter } from "~/server/api/routers/sale";
import { tableSessionRouter } from "~/server/api/routers/tableSession";
import { usersRouter } from "~/server/api/routers/users";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  admin: adminRouter,
  auth: authRouter,
  auditLog: auditLogRouter,
  billing: billingRouter,
  business: businessRouter,
  cashRegister: cashRegisterRouter,
  customer: customerRouter,
  dashboard: dashboardRouter,
  product: productRouter,
  sale: saleRouter,
  tableSession: tableSessionRouter,
  user: usersRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.product.list();
 *       ^? Product[]
 */
export const createCaller = createCallerFactory(appRouter);
