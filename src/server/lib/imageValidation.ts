import "server-only";

/**
 * Validación de imágenes subidas por firma binaria ("magic bytes").
 * El `file.type` que envía el navegador lo controla el cliente, así que solo
 * sirve como filtro barato; el tipo real se deduce de los primeros bytes y de
 * ahí salen el content-type y la extensión con que se guarda el archivo.
 * SVG no se acepta nunca (puede llevar scripts).
 */

export type ImageKind = "png" | "jpeg" | "webp";

export type DetectedImage = {
  kind: ImageKind;
  contentType: "image/png" | "image/jpeg" | "image/webp";
  ext: "png" | "jpg" | "webp";
};

const DETECTED: Record<ImageKind, DetectedImage> = {
  png: { kind: "png", contentType: "image/png", ext: "png" },
  jpeg: { kind: "jpeg", contentType: "image/jpeg", ext: "jpg" },
  webp: { kind: "webp", contentType: "image/webp", ext: "webp" },
};

/** Tipos MIME declarados que se dejan pasar al primer filtro. */
export const DECLARED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(buf: Uint8Array, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

function ascii(s: string): number[] {
  return Array.from(s, (c) => c.codePointAt(0)!);
}

/** Devuelve el tipo real de la imagen o null si no es PNG, JPEG ni WebP. */
export function detectImageType(buf: Uint8Array): DetectedImage | null {
  if (startsWith(buf, PNG_SIGNATURE)) return DETECTED.png;
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return DETECTED.jpeg;
  // WebP: "RIFF" <tamaño 4 bytes> "WEBP"
  if (startsWith(buf, ascii("RIFF")) && startsWith(buf, ascii("WEBP"), 8)) return DETECTED.webp;
  return null;
}
