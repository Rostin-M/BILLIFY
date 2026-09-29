/**
 * Política de sesión compartida entre el middleware (Edge) y el servidor (Node).
 * Este archivo NO debe importar nada de Node (Prisma, bcrypt, server-only).
 */

/** Duración absoluta de una sesión: se cierra 24 h después del login, sin renovarse. */
export const SESSION_MAX_AGE_SEC = 24 * 60 * 60;

/** true si el login (epoch ms) sigue dentro del plazo absoluto de 24 h. */
export function isLoginFresh(loginAt: unknown, now = Date.now()): loginAt is number {
  return (
    typeof loginAt === "number" &&
    Number.isFinite(loginAt) &&
    loginAt <= now + 60_000 && // tolera 1 min de desfase de reloj
    now < loginAt + SESSION_MAX_AGE_SEC * 1000
  );
}
