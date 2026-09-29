import { execSync } from "node:child_process";

import { TEST_DATABASE_URL } from "../../vitest.config";

/**
 * Aplica las migraciones a la base de prueba antes de correr los tests de integración.
 * Se niega a correr contra cualquier otra base: los tests truncan todas las tablas.
 */
export default function setup() {
  const url = new URL(TEST_DATABASE_URL);
  if (url.hostname !== "127.0.0.1" || url.port !== "5433" || !url.pathname.endsWith("_test")) {
    throw new Error(`Los tests de integración solo corren contra la base de prueba local, no contra ${url.host}.`);
  }

  try {
    execSync("npx prisma migrate deploy", {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, DIRECT_URL: TEST_DATABASE_URL },
    });
  } catch (error) {
    const output = (error as { stderr?: Buffer }).stderr?.toString() ?? String(error);
    throw new Error(
      `No se pudo preparar la base de prueba. ¿Está arriba? Ejecuta "npm run test:db:up".\n${output}`,
    );
  }
}
