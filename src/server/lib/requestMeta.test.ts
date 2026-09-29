import { describe, expect, it } from "vitest";

import { getClientIp, getUserAgent } from "./requestMeta";

describe("getClientIp", () => {
  it("prioriza x-real-ip", () => {
    const headers = new Headers({ "x-real-ip": " 1.1.1.1 ", "x-forwarded-for": "2.2.2.2" });
    expect(getClientIp(headers)).toBe("1.1.1.1");
  });

  it("usa la primera IP de x-forwarded-for", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": " 3.3.3.3 , 4.4.4.4" }))).toBe("3.3.3.3");
  });

  it("devuelve unknown sin cabeceras útiles", () => {
    expect(getClientIp(new Headers())).toBe("unknown");
    expect(getClientIp(new Headers({ "x-forwarded-for": " , 5.5.5.5" }))).toBe("unknown");
  });
});

describe("getUserAgent", () => {
  it("recorta el user-agent a 300 caracteres", () => {
    expect(getUserAgent(new Headers({ "user-agent": "a".repeat(500) }))).toHaveLength(300);
  });

  it("devuelve null si no hay user-agent", () => {
    expect(getUserAgent(new Headers())).toBeNull();
  });
});
