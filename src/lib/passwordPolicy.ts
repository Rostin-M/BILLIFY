// Política de contraseñas nuevas de los negocios (dueños y cajeros).
// La comparten el servidor (passwordPolicySchema) y los formularios, para que
// la lista de requisitos que ve el usuario sea exactamente la que se valida.
// El administrador de la plataforma tiene su propia política, más estricta
// (server/auth/platformAdminPolicy.ts).

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

const LETTER = /\p{L}/u;
const DIGIT = /\p{N}/u;
const SYMBOL = /[^\p{L}\p{N}\s]/u;

export type PasswordRule = { id: "length" | "letter" | "number" | "symbol"; label: string; test: (password: string) => boolean };

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: "length", label: `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`, test: (p) => p.length >= PASSWORD_MIN_LENGTH },
  { id: "letter", label: "Al menos una letra", test: (p) => LETTER.test(p) },
  { id: "number", label: "Al menos un número", test: (p) => DIGIT.test(p) },
  { id: "symbol", label: "Al menos un carácter especial (!@#$%…)", test: (p) => SYMBOL.test(p) },
];

/** Mensajes del servidor, en el mismo orden que PASSWORD_RULES. */
export const PASSWORD_RULE_ERRORS = {
  length: `La contraseña debe tener mínimo ${PASSWORD_MIN_LENGTH} caracteres`,
  letter: "La contraseña debe incluir al menos una letra",
  number: "La contraseña debe incluir al menos un número",
  symbol: "La contraseña debe incluir al menos un carácter especial",
} as const;

export function meetsPasswordPolicy(password: string): boolean {
  return password.length <= PASSWORD_MAX_LENGTH && PASSWORD_RULES.every((r) => r.test(password));
}

export type PasswordStrength = { score: 0 | 1 | 2 | 3 | 4; label: string };

const STRENGTH_LABELS = ["", "Débil", "Regular", "Buena", "Fuerte"] as const;

const COMMON_SEQUENCES = /0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf|zxcv/i;
const COMMON_WORDS = /password|contrase[ñn]a|clave|qwerty|admin|billify/i;

/**
 * Qué tan fuerte es la contraseña, solo como guía visual (lo que se exige es
 * meetsPasswordPolicy). Mientras no cumpla la política nunca pasa de "Regular".
 */
export function passwordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: "" };

  const hasUpper = /\p{Lu}/u.test(password);
  const hasLower = /\p{Ll}/u.test(password);
  let points = PASSWORD_RULES.filter((r) => r.test(password)).length;
  if (hasUpper && hasLower) points++;
  if (password.length >= 14) points++;
  if (password.length >= 18) points++;
  if (/(.)\1{2,}/u.test(password)) points--;
  if (COMMON_SEQUENCES.test(password)) points--;
  if (COMMON_WORDS.test(password)) points -= 2;

  let score: PasswordStrength["score"];
  if (!meetsPasswordPolicy(password)) score = points >= 3 ? 2 : 1;
  else if (points >= 6) score = 4;
  else if (points >= 4) score = 3;
  else score = 2;

  return { score, label: STRENGTH_LABELS[score] };
}
