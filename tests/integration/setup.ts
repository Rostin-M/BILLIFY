import { afterAll, beforeEach, vi } from "vitest";

import { TEST_DATABASE_URL } from "../../vitest.config";

// Segunda barrera: nunca truncar una base que no sea la de prueba.
if (process.env.DATABASE_URL !== TEST_DATABASE_URL) {
  throw new Error("DATABASE_URL no apunta a la base de prueba; se cancelan los tests de integración.");
}

// NextAuth no se inicializa en tests: la sesión se inyecta directamente en el contexto del caller.
vi.mock("~/server/auth", () => ({
  auth: vi.fn(async () => null),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

// Ningún test envía correos reales.
vi.mock("~/server/lib/email", async (importOriginal) => {
  const original = await importOriginal<typeof import("~/server/lib/email")>();
  return {
    ...original,
    sendVerificationCode: vi.fn(async () => undefined),
    sendPasswordReset: vi.fn(async () => undefined),
    sendWelcomeEmail: vi.fn(async () => undefined),
    sendEmployeeWelcomeEmail: vi.fn(async () => undefined),
    sendInvoiceEmail: vi.fn(async () => undefined),
  };
});

// `after` de Next solo existe dentro de una petición: en tests se ejecuta en línea.
vi.mock("next/server", async (importOriginal) => {
  const original = await importOriginal<typeof import("next/server")>();
  return {
    ...original,
    after: (task: Promise<unknown> | (() => unknown)) => {
      void (typeof task === "function" ? Promise.resolve().then(task) : task);
    },
  };
});

// Import diferido: si los routers se cargaran aquí, los vi.mock de cada archivo de test
// llegarían tarde (el módulo ya estaría en caché).
beforeEach(async () => {
  const { resetDatabase } = await import("./helpers");
  await resetDatabase();
});

afterAll(async () => {
  const { db } = await import("~/server/db");
  await db.$disconnect();
});
