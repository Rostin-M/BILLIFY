import "server-only";

import { type NextRequest, NextResponse } from "next/server";

import { type ActiveUser } from "~/server/auth/currentUser";
import { requireApiUser } from "~/server/auth/requirePageUser";
import { type DetectedImage, DECLARED_IMAGE_TYPES, detectImageType } from "~/server/lib/imageValidation";
import { consumeRateLimit, RATE_LIMITS } from "~/server/lib/rateLimit";

const NO_STORE = { "Cache-Control": "no-store" };

/** Respuesta JSON que nunca se cachea (ni en el navegador ni en la CDN). */
export function jsonNoStore(body: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...extraHeaders } });
}

/**
 * Rechaza peticiones con Origin de otro sitio. Los navegadores siempre envían
 * Origin en POST/DELETE con fetch; si viene y no coincide con el host, es CSRF.
 */
function isCrossOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("host") ?? req.nextUrl.host;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

type GuardOk = { ok: true; user: ActiveUser & { businessId: string } };
type GuardFail = { ok: false; response: NextResponse };

/**
 * Controles comunes de las rutas de subida: origen, sesión vigente, negocio,
 * rol (opcional) y límite de subidas por usuario.
 */
export async function guardUpload(
  req: NextRequest,
  opts: { ownerOnly?: boolean } = {},
): Promise<GuardOk | GuardFail> {
  if (isCrossOrigin(req)) {
    return { ok: false, response: jsonNoStore({ error: "Origen no permitido" }, 403) };
  }

  const user = await requireApiUser();
  if (!user) {
    return { ok: false, response: jsonNoStore({ error: "No autorizado" }, 401) };
  }
  const businessId = user.businessId;
  if (!businessId) {
    return { ok: false, response: jsonNoStore({ error: "Sin negocio asociado" }, 403) };
  }
  if (opts.ownerOnly && user.role !== "OWNER") {
    return {
      ok: false,
      response: jsonNoStore({ error: "Solo el propietario puede hacer esto" }, 403),
    };
  }

  const limit = await consumeRateLimit(`upload:user:${user.id}`, RATE_LIMITS.uploadByUser);
  if (!limit.allowed) {
    return {
      ok: false,
      response: jsonNoStore(
        { error: "Demasiadas subidas. Espera unos minutos e inténtalo de nuevo." },
        429,
        { "Retry-After": String(limit.retryAfterSec) },
      ),
    };
  }

  return { ok: true, user: { ...user, businessId } };
}

type ReadOk = { ok: true; buffer: Buffer; image: DetectedImage };

/**
 * Lee el campo `file` del formulario y valida tamaño y firma binaria.
 * El tamaño se revisa antes de leer (Content-Length y file.size) y después
 * (longitud real del buffer).
 */
export async function readImageUpload(
  req: NextRequest,
  maxBytes: number,
  messages: { tooLarge: string; badType: string },
): Promise<ReadOk | GuardFail> {
  // Margen para los encabezados multipart.
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > maxBytes + 64 * 1024) {
    return { ok: false, response: jsonNoStore({ error: messages.tooLarge }, 413) };
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return { ok: false, response: jsonNoStore({ error: "Solicitud inválida" }, 400) };
  }
  if (!file || typeof file === "string") {
    return { ok: false, response: jsonNoStore({ error: "Archivo requerido" }, 400) };
  }
  // Filtro barato: el tipo real se comprueba abajo por magic bytes.
  if (file.type && !DECLARED_IMAGE_TYPES.has(file.type)) {
    return { ok: false, response: jsonNoStore({ error: messages.badType }, 400) };
  }
  if (file.size === 0) {
    return { ok: false, response: jsonNoStore({ error: "El archivo está vacío." }, 400) };
  }
  if (file.size > maxBytes) {
    return { ok: false, response: jsonNoStore({ error: messages.tooLarge }, 413) };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > maxBytes) {
    return { ok: false, response: jsonNoStore({ error: messages.tooLarge }, 413) };
  }

  const image = detectImageType(buffer);
  if (!image) {
    return { ok: false, response: jsonNoStore({ error: messages.badType }, 400) };
  }

  return { ok: true, buffer, image };
}
