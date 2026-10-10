/**
 * Quién es administrador de la plataforma (panel /admin). Doble llave:
 *  1. La cuenta tiene rol SUPERADMIN y NO pertenece a ningún negocio.
 *  2. Su correo está en PLATFORM_ADMIN_EMAILS (lista separada por comas).
 *
 * Falla cerrado: sin la variable, o si el correo no está en ella, la cuenta no
 * es administradora aunque tenga el rol en la BD (p. ej. por un UPDATE indebido).
 *
 * Módulo sin dependencias de servidor (como sessionPolicy.ts). La variable se
 * lee de `process.env` en cada llamada, no de `~/env`: quitar un correo de la
 * lista corta el acceso sin esperar a que se recargue el módulo.
 */
import { type UserRole } from "@prisma/client";

export const PLATFORM_ADMIN_ROLE = "SUPERADMIN" satisfies UserRole;

/** Ruta de inicio del panel; a ella se envía al administrador desde la app de negocio. */
export const PLATFORM_ADMIN_HOME = "/admin";

export type PlatformAdminCandidate = {
  role: UserRole;
  businessId: string | null;
  email: string | null;
};

/** "Ana@x.co, beto@x.co" → {"ana@x.co", "beto@x.co"}. Entradas vacías se ignoran. */
export function parsePlatformAdminEmails(raw: string | undefined | null): ReadonlySet<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  );
}

export function isPlatformAdmin(user: PlatformAdminCandidate | null | undefined): boolean {
  if (!user) return false;
  if (user.role !== PLATFORM_ADMIN_ROLE) return false;
  if (user.businessId !== null) return false;
  const email = user.email?.trim().toLowerCase();
  if (!email) return false;
  return parsePlatformAdminEmails(process.env.PLATFORM_ADMIN_EMAILS).has(email);
}

// ─── Contraseña del administrador ────────────────────────────────────────────

export const PLATFORM_ADMIN_PASSWORD_MIN = 14;
/** bcrypt ignora lo que pase de 72 bytes. */
const PLATFORM_ADMIN_PASSWORD_MAX_BYTES = 72;

/**
 * Política de contraseña del administrador, más estricta que la de los negocios.
 * Devuelve el motivo por el que no sirve ("debe ...") o null si es válida.
 * Es la misma que aplica scripts/create-platform-admin.mjs al crear la cuenta:
 * si cambias una, cambia la otra.
 */
export function platformAdminPasswordProblem(password: string, email: string | null): string | null {
  if (password.length < PLATFORM_ADMIN_PASSWORD_MIN) return `debe tener mínimo ${PLATFORM_ADMIN_PASSWORD_MIN} caracteres`;
  if (new TextEncoder().encode(password).length > PLATFORM_ADMIN_PASSWORD_MAX_BYTES) {
    return `debe ocupar máximo ${PLATFORM_ADMIN_PASSWORD_MAX_BYTES} bytes`;
  }
  if (!/[a-z]/.test(password)) return "debe incluir una letra minúscula";
  if (!/[A-Z]/.test(password)) return "debe incluir una letra mayúscula";
  if (!/\d/.test(password)) return "debe incluir un número";
  if (!/[^A-Za-z0-9]/.test(password)) return "debe incluir un símbolo";
  if (/^\s|\s$/.test(password)) return "no puede empezar ni terminar con espacios";
  const localPart = email?.trim().toLowerCase().split("@")[0] ?? "";
  if (localPart.length >= 4 && password.toLowerCase().includes(localPart)) return "no puede contener tu correo";
  return null;
}
