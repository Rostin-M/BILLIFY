/**
 * Datos de los documentos legales (términos, datos personales y cookies).
 * Los usan las páginas de /legal, el registro y el correo de constancia.
 * Los campos vacíos opcionales simplemente no se muestran; los obligatorios
 * vacíos muestran un marcador amarillo [ ... ] (no publicar así).
 */
export const LEGAL_INFO: Readonly<Record<
  "ownerName" | "ownerId" | "city" | "address" | "contactEmail" | "privacyEmail" | "retentionAfterCancel",
  string
>> = {
  /** Nombre con el que se presenta el servicio en los documentos. */
  ownerName: "BILLIFY Business",
  /** Opcional: "NIT 901.234.567-8" cuando exista una empresa constituida. */
  ownerId: "",
  /** Opcional: ciudad de domicilio (define los jueces competentes). */
  city: "",
  /** Opcional: dirección física de notificación. */
  address: "",
  /** Correo general de soporte y contacto. */
  contactEmail: "billify.business@gmail.com",
  /** Correo para consultas y reclamos de datos personales. */
  privacyEmail: "billify.business@gmail.com",
  /** Cuánto se conservan los datos tras cancelar. */
  retentionAfterCancel: "6 meses",
};

/**
 * Versión vigente de los documentos. Cámbiala (y `LEGAL_UPDATED_AT`) cada vez
 * que se modifique su contenido: cada aceptación queda guardada con la versión
 * que se aceptó.
 */
export const LEGAL_VERSION = "2026-10-19";
export const LEGAL_UPDATED_AT = "19 de octubre de 2026";

export const LEGAL_DOCUMENTS = [
  { path: "/legal/terminos", title: "Términos y Condiciones" },
  { path: "/legal/privacidad", title: "Política de Tratamiento de Datos Personales" },
  { path: "/legal/cookies", title: "Política de Cookies" },
] as const;

/** "© 2026 BILLIFY Business. Todos los derechos reservados." */
export function copyrightNotice(year = new Date().getFullYear()): string {
  return `© ${year} ${LEGAL_INFO.ownerName}. Todos los derechos reservados.`;
}
