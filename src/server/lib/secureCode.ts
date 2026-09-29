import "server-only";

import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/** Máximo de intentos fallidos por código antes de invalidarlo. */
export const MAX_CODE_ATTEMPTS = 5;

/** Código numérico de 6 dígitos generado con CSPRNG. */
export function generateNumericCode(): string {
  return String(randomInt(100000, 1000000));
}

/** Hash SHA-256 (hex) del código; es lo único que se guarda en la base de datos. */
export function hashCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

/** Compara un código en claro con su hash en tiempo constante. */
export function verifyCode(code: string, storedHash: string): boolean {
  const a = Buffer.from(hashCode(code), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
