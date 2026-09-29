import "server-only";

import { type UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "./index";
import { type ActiveUser, loadActiveUser } from "./currentUser";

/**
 * Guardia para Server Components de páginas protegidas. Revalida la sesión
 * contra la BD y redirige si no es válida, si el usuario debe cambiar su
 * contraseña o si su rol no está permitido.
 */
export async function requirePageUser(
  opts: { roles?: UserRole[]; fallback?: string } = {},
): Promise<ActiveUser> {
  const user = await loadActiveUser(await auth());
  if (!user) redirect("/auth/login");
  if (user.mustChangePassword) redirect("/auth/cambiar-contrasena");
  if (opts.roles && !opts.roles.includes(user.role)) redirect(opts.fallback ?? "/");
  return user;
}

/**
 * Para route handlers (`/api/*` fuera de tRPC). Devuelve null si la sesión no
 * es válida o si el usuario aún debe cambiar su contraseña; el handler debe
 * responder 401 en ese caso.
 */
export async function requireApiUser(): Promise<ActiveUser | null> {
  const user = await loadActiveUser(await auth());
  if (!user || user.mustChangePassword) return null;
  return user;
}
