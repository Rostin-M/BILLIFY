import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

/**
 * Clave de idempotencia generada por el cliente (crypto.randomUUID()) una vez por acción
 * del usuario. Es opcional por compatibilidad con clientes viejos / la cola offline, pero
 * toda la UI la envía.
 */
export const idempotencyKeySchema = z.string().uuid("Clave de idempotencia inválida").optional();

/** true si el error es una violación de unicidad (P2002) — opcionalmente sobre un campo concreto. */
export function isUniqueViolation(error: unknown, fieldHint?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  if (!fieldHint) return true;
  const target = JSON.stringify(error.meta?.target ?? "") + String(error.message);
  return target.toLowerCase().includes(fieldHint.toLowerCase());
}

/**
 * Ejecuta una operación como máximo una vez por clave:
 *  1. Si ya existe un registro con esa clave, devuelve su resultado (reintento / doble clic).
 *  2. Si no, ejecuta `run` (normalmente la transacción completa).
 *  3. Si dos peticiones con la misma clave corren a la vez, la segunda choca con el índice
 *     único (P2002) y devuelve el resultado de la primera.
 *
 * `findExisting` debe usar el cliente global (no el de la transacción), porque tras un
 * P2002 la transacción ya está abortada.
 */
export async function runIdempotent<T>(params: {
  key: string | undefined;
  findExisting: () => Promise<T | null>;
  run: () => Promise<T>;
}): Promise<T> {
  const { key, findExisting, run } = params;
  if (!key) return run();

  const existing = await findExisting();
  if (existing) return existing;

  try {
    return await run();
  } catch (error) {
    if (isUniqueViolation(error, "idempotency")) {
      const winner = await findExisting();
      if (winner) return winner;
    }
    throw error;
  }
}
