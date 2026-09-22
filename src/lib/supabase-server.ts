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

export const LOGO_BUCKET = "business-logos";
// Comprobantes de pago (privado — se sirve siempre con URL firmada, nunca pública)
export const RECEIPTS_BUCKET = "payment-receipts";
