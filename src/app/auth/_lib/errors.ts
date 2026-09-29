import { firstErrorMessage } from "~/lib/parseZodError";

/** Forma mínima de un error de tRPC en el cliente. */
type ClientError = {
  message: string;
  data?: { code?: string } | null;
};

export const TOO_MANY_REQUESTS_MESSAGE =
  "Demasiados intentos. Por seguridad, espera unos minutos e inténtalo de nuevo.";

/** Mensaje para mostrar al usuario, con un texto amable para el límite de intentos. */
export function friendlyError(error: ClientError): string {
  if (error.data?.code === "TOO_MANY_REQUESTS") return TOO_MANY_REQUESTS_MESSAGE;
  if (error.data?.code === "UNAUTHORIZED") {
    return "Tu sesión expiró. Inicia sesión nuevamente.";
  }
  return firstErrorMessage(error.message);
}
