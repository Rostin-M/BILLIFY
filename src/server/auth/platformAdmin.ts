import "server-only";

import { redirect } from "next/navigation";

import { auth } from "./index";
import { type ActiveUser, loadActiveUser } from "./currentUser";
import { isPlatformAdmin } from "./platformAdminPolicy";

export { isPlatformAdmin, PLATFORM_ADMIN_HOME } from "./platformAdminPolicy";

/**
 * Guardia para los Server Components de /admin. Revalida la sesión contra la BD
 * (el middleware solo vio el rol del JWT) y exige la doble llave de
 * `isPlatformAdmin`: rol SUPERADMIN sin negocio + correo en PLATFORM_ADMIN_EMAILS.
 *
 * Un SUPERADMIN cuyo correo salió de la lista ya no tiene sesión válida
 * (`loadActiveUser` devuelve null), así que termina en el login.
 */
export async function requirePlatformAdminPage(): Promise<ActiveUser> {
  const user = await loadActiveUser(await auth());
  if (!user) redirect("/auth/login");
  if (user.mustChangePassword) redirect("/auth/cambiar-contrasena");
  if (!isPlatformAdmin(user)) redirect("/");
  return user;
}
