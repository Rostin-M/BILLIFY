import { describe, expect, it } from "vitest";

import { firstErrorMessage, parseZodError } from "./parseZodError";

describe("parseZodError", () => {
  it("mapea cada issue al último segmento de su ruta, conservando el primero", () => {
    const raw = JSON.stringify([
      { path: ["items", "0", "price"], message: "Precio inválido" },
      { path: ["price"], message: "Otro mensaje" },
      { path: ["name"], message: "Nombre requerido" },
      { path: [], message: "Sin campo" },
    ]);
    expect(parseZodError(raw)).toEqual({
      fieldErrors: { price: "Precio inválido", name: "Nombre requerido" },
      formError: null,
    });
  });

  it("devuelve el mensaje plano como error de formulario", () => {
    expect(parseZodError("Algo salió mal")).toEqual({ fieldErrors: {}, formError: "Algo salió mal" });
  });

  it("trata un arreglo vacío o un JSON que no es arreglo como mensaje plano", () => {
    expect(parseZodError("[]").formError).toBe("[]");
    expect(parseZodError('{"a":1}').formError).toBe('{"a":1}');
  });
});

describe("firstErrorMessage", () => {
  it("toma el primer issue de Zod que tenga mensaje", () => {
    expect(firstErrorMessage(JSON.stringify([{}, { message: "Teléfono inválido" }, { message: "Otro" }]))).toBe(
      "Teléfono inválido",
    );
  });

  it("devuelve el mensaje crudo si no hay issues con texto o no es JSON", () => {
    expect(firstErrorMessage("[{}]")).toBe("[{}]");
    expect(firstErrorMessage('{"message":"x"}')).toBe('{"message":"x"}');
    expect(firstErrorMessage("Sin conexión")).toBe("Sin conexión");
  });
});
