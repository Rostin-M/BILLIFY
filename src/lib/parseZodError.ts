/**
 * Lectura de mensajes de error de tRPC en el cliente. Los errores de validación de
 * Zod llegan como un arreglo JSON de issues en `error.message`; el resto, como texto.
 */

type ZodIssueLike = { path?: string[]; message?: string };

/** Issues de Zod contenidos en el mensaje, o null si es un mensaje plano. */
function parseIssues(rawMessage: string): ZodIssueLike[] | null {
  try {
    const parsed: unknown = JSON.parse(rawMessage);
    return Array.isArray(parsed) ? (parsed as ZodIssueLike[]) : null;
  } catch {
    // mensaje plano — no es JSON de Zod
    return null;
  }
}

/**
 * Extrae mensajes legibles de errores Zod/tRPC.
 * Devuelve fieldErrors (por campo) y formError (mensaje general).
 */
export function parseZodError(rawMessage: string): {
  fieldErrors: Record<string, string>;
  formError: string | null;
} {
  const issues = parseIssues(rawMessage);
  if (!issues || issues.length === 0) {
    return { fieldErrors: {}, formError: rawMessage };
  }
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path?.at(-1);
    if (key !== undefined && issue.message !== undefined) fieldErrors[key] ??= issue.message;
  }
  return { fieldErrors, formError: null };
}

/** Primer mensaje legible: el del primer issue de Zod que tenga texto, o el mensaje plano. */
export function firstErrorMessage(rawMessage: string): string {
  return parseIssues(rawMessage)?.find((issue) => issue.message)?.message ?? rawMessage;
}
