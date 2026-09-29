import "server-only";

import { createClient } from "@supabase/supabase-js";
import { env } from "~/env";

export function createSupabaseServiceClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridas para operaciones de almacenamiento.",
    );
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// Logos (público: se muestran en facturas y en la app). Límite 2 MB, PNG/JPEG/WebP.
export const LOGO_BUCKET = "business-logos";
// Comprobantes de pago (privado — se sirve siempre con URL firmada, nunca pública). Límite 4 MB.
export const RECEIPTS_BUCKET = "payment-receipts";

/**
 * Extrae la ruta del objeto dentro del bucket a partir de su URL pública
 * (`.../storage/v1/object/public/<bucket>/<ruta>?t=...`). Devuelve null si la
 * URL no corresponde a ese bucket o la ruta es sospechosa.
 */
export function objectPathFromPublicUrl(publicUrl: string, bucket: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(publicUrl).pathname;
  } catch {
    return null;
  }
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = pathname.indexOf(marker);
  if (idx === -1) return null;
  let objectPath: string;
  try {
    objectPath = decodeURIComponent(pathname.slice(idx + marker.length));
  } catch {
    return null;
  }
  if (!objectPath || objectPath.includes("..") || objectPath.startsWith("/")) return null;
  return objectPath;
}
