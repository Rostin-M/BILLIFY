import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** Base desechable de docker-compose.test.yml (npm run test:db:up). */
export const TEST_DATABASE_URL = "postgresql://billify_test:billify_test@127.0.0.1:5433/billify_test";

/** Tests que usan la base de datos real. */
const INTEGRATION_TESTS = [
  "src/server/api/**/*.test.ts",
  "src/server/auth/credentials.test.ts",
  "src/server/auth/requirePageUser.test.ts",
  "src/server/lib/rateLimit.test.ts",
  "src/server/lib/authEvents.test.ts",
  "src/app/api/**/*.test.ts",
];

export default defineConfig({
  // tsconfig usa jsx: "preserve" (lo compila Next); en tests lo transforma Vite.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "~": fromRoot("./src"),
      // "server-only" lanza al importarse fuera de un React Server Component.
      "server-only": fromRoot("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    // next-auth importa "next/server" sin extensión: Vite debe resolverlo, no Node.
    server: { deps: { inline: ["next-auth"] } },
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcovonly"],
      reportsDirectory: "coverage",
      exclude: ["tests/**"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,mjs}"],
          exclude: INTEGRATION_TESTS,
          env: { SUPABASE_URL: "https://supabase.billify.test" },
        },
      },
      {
        extends: true,
        test: {
          // Routers tRPC contra una Postgres real: comparten la base, así que corren en serie.
          name: "integration",
          include: INTEGRATION_TESTS,
          env: {
            NODE_ENV: "test",
            DATABASE_URL: TEST_DATABASE_URL,
            DIRECT_URL: TEST_DATABASE_URL,
            BREVO_API_KEY: "test-brevo-key",
            SMTP_FROM: "facturacion@billify.test",
            SUPABASE_URL: "https://supabase.billify.test",
            SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
          },
          globalSetup: ["tests/integration/globalSetup.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
