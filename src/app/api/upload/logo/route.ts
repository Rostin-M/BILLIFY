import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { createSupabaseServiceClient, LOGO_BUCKET, objectPathFromPublicUrl } from "~/lib/supabase-server";
import { db } from "~/server/db";
import { guardUpload, jsonNoStore, readImageUpload } from "../_shared";

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB, igual que el límite del bucket

const GENERIC_ERROR = "No se pudo guardar el logo. Inténtalo de nuevo.";

/** Borra el logo anterior solo si su ruta está dentro de la carpeta del negocio. */
async function removeOldLogo(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  businessId: string,
  oldUrl: string | null | undefined,
) {
  if (!oldUrl) return;
  const oldPath = objectPathFromPublicUrl(oldUrl, LOGO_BUCKET);
  if (!oldPath?.startsWith(`${businessId}/`)) return;
  const { error } = await supabase.storage.from(LOGO_BUCKET).remove([oldPath]);
  if (error) console.error("[upload:logo] no se pudo borrar el logo anterior:", error.message);
}

export async function POST(req: NextRequest) {
  const guard = await guardUpload(req, { ownerOnly: true });
  if (!guard.ok) return guard.response;
  const { businessId } = guard.user;

  const upload = await readImageUpload(req, MAX_SIZE, {
    tooLarge: "El archivo supera el límite de 2 MB.",
    badType: "Formato no permitido. Usa PNG, JPG o WebP.",
  });
  if (!upload.ok) return upload.response;
  const { buffer, image } = upload;

  // Nombre único por subida: evita cachés viejas y que se pise otro archivo.
  const path = `${businessId}/${Date.now()}-${randomUUID()}.${image.ext}`;

  try {
    const supabase = createSupabaseServiceClient();
    const { error: uploadError } = await supabase.storage
      .from(LOGO_BUCKET)
      .upload(path, buffer, { contentType: image.contentType, upsert: false });
    if (uploadError) {
      console.error("[upload:logo] fallo al subir:", uploadError.message);
      return jsonNoStore({ error: GENERIC_ERROR }, 500);
    }

    const { data: urlData } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
    const logoUrl = urlData.publicUrl;

    const previous = await db.business.findUnique({
      where: { id: businessId },
      select: { logoUrl: true },
    });
    await db.business.update({ where: { id: businessId }, data: { logoUrl } });

    // Se borra el anterior después de guardar el nuevo, para no dejar al negocio sin logo.
    await removeOldLogo(supabase, businessId, previous?.logoUrl);

    return jsonNoStore({ logoUrl });
  } catch (err) {
    console.error("[upload:logo] error de almacenamiento:", err instanceof Error ? err.message : "desconocido");
    return jsonNoStore({ error: GENERIC_ERROR }, 500);
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await guardUpload(req, { ownerOnly: true });
  if (!guard.ok) return guard.response;
  const { businessId } = guard.user;

  try {
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: { logoUrl: true },
    });

    await db.business.update({ where: { id: businessId }, data: { logoUrl: null } });

    if (business?.logoUrl) {
      await removeOldLogo(createSupabaseServiceClient(), businessId, business.logoUrl);
    }

    return jsonNoStore({ ok: true });
  } catch (err) {
    console.error("[upload:logo] error al eliminar:", err instanceof Error ? err.message : "desconocido");
    return jsonNoStore({ error: "No se pudo eliminar el logo." }, 500);
  }
}
