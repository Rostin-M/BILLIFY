import { describe, expect, it } from "vitest";

import { isSimpleEmail } from "./simpleEmail";

// [correo, válido como "responder a" (sin < > "), válido para el script de admin].
// Mismos resultados que daban las expresiones regulares que esta función reemplaza.
const CASES: [string, boolean, boolean][] = [
  ["ana@example.com", true, true],
  ["a@b.co", true, true],
  ["a.b@c.d.e", true, true],
  ["negocio@sub.dominio.com.co", true, true],
  ["", false, false],
  ["@", false, false],
  ["a@", false, false],
  ["@b.co", false, false],
  ["a@b", false, false],
  ["a@.co", false, false],
  ["a@b.", false, false],
  ["a@.", false, false],
  ["a@b..c", true, true],
  ["a@@b.co", false, false],
  ["a@b@c.co", false, false],
  ["a b@c.co", false, false],
  ["a@b .co", false, false],
  ["a\t@b.co", false, false],
  ["a@b.co\n", false, false],
  [" a@b.co", false, false],
  ["a<b@c.co", false, true],
  ["a@b>c.co", false, true],
  ['a"b@c.co', false, true],
  ["a@b.c<o", false, true],
  ["ñandú@café.co", true, true],
  ["a@b.c", true, true],
  ["..@..", false, false],
  ["a@...", true, true],
];

describe("isSimpleEmail", () => {
  it.each(CASES)("%j → responder a: %s, admin: %s", (value, replyTo, admin) => {
    expect(isSimpleEmail(value, '<>"')).toBe(replyTo);
    expect(isSimpleEmail(value)).toBe(admin);
  });

  it("responde rápido con textos largos hechos a propósito", () => {
    const evil = `a@${"a.".repeat(50_000)}@`;
    const start = performance.now();
    expect(isSimpleEmail(evil)).toBe(false);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
