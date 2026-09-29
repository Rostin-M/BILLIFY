import "server-only";

/**
 * IP del cliente detrás del proxy de Vercel. Vercel sobrescribe x-real-ip y
 * x-forwarded-for, así que en producción no se pueden falsificar desde el cliente.
 */
export function getClientIp(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded && forwarded.length > 0 ? forwarded : "unknown";
}

export function getUserAgent(headers: Headers): string | null {
  const ua = headers.get("user-agent");
  return ua ? ua.slice(0, 300) : null;
}
