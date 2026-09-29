import { describe, expect, it } from "vitest";

import { generateNumericCode, hashCode, verifyCode } from "./secureCode";

describe("secureCode", () => {
  it("genera códigos de 6 dígitos", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateNumericCode()).toMatch(/^\d{6}$/);
    }
  });

  it("hashea con SHA-256 ignorando espacios alrededor", () => {
    expect(hashCode(" 123456 ")).toBe(hashCode("123456"));
    expect(hashCode("123456")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifica el código correcto y rechaza los incorrectos", () => {
    const stored = hashCode("123456");
    expect(verifyCode("123456", stored)).toBe(true);
    expect(verifyCode("654321", stored)).toBe(false);
  });

  it("rechaza un hash almacenado con longitud distinta", () => {
    expect(verifyCode("123456", "abcd")).toBe(false);
  });
});
