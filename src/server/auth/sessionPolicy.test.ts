import { describe, expect, it } from "vitest";

import { SESSION_MAX_AGE_SEC, isLoginFresh } from "./sessionPolicy";

describe("isLoginFresh", () => {
  const now = 1_800_000_000_000;

  it("acepta un login reciente", () => {
    expect(isLoginFresh(now - 1000, now)).toBe(true);
  });

  it("rechaza un login con 24 h o más", () => {
    expect(isLoginFresh(now - SESSION_MAX_AGE_SEC * 1000, now)).toBe(false);
  });

  it("tolera hasta 1 minuto de desfase hacia el futuro", () => {
    expect(isLoginFresh(now + 60_000, now)).toBe(true);
    expect(isLoginFresh(now + 60_001, now)).toBe(false);
  });

  it("rechaza valores que no son un epoch válido", () => {
    expect(isLoginFresh(undefined, now)).toBe(false);
    expect(isLoginFresh("1800000000000", now)).toBe(false);
    expect(isLoginFresh(Number.NaN, now)).toBe(false);
    expect(isLoginFresh(Number.POSITIVE_INFINITY, now)).toBe(false);
  });

  it("usa Date.now() por defecto", () => {
    expect(isLoginFresh(Date.now())).toBe(true);
  });
});
