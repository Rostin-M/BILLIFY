import "server-only";

import { type UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "./index";
import { type ActiveUser, loadActiveUser } from "./currentUser";
import { PLATFORM_ADMIN_HOME, PLATFORM_ADMIN_ROLE } from "./platformAdminPolicy";

/** Roles de la app de negocio (todos menos el administrador de la plataforma). */
export type BusinessRole = Exclude<UserRole, typeof PLATFORM_ADMIN_ROLE>;
export type BusinessPageUser = Omit<ActiveUser, "role"> & { role: BusinessRole };

/**
 * Guardia para Server Components de páginas protegidas de la app de negocio.
 * Revalida la sesión contra la BD y redirige si no es válida, si el usuario
 * debe cambiar su contraseña o si su rol no está permitido.
 *
 * El administrador de la plataforma (SUPERADMIN) nunca entra a estas páginas:
 * se le envía a su panel. Las de /admin usan `requirePlatformAdminPage`.
 */
export async function requirePageUser(
  opts: { roles?: BusinessRole[]; fallback?: string } = {},
): Promise<BusinessPageUser> {
  const user = await loadActiveUser(await auth());
  if (!user) redirect("/auth/login");
  if (user.mustChangePassword) redirect("/auth/cambiar-contrasena");
  if (user.role === PLATFORM_ADMIN_ROLE) redirect(PLATFORM_ADMIN_HOME);
  const role = user.role;
  if (opts.roles && !opts.roles.includes(role)) redirect(opts.fallback ?? "/");
  return { ...user, role };
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
