/**
 * Extrae mensajes legibles de errores Zod/tRPC.
 * Devuelve fieldErrors (por campo) y formError (mensaje general).
 */
export function parseZodError(rawMessage: string): {
  fieldErrors: Record<string, string>;
  formError: string | null;
} {
  try {
    const issues = JSON.parse(rawMessage) as Array<{
      path: string[];
      message: string;
    }>;
    if (Array.isArray(issues) && issues.length > 0) {
      const fieldErrors: Record<string, string> = {};
      issues.forEach((issue) => {
        if (issue.path?.length) {
          const key = issue.path[issue.path.length - 1]!;
          fieldErrors[key] ??= issue.message;
        }
      });
      return { fieldErrors, formError: null };
    }
  } catch {
    // mensaje plano — no es JSON de Zod
  }
  return { fieldErrors: {}, formError: rawMessage };
}
