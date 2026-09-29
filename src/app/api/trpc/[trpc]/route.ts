import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";

import { env } from "~/env";
import { appRouter } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a HTTP request (e.g. when you make requests from Client Components).
 */
const createContext = async (req: NextRequest) => {
  return createTRPCContext({
    headers: req.headers,
  });
};

/** Máximo de procedimientos por petición batch (el cliente usa el mismo límite). */
const MAX_BATCH_SIZE = 10;

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req),
    maxBatchSize: MAX_BATCH_SIZE,
    // Nunca registrar input ni ctx: pueden contener contraseñas o datos de clientes.
    onError: ({ path, error }) => {
      if (env.NODE_ENV === "development") {
        console.error(`❌ tRPC failed on ${path ?? "<no-path>"}: ${error.message}`);
        return;
      }
      console.error("[tRPC]", path ?? "<no-path>", error.code, error.message);
    },
  });

export { handler as GET, handler as POST };
