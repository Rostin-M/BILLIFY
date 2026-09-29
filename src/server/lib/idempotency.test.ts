import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { idempotencyKeySchema, isUniqueViolation, runIdempotent } from "./idempotency";

function uniqueError(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target },
  });
}

describe("isUniqueViolation", () => {
  it("detecta P2002 con y sin pista de campo", () => {
    const error = uniqueError(["idempotency_key"]);
    expect(isUniqueViolation(error)).toBe(true);
    expect(isUniqueViolation(error, "IDEMPOTENCY")).toBe(true);
    expect(isUniqueViolation(error, "email")).toBe(false);
  });

  it("ignora otros errores", () => {
    const notFound = new Prisma.PrismaClientKnownRequestError("x", { code: "P2025", clientVersion: "test" });
    expect(isUniqueViolation(notFound)).toBe(false);
    expect(isUniqueViolation(new Error("P2002"))).toBe(false);
  });
});

describe("idempotencyKeySchema", () => {
  it("acepta UUID o ausencia, rechaza otros valores", () => {
    expect(idempotencyKeySchema.safeParse(undefined).success).toBe(true);
    expect(idempotencyKeySchema.safeParse("123e4567-e89b-12d3-a456-426614174000").success).toBe(true);
    expect(idempotencyKeySchema.safeParse("abc").success).toBe(false);
  });
});

describe("runIdempotent", () => {
  it("sin clave ejecuta directamente", async () => {
    const findExisting = vi.fn();
    const result = await runIdempotent({ key: undefined, findExisting, run: async () => "nuevo" });
    expect(result).toBe("nuevo");
    expect(findExisting).not.toHaveBeenCalled();
  });

  it("devuelve el resultado existente sin volver a ejecutar", async () => {
    const run = vi.fn();
    const result = await runIdempotent({ key: "k", findExisting: async () => "previo", run });
    expect(result).toBe("previo");
    expect(run).not.toHaveBeenCalled();
  });

  it("ejecuta cuando no existe un resultado previo", async () => {
    const result = await runIdempotent({ key: "k", findExisting: async () => null, run: async () => "nuevo" });
    expect(result).toBe("nuevo");
  });

  it("ante una carrera (P2002) devuelve el resultado del ganador", async () => {
    const findExisting = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce("ganador");
    const result = await runIdempotent({
      key: "k",
      findExisting,
      run: async () => {
        throw uniqueError(["idempotency_key"]);
      },
    });
    expect(result).toBe("ganador");
  });

  it("relanza si tras el P2002 no aparece el ganador o el error es otro", async () => {
    const collision = uniqueError(["idempotency_key"]);
    await expect(
      runIdempotent({ key: "k", findExisting: async () => null, run: () => Promise.reject(collision) }),
    ).rejects.toBe(collision);

    const other = new Error("fallo");
    await expect(
      runIdempotent({ key: "k", findExisting: async () => null, run: () => Promise.reject(other) }),
    ).rejects.toBe(other);
  });
});
