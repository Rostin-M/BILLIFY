import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { createSupabaseServiceClient, RECEIPTS_BUCKET } from "~/lib/supabase-server";
import { db } from "~/server/db";
import { consumeStorage } from "~/server/subscription/quotas";
import { requireSubscription } from "~/server/subscription/service";
import { guardUpload, jsonNoStore, readImageUpload } from "../_shared";

// 4 MB: el límite de cuerpo de Vercel es 4.5 MB. Coincide con el límite del bucket.
const MAX_SIZE = 4 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const guard = await guardUpload(req);
  if (!guard.ok) return guard.response;
  const { businessId } = guard.user;

  const upload = await readImageUpload(req, MAX_SIZE, {
    tooLarge: "La foto supera el límite de 4 MB.",
    badType: "Formato no permitido. Usa una foto en JPG, PNG o WebP.",
  });
  if (!upload.ok) return upload.response;
  const { buffer, image } = upload;

  // Espacio del plan: se reserva antes de subir y se devuelve si la subida falla.
  const sub = await requireSubscription(db, businessId);
  const quota = await consumeStorage(db, businessId, sub.billing.plan, buffer.length);
  if (!quota.ok) return jsonNoStore({ error: quota.message }, 403);

  // Ruta generada en el servidor: el cliente nunca decide dónde se guarda.
  const path = `${businessId}/${Date.now()}-${randomUUID()}.${image.ext}`;

  const fail = async (status: number) => {
    await quota.release().catch(() => null);
    return jsonNoStore({ error: "No se pudo subir la foto. Inténtalo de nuevo." }, status);
  };

  try {
    const supabase = createSupabaseServiceClient();
    // El bucket lo crea la migración de seguridad; si falta, se registra y se responde genérico.
    const { error } = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .upload(path, buffer, { contentType: image.contentType, upsert: false });
    if (error) {
      console.error("[upload:receipt] fallo al subir:", error.message);
      return fail(500);
    }
  } catch (err) {
    console.error("[upload:receipt] error de almacenamiento:", err instanceof Error ? err.message : "desconocido");
    return fail(500);
  }

  return jsonNoStore({ path });
}
