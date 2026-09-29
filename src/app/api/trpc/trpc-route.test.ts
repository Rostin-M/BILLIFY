import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { auth } from "~/server/auth";
import { createProduct, createShop } from "../../../../tests/integration/helpers";
import { GET, POST } from "./[trpc]/route";

function signIn(user: { id: string } | null) {
  vi.mocked(auth).mockResolvedValue(
    (user ? { user: { id: user.id, loginAt: Date.now(), sessionVersion: 0 }, expires: "" } : null) as unknown as never,
  );
}

const trpcRequest = (path: string, init: { method?: string; body?: unknown } = {}) =>
  new NextRequest(`https://billify.test/api/trpc/${path}`, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", "x-real-ip": "203.0.113.7" },
    body: init.body === undefined ? undefined : JSON.stringify({ json: init.body }),
  });

type TrpcErrorBody = { error: { json: { message: string; data: { code: string; zodError: unknown } } } };

afterEach(() => {
  vi.mocked(auth).mockReset();
  vi.restoreAllMocks();
});

describe("/api/trpc", () => {
  it("responde consultas con la sesión de la petición", async () => {
    const { owner, business } = await createShop();
    await createProduct(business.id, { name: "Arepa" });
    signIn(owner);

    const res = await GET(trpcRequest("product.list"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { data: { json: { name: string }[] } } };
    expect(body.result.data.json.map((p) => p.name)).toEqual(["Arepa"]);
  });

  it("devuelve 401 sin sesión y registra el error sin datos de entrada", async () => {
    signIn(null);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await GET(trpcRequest("product.list"));

    expect(res.status).toBe(401);
    expect(error).toHaveBeenCalledWith("[tRPC]", "product.list", "UNAUTHORIZED", "UNAUTHORIZED");
  });

  it("incluye los errores de validación de zod aplanados", async () => {
    const { owner } = await createShop();
    signIn(owner);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(trpcRequest("customer.create", { method: "POST", body: { name: "A", email: "x" } }));

    expect(res.status).toBe(400);
    const body = (await res.json()) as TrpcErrorBody;
    expect(body.error.json.data.code).toBe("BAD_REQUEST");
    expect(body.error.json.data.zodError).toMatchObject({
      fieldErrors: { name: ["El nombre es obligatorio"], email: [expect.stringContaining("correo no es válido")] },
    });
  });

  it("limita el tamaño de los lotes", async () => {
    signIn(null);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const paths = Array.from({ length: 11 }, () => "product.list").join(",");

    const res = await GET(trpcRequest(`${paths}?batch=1&input={}`));

    expect(res.status).toBe(400);
  });
});
