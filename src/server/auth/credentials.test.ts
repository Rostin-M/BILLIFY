import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";

import { createShop, db } from "../../../tests/integration/helpers";
import { TooManyAttemptsError, authorizeCredentials } from "./credentials";

const PASSWORD = "ClaveCorrecta123";

const requestFrom = (ip: string) =>
  new Request("http://localhost/api/auth/callback/credentials", {
    headers: { "x-real-ip": ip, "user-agent": "vitest" },
  });

let owner: Awaited<ReturnType<typeof createShop>>["owner"];

beforeEach(async () => {
  ({ owner } = await createShop());
  owner = await db.user.update({
    where: { id: owner.id },
    data: { passwordHash: await bcrypt.hash(PASSWORD, 4), failedLogins: 2 },
  });
});

const login = (password: string, ip = "10.0.0.1", email = owner.email!) =>
  authorizeCredentials({ email, password }, requestFrom(ip));

describe("authorizeCredentials", () => {
  it("autentica con el correo en cualquier mayúscula y reinicia los fallos", async () => {
    const user = await login(PASSWORD, "10.0.0.1", owner.email!.toUpperCase());

    expect(user).toMatchObject({ id: owner.id, role: "OWNER", businessId: owner.businessId, sessionVersion: 0 });
    await expect(db.user.findUniqueOrThrow({ where: { id: owner.id } })).resolves.toMatchObject({ failedLogins: 0 });
    await expect(db.authEvent.findFirst({ where: { type: "LOGIN_SUCCESS" } })).resolves.toMatchObject({
      ip: "10.0.0.1",
      userAgent: "vitest",
    });
  });

  it("rechaza contraseñas incorrectas contando el fallo", async () => {
    await expect(login("Incorrecta123")).resolves.toBeNull();
    await expect(db.user.findUniqueOrThrow({ where: { id: owner.id } })).resolves.toMatchObject({ failedLogins: 3 });
    await expect(db.authEvent.count({ where: { type: "LOGIN_FAILED", userId: owner.id } })).resolves.toBe(1);
  });

  it("rechaza correos inexistentes, entradas inválidas y cuentas inactivas", async () => {
    await expect(login(PASSWORD, "10.0.0.1", "nadie@billify.test")).resolves.toBeNull();
    await expect(authorizeCredentials({ email: "no-es-correo", password: "x" }, requestFrom("1.1.1.1"))).resolves.toBeNull();

    await db.user.update({ where: { id: owner.id }, data: { isActive: false } });
    await expect(login(PASSWORD)).resolves.toBeNull();
    // La contraseña correcta de una cuenta inactiva no cuenta como fallo.
    await expect(db.user.findUniqueOrThrow({ where: { id: owner.id } })).resolves.toMatchObject({ failedLogins: 2 });
  });

  it("bloquea por (correo, IP) tras 5 intentos sin afectar otras IP", async () => {
    for (let i = 0; i < 5; i++) {
      await expect(login("Incorrecta123", "10.0.0.66")).resolves.toBeNull();
    }

    await expect(login(PASSWORD, "10.0.0.66")).rejects.toBeInstanceOf(TooManyAttemptsError);
    await expect(db.authEvent.count({ where: { type: "LOGIN_RATE_LIMITED" } })).resolves.toBe(1);
    // El dueño legítimo sigue entrando desde su propia IP.
    await expect(login(PASSWORD, "10.0.0.1")).resolves.toMatchObject({ id: owner.id });
  });
});
