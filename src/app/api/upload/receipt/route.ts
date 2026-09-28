import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { createSupabaseServiceClient, RECEIPTS_BUCKET } from "~/lib/supabase-server";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE = 8 * 1024 * 1024; // 8 MB — fotos de cámara móvil

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

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
      { error: "Formato no permitido. Usa una foto en JPG, PNG o WebP." },
      { status: 400 },
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "La foto supera el límite de 8 MB." },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServiceClient();

  // El bucket puede no existir todavía en este proyecto de Supabase — se crea la primera vez.
  const { error: bucketError } = await supabase.storage.createBucket(RECEIPTS_BUCKET, {
    public: false,
  });
  if (bucketError && !bucketError.message.toLowerCase().includes("already exists")) {
    return NextResponse.json(
      { error: `No se pudo preparar el almacenamiento: ${bucketError.message}` },
      { status: 500 },
    );
  }

  const ext = EXT_BY_TYPE[file.type] ?? "jpg";
  const path = `${businessId}/${Date.now()}-${randomUUID()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, buffer, { contentType: file.type });

  if (uploadError) {
    return NextResponse.json(
      { error: `Error al subir: ${uploadError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ path });
}
