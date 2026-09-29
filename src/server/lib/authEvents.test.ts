import { afterEach, describe, expect, it, vi } from "vitest";

import { db } from "../../../tests/integration/helpers";
import { logAuthEvent } from "./authEvents";

describe("logAuthEvent", () => {
  afterEach(() => vi.restoreAllMocks());

  it("guarda el evento con el correo normalizado", async () => {
    await logAuthEvent({ type: "LOGIN_FAILED", email: "Alguien@Correo.COM", ip: "1.2.3.4" });

    await expect(db.authEvent.findFirst()).resolves.toMatchObject({
      type: "LOGIN_FAILED",
      email: "alguien@correo.com",
      ip: "1.2.3.4",
      userId: null,
      userAgent: null,
    });
  });

  it("nunca rompe el flujo si falla la escritura", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(db.authEvent, "create").mockRejectedValueOnce(new Error("BD caída"));

    await expect(logAuthEvent({ type: "LOGIN_SUCCESS" })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("[authEvents] no se pudo registrar", "LOGIN_SUCCESS", "BD caída");
  });
});
