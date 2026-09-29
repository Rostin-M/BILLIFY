import { describe, expect, it } from "vitest";

import { TOO_MANY_REQUESTS_MESSAGE, friendlyError } from "./errors";

describe("friendlyError", () => {
  it("muestra un mensaje amable ante el límite de intentos", () => {
    expect(friendlyError({ message: "x", data: { code: "TOO_MANY_REQUESTS" } })).toBe(
      TOO_MANY_REQUESTS_MESSAGE,
    );
  });

  it("indica que la sesión expiró", () => {
    expect(friendlyError({ message: "x", data: { code: "UNAUTHORIZED" } })).toBe(
      "Tu sesión expiró. Inicia sesión nuevamente.",
    );
  });

  it("toma el primer mensaje de un error de zod", () => {
    const message = JSON.stringify([{}, { message: "Correo inválido" }, { message: "Otro" }]);
    expect(friendlyError({ message, data: null })).toBe("Correo inválido");
  });

  it("devuelve el mensaje crudo si el arreglo no trae mensajes o no es JSON", () => {
    expect(friendlyError({ message: "[{}]" })).toBe("[{}]");
    expect(friendlyError({ message: "Error de red" })).toBe("Error de red");
  });
});
