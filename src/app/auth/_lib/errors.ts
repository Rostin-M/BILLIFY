/** Forma mínima de un error de tRPC en el cliente. */
type ClientError = {
  message: string;
  data?: { code?: string } | null;
};

export const TOO_MANY_REQUESTS_MESSAGE =
  "Demasiados intentos. Por seguridad, espera unos minutos e inténtalo de nuevo.";

/** Primer mensaje legible: los errores de zod llegan como un arreglo JSON. */
function parseErrorMessage(rawMessage: string): string {
  try {
    const parsed = JSON.parse(rawMessage) as Array<{ message?: string }>;
    if (Array.isArray(parsed)) {
      const first = parsed.find((e) => e.message)?.message;
      if (first) return first;
    }
  } catch {
    // mensaje plano
  }
  return rawMessage;
}

/** Mensaje para mostrar al usuario, con un texto amable para el límite de intentos. */
export function friendlyError(error: ClientError): string {
  if (error.data?.code === "TOO_MANY_REQUESTS") return TOO_MANY_REQUESTS_MESSAGE;
  if (error.data?.code === "UNAUTHORIZED") {
    return "Tu sesión expiró. Inicia sesión nuevamente.";
  }
  return parseErrorMessage(error.message);
}
