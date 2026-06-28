import { type NextRequest, NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { createSupabaseServiceClient, LOGO_BUCKET } from "~/lib/supabase-server";

const ALLOWED_TYPES = ["image/png", "image/webp", "image/svg+xml"];
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const LOGO_PATH = (businessId: string) => `${businessId}/logo`;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const businessId = session.user.businessId;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Formato no permitido. Usa PNG, WebP o SVG." },
      { status: 400 },
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "El archivo supera el límite de 2 MB." },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServiceClient();
  const path = LOGO_PATH(businessId);

  // Eliminar logo anterior si existe
  const business = await db.business.findUnique({
    where: { id: businessId },
    select: { logoUrl: true },
  });
  if (business?.logoUrl) {
    await supabase.storage.from(LOGO_BUCKET).remove([path]);
  }

  // Subir nuevo logo
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Error al subir: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const { data: urlData } = supabase.storage
    .from(LOGO_BUCKET)
    .getPublicUrl(path);

  // Agregar cache-buster para que el navegador no use versión anterior
  const logoUrl = `${urlData.publicUrl}?t=${Date.now()}`;

  await db.business.update({
    where: { id: businessId },
    data: { logoUrl },
  });

  return NextResponse.json({ logoUrl });
}

export async function DELETE(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const businessId = session.user.businessId;

  const business = await db.business.findUnique({
    where: { id: businessId },
    select: { logoUrl: true },
  });

  if (business?.logoUrl) {
    const supabase = createSupabaseServiceClient();
    await supabase.storage.from(LOGO_BUCKET).remove([LOGO_PATH(businessId)]);
  }

  await db.business.update({
    where: { id: businessId },
    data: { logoUrl: null },
  });

  return NextResponse.json({ ok: true });
}
