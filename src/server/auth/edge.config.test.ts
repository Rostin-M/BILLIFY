import type { Session } from "next-auth";
import { describe, expect, it } from "vitest";

import { type AuthorizedUser, edgeAuthConfig } from "./edge.config";

type JwtParams = Parameters<typeof edgeAuthConfig.callbacks.jwt>[0];
type SessionParams = Parameters<typeof edgeAuthConfig.callbacks.session>[0];

const authorized: AuthorizedUser = {
  id: "u1",
  name: "Ana",
  email: "ana@x.co",
  image: null,
  role: "CASHIER",
  businessId: "b1",
  isActive: true,
  sessionVersion: 3,
  mustChangePassword: false,
};

const runJwt = (token: Record<string, unknown>, user?: AuthorizedUser) =>
  edgeAuthConfig.callbacks.jwt({ token, user } as unknown as JwtParams);

describe("edgeAuthConfig.callbacks.jwt", () => {
  it("al iniciar sesión copia los datos del usuario y fija loginAt", () => {
    const token = runJwt({ sub: "u1" }, authorized);

    expect(token).toMatchObject({ sub: "u1", role: "CASHIER", businessId: "b1", sv: 3, isActive: true });
    expect((token as { loginAt: number }).loginAt).toBeCloseTo(Date.now(), -3);
  });

  it("rechaza el login de usuarios inactivos", () => {
    expect(runJwt({ sub: "u1" }, { ...authorized, isActive: false })).toBeNull();
  });

  it("conserva tokens completos y vigentes, y descarta los incompletos o vencidos", () => {
    const valid = { sub: "u1", role: "OWNER", sv: 0, isActive: true, mustChangePassword: false, loginAt: Date.now() };

    expect(runJwt(valid)).toEqual(valid);
    expect(runJwt({ ...valid, role: "ADMIN" })).toBeNull();
    expect(runJwt({ ...valid, sub: "" })).toBeNull();
    expect(runJwt({ ...valid, sv: undefined })).toBeNull();
    expect(runJwt({ ...valid, mustChangePassword: undefined })).toBeNull();
    expect(runJwt({ ...valid, loginAt: Date.now() - 25 * 60 * 60 * 1000 })).toBeNull();
  });
});

describe("edgeAuthConfig.callbacks.session", () => {
  it("expone en la sesión los campos del token", () => {
    const session = edgeAuthConfig.callbacks.session({
      session: { user: { name: "Ana" }, expires: "2026-12-31" } as Session,
      token: { sub: "u1", role: "OWNER", sv: 2, isActive: true, mustChangePassword: true, loginAt: 123 },
    } as unknown as SessionParams);

    expect(session.user).toEqual({
      name: "Ana",
      id: "u1",
      role: "OWNER",
      businessId: null,
      isActive: true,
      loginAt: 123,
      sessionVersion: 2,
      mustChangePassword: true,
    });
  });
});
