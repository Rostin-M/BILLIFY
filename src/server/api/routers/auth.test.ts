import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendPasswordReset, sendVerificationCode, sendWelcomeEmail } from "~/server/lib/email";
import { hashCode } from "~/server/lib/secureCode";
import { callerFor, createShop, db } from "../../../../tests/integration/helpers";

const registration = {
  businessName: "Panadería La 14",
  businessDocument: "900123456",
  ownerName: "Marta Ruiz",
  ownerDocument: "52123456",
  ownerEmail: "  Marta@Panaderia.CO ",
  ownerPassword: "PanFresco2026",
};
const EMAIL = "marta@panaderia.co";

const anonymous = () => callerFor(null);

/** Último código enviado por el mock de correo (el servidor nunca lo devuelve). */
function lastCode(mock: typeof sendVerificationCode | typeof sendPasswordReset): string {
  const call = vi.mocked(mock).mock.calls.at(-1);
  if (!call) throw new Error("No se envió ningún código");
  return call[1];
}

beforeEach(() => {
  vi.mocked(sendVerificationCode).mockClear();
  vi.mocked(sendPasswordReset).mockClear();
  vi.mocked(sendWelcomeEmail).mockClear();
});

describe("registro con verificación de correo", () => {
  it("crea el negocio y el dueño solo tras verificar el código", async () => {
    await expect(anonymous().auth.registerOwner(registration)).resolves.toEqual({ requiresVerification: true });
    await expect(db.user.count()).resolves.toBe(0);
    const code = lastCode(sendVerificationCode);

    await expect(anonymous().auth.verifyEmail({ email: EMAIL, code })).resolves.toEqual({
      message: "Cuenta creada. Ya puedes iniciar sesión.",
    });

    const owner = await db.user.findUniqueOrThrow({ where: { email: EMAIL }, include: { business: true } });
    expect(owner).toMatchObject({ role: "OWNER", isActive: true, name: "Marta Ruiz" });
    expect(owner.business).toMatchObject({ name: "Panadería La 14", document: "900123456" });
    await expect(bcrypt.compare("PanFresco2026", owner.passwordHash!)).resolves.toBe(true);
    await expect(db.pendingRegistration.count()).resolves.toBe(0);
    expect(sendWelcomeEmail).toHaveBeenCalledWith(EMAIL, "Marta Ruiz", "Panadería La 14");
  });

  it("rechaza correos o documentos ya registrados", async () => {
    const { owner } = await createShop({ document: "900123456" });

    await expect(anonymous().auth.registerOwner({ ...registration, ownerEmail: owner.email! })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(anonymous().auth.registerOwner(registration)).rejects.toThrow(
      "Ya existe un negocio registrado con este documento.",
    );
    await anonymous().auth.registerOwner({ ...registration, businessDocument: "900999999" });
    await expect(
      anonymous().auth.registerOwner({ ...registration, businessDocument: "900888888" }),
    ).rejects.toThrow(/registro pendiente/);
  });

  it("invalida el registro tras demasiados códigos incorrectos", async () => {
    await anonymous().auth.registerOwner(registration);
    const code = lastCode(sendVerificationCode);
    const wrong = code === "000000" ? "111111" : "000000";

    for (let i = 0; i < 4; i++) {
      await expect(anonymous().auth.verifyEmail({ email: EMAIL, code: wrong })).rejects.toThrow(
        "Código incorrecto o vencido.",
      );
    }
    await expect(anonymous().auth.verifyEmail({ email: EMAIL, code: wrong })).rejects.toThrow(
      /Demasiados intentos fallidos/,
    );
    // Primera barrera: el límite por (correo, IP) bloquea más intentos.
    await expect(anonymous().auth.verifyEmail({ email: EMAIL, code })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    // Segunda barrera: aunque se libere el límite, el registro pendiente ya no existe.
    await db.rateLimit.deleteMany();
    await expect(anonymous().auth.verifyEmail({ email: EMAIL, code })).rejects.toThrow("Código incorrecto o vencido.");
    await expect(db.pendingRegistration.count()).resolves.toBe(0);
  });

  it("reenvía un código nuevo sin revelar si el correo existe", async () => {
    await anonymous().auth.registerOwner(registration);
    const first = lastCode(sendVerificationCode);

    await expect(anonymous().auth.resendVerificationCode({ email: EMAIL })).resolves.toEqual({
      message: expect.stringContaining("te enviamos un nuevo código") as unknown,
    });
    await vi.waitFor(() => expect(sendVerificationCode).toHaveBeenCalledTimes(2));
    await expect(anonymous().auth.resendVerificationCode({ email: "nadie@x.co" })).resolves.toBeTruthy();
    expect(sendVerificationCode).toHaveBeenCalledTimes(2);

    const pending = await db.pendingRegistration.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(pending.codeHash).toBe(hashCode(lastCode(sendVerificationCode)));
    expect(pending.codeHash === hashCode(first) && lastCode(sendVerificationCode) !== first).toBe(false);
  });

  it("limita los registros por IP", async () => {
    await db.rateLimit.create({
      data: { key: "register:ip:unknown", count: 5, windowStart: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
    });
    await expect(anonymous().auth.registerOwner(registration)).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});

describe("recuperación de contraseña", () => {
  async function requestReset() {
    const { owner } = await createShop();
    await db.user.update({ where: { id: owner.id }, data: { document: "52123456", failedLogins: 3 } });
    await anonymous().auth.forgotPassword({ email: owner.email!, document: "52123456" });
    await vi.waitFor(() => expect(sendPasswordReset).toHaveBeenCalled());
    return { owner, code: lastCode(sendPasswordReset) };
  }

  it("restablece la contraseña con el código y cierra las sesiones", async () => {
    const { owner, code } = await requestReset();

    await expect(
      anonymous().auth.resetPassword({ email: owner.email!, token: code, newPassword: "NuevaClave123" }),
    ).resolves.toEqual({ message: "Contraseña actualizada. Ya puedes iniciar sesión." });

    const updated = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(updated).toMatchObject({ sessionVersion: 1, failedLogins: 0 });
    await expect(bcrypt.compare("NuevaClave123", updated.passwordHash!)).resolves.toBe(true);
    await expect(db.authEvent.count({ where: { type: "PASSWORD_RESET_SUCCESS" } })).resolves.toBe(1);
    // El código no se puede reutilizar.
    await expect(
      anonymous().auth.resetPassword({ email: owner.email!, token: code, newPassword: "OtraClave123" }),
    ).rejects.toThrow("Código incorrecto o vencido.");
  });

  it("no revela si el usuario existe y falla igual con datos incorrectos", async () => {
    const { owner, code } = await requestReset();
    const wrong = code === "000000" ? "111111" : "000000";

    await expect(anonymous().auth.forgotPassword({ email: "nadie@x.co", document: "1234" })).resolves.toEqual({
      message: "Si los datos son correctos, recibirás un correo.",
    });
    expect(sendPasswordReset).toHaveBeenCalledTimes(1);
    await expect(
      anonymous().auth.resetPassword({ email: "nadie@x.co", token: code, newPassword: "NuevaClave123" }),
    ).rejects.toThrow("Código incorrecto o vencido.");
    for (let i = 0; i < 5; i++) {
      await expect(
        anonymous().auth.resetPassword({ email: owner.email!, token: wrong, newPassword: "NuevaClave123" }),
      ).rejects.toThrow("Código incorrecto o vencido.");
    }
    await expect(
      anonymous().auth.resetPassword({ email: owner.email!, token: code, newPassword: "NuevaClave123" }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    // Aun liberando el límite, tras 5 fallos el código correcto quedó invalidado.
    await db.rateLimit.deleteMany();
    await expect(
      anonymous().auth.resetPassword({ email: owner.email!, token: code, newPassword: "NuevaClave123" }),
    ).rejects.toThrow("Código incorrecto o vencido.");
  });
});

describe("auth.changePassword", () => {
  async function ownerWithPassword(password: string) {
    const { owner } = await createShop();
    await db.user.update({
      where: { id: owner.id },
      data: { passwordHash: await bcrypt.hash(password, 4), mustChangePassword: true },
    });
    return owner;
  }

  it("cambia la contraseña aunque se exija el cambio y cierra la sesión", async () => {
    const owner = await ownerWithPassword("Temporal123");

    await expect(
      callerFor(owner).auth.changePassword({ currentPassword: "Temporal123", newPassword: "Definitiva123" }),
    ).resolves.toEqual({
      message: "Contraseña actualizada. Inicia sesión con tu nueva contraseña.",
      requiresReLogin: true,
    });

    await expect(db.user.findUniqueOrThrow({ where: { id: owner.id } })).resolves.toMatchObject({
      mustChangePassword: false,
      sessionVersion: 1,
    });
    await expect(db.authEvent.count({ where: { type: "PASSWORD_CHANGED" } })).resolves.toBe(1);
  });

  it("valida la contraseña actual y que la nueva sea distinta", async () => {
    const owner = await ownerWithPassword("Temporal123");
    const caller = callerFor(owner);

    await expect(caller.auth.changePassword({ currentPassword: "Otra12345678", newPassword: "Definitiva123" })).rejects.toThrow(
      "La contraseña actual es incorrecta.",
    );
    await expect(caller.auth.changePassword({ currentPassword: "Temporal123", newPassword: "Temporal123" })).rejects.toThrow(
      "La nueva contraseña debe ser diferente a la actual.",
    );
  });

  it("falla para usuarios sin contraseña", async () => {
    const { owner } = await createShop();
    await expect(
      callerFor(owner).auth.changePassword({ currentPassword: "x", newPassword: "Definitiva123" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
