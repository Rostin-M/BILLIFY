import { describe, expect, it } from "vitest";

import { meetsPasswordPolicy, PASSWORD_RULES, passwordStrength } from "./passwordPolicy";

const passing = (password: string) => PASSWORD_RULES.filter((r) => r.test(password)).map((r) => r.id);

describe("política de contraseñas", () => {
  it("exige longitud, letra, número y carácter especial", () => {
    expect(passing("")).toEqual([]);
    expect(passing("abc")).toEqual(["letter"]);
    expect(passing("PanFresco2026")).toEqual(["length", "letter", "number"]);
    expect(passing("PanFresco-2026")).toEqual(["length", "letter", "number", "symbol"]);
    expect(meetsPasswordPolicy("PanFresco-2026")).toBe(true);
    expect(meetsPasswordPolicy("PanFresco2026")).toBe(false);
  });

  it("acepta letras con tilde y la ñ, y no cuenta los espacios como símbolo", () => {
    expect(passing("Ñandú 2026 ")).toEqual(["length", "letter", "number"]);
    expect(meetsPasswordPolicy("Ñandú-2026")).toBe(true);
  });

  it("rechaza contraseñas más largas que el máximo", () => {
    expect(meetsPasswordPolicy(`a1!${"x".repeat(126)}`)).toBe(false);
  });
});

describe("fuerza de la contraseña", () => {
  it("no muestra nada sin contraseña", () => {
    expect(passwordStrength("")).toEqual({ score: 0, label: "" });
  });

  it("no pasa de Regular mientras no cumpla la política", () => {
    expect(passwordStrength("abc").score).toBe(1);
    expect(passwordStrength("PanFresco2026").score).toBe(2);
  });

  it("sube con la longitud y la variedad", () => {
    expect(passwordStrength("panfresco-2026")).toEqual({ score: 3, label: "Buena" });
    expect(passwordStrength("PanFresco-del-2026")).toEqual({ score: 4, label: "Fuerte" });
  });

  it("baja con patrones comunes", () => {
    expect(passwordStrength("Password-1234").score).toBeLessThan(passwordStrength("Girasol-9071").score);
  });
});
