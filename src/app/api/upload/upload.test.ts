import { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { auth } from "~/server/auth";
import { createShop, db } from "../../../../tests/integration/helpers";

const storage = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  getPublicUrl: vi.fn(),
}));
vi.mock("~/lib/supabase-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/supabase-server")>()),
  createSupabaseServiceClient: () => ({ storage: { from: () => storage } }),
}));

const logoRoute = await import("./logo/route");
const receiptRoute = await import("./receipt/route");

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const PUBLIC_BASE = "https://supabase.billify.test/storage/v1/object/public/business-logos";

function signIn(user: { id: string; sessionVersion?: number } | null) {
  vi.mocked(auth).mockResolvedValue(
    (user
      ? { user: { id: user.id, loginAt: Date.now(), sessionVersion: user.sessionVersion ?? 0 }, expires: "" }
      : null) as unknown as never,
  );
}

function uploadRequest(
  path: string,
  file: Blob | string | null,
  opts: { origin?: string; method?: string; contentLength?: string } = {},
) {
  const form = new FormData();
  if (file !== null) form.set("file", file);
  const req = new NextRequest(`https://billify.test${path}`, {
    method: opts.method ?? "POST",
    body: opts.method === "DELETE" ? undefined : form,
    headers: { host: "billify.test", ...(opts.origin ? { origin: opts.origin } : {}) },
  });
  if (opts.contentLength) req.headers.set("content-length", opts.contentLength);
  return req;
}

const png = (bytes: Uint8Array<ArrayBuffer> = PNG, type = "image/png") => new Blob([bytes], { type });

beforeEach(() => {
  storage.upload.mockReset().mockResolvedValue({ error: null });
  storage.remove.mockReset().mockResolvedValue({ error: null });
  storage.getPublicUrl.mockReset().mockImplementation((path: string) => ({
    data: { publicUrl: `${PUBLIC_BASE}/${path}` },
  }));
});

afterEach(() => {
  vi.mocked(auth).mockReset();
});

describe("POST /api/upload/receipt", () => {
  it("sube el comprobante a una ruta generada en el servidor", async () => {
    const { business, cashier } = await createShop();
    signIn(cashier);

    const res = await receiptRoute.POST(uploadRequest("/api/upload/receipt", png()));

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { path } = (await res.json()) as { path: string };
    expect(path).toMatch(new RegExp(`^${business.id}/\\d+-[0-9a-f-]{36}\\.png$`));
    expect(storage.upload).toHaveBeenCalledWith(path, expect.any(Buffer), { contentType: "image/png", upsert: false });
  });

  it("valida origen, sesión, negocio y límite de subidas", async () => {
    const { cashier } = await createShop();
    const orphan = await db.user.create({ data: { email: "sin@negocio.co", isActive: true } });

    signIn(cashier);
    expect((await receiptRoute.POST(uploadRequest("/api/upload/receipt", png(), { origin: "https://evil.test" }))).status).toBe(403);

    signIn(null);
    expect((await receiptRoute.POST(uploadRequest("/api/upload/receipt", png()))).status).toBe(401);

    signIn(orphan);
    expect((await receiptRoute.POST(uploadRequest("/api/upload/receipt", png()))).status).toBe(403);

    await db.user.update({ where: { id: cashier.id }, data: { mustChangePassword: true } });
    signIn(cashier);
    expect((await receiptRoute.POST(uploadRequest("/api/upload/receipt", png()))).status).toBe(401);

    await db.user.update({ where: { id: cashier.id }, data: { mustChangePassword: false } });
    await db.rateLimit.create({
      data: { key: `upload:user:${cashier.id}`, count: 30, windowStart: new Date(), expiresAt: new Date(Date.now() + 600_000) },
    });
    const limited = await receiptRoute.POST(uploadRequest("/api/upload/receipt", png()));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("rechaza archivos ausentes, vacíos, grandes o que no son imagen", async () => {
    const { cashier } = await createShop();
    signIn(cashier);
    const post = async (file: Blob | string | null, contentLength?: string) =>
      (await receiptRoute.POST(uploadRequest("/api/upload/receipt", file, { contentLength }))).status;

    expect(await post(null)).toBe(400);
    expect(await post("texto")).toBe(400);
    expect(await post(new Blob([], { type: "image/png" }))).toBe(400);
    expect(await post(png(PNG, "image/svg+xml"))).toBe(400);
    expect(await post(new Blob(["<svg/>"], { type: "image/png" }))).toBe(400);
    expect(await post(new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type: "image/png" }))).toBe(413);
    expect(await post(png(), String(10 * 1024 * 1024))).toBe(413);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("responde un error genérico si falla el almacenamiento", async () => {
    const { cashier } = await createShop();
    signIn(cashier);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    storage.upload.mockResolvedValueOnce({ error: { message: "bucket no existe" } });
    const failed = await receiptRoute.POST(uploadRequest("/api/upload/receipt", png()));
    storage.upload.mockRejectedValueOnce(new Error("red caída"));
    const thrown = await receiptRoute.POST(uploadRequest("/api/upload/receipt", png()));

    expect(failed.status).toBe(500);
    expect(thrown.status).toBe(500);
    await expect(failed.json()).resolves.toEqual({ error: "No se pudo subir la foto. Inténtalo de nuevo." });
  });
});

describe("/api/upload/logo", () => {
  it("solo el dueño puede cambiar el logo", async () => {
    const { cashier } = await createShop();
    signIn(cashier);

    const res = await logoRoute.POST(uploadRequest("/api/upload/logo", png()));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Solo el propietario puede hacer esto" });
  });

  it("guarda el logo nuevo y borra el anterior del propio negocio", async () => {
    const { business, owner } = await createShop();
    await db.business.update({ where: { id: business.id }, data: { logoUrl: `${PUBLIC_BASE}/${business.id}/viejo.png` } });
    signIn(owner);

    const res = await logoRoute.POST(uploadRequest("/api/upload/logo", png()));

    expect(res.status).toBe(200);
    const { logoUrl } = (await res.json()) as { logoUrl: string };
    await expect(db.business.findUnique({ where: { id: business.id } })).resolves.toMatchObject({ logoUrl });
    expect(storage.remove).toHaveBeenCalledWith([`${business.id}/viejo.png`]);
  });

  it("nunca borra archivos de otro negocio", async () => {
    const { business, owner } = await createShop();
    await db.business.update({ where: { id: business.id }, data: { logoUrl: `${PUBLIC_BASE}/otro-negocio/logo.png` } });
    signIn(owner);

    await logoRoute.POST(uploadRequest("/api/upload/logo", png()));

    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("DELETE quita el logo y registra si no se pudo borrar el archivo", async () => {
    const { business, owner } = await createShop();
    await db.business.update({ where: { id: business.id }, data: { logoUrl: `${PUBLIC_BASE}/${business.id}/logo.png` } });
    signIn(owner);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    storage.remove.mockResolvedValueOnce({ error: { message: "no encontrado" } });

    const res = await logoRoute.DELETE(uploadRequest("/api/upload/logo", null, { method: "DELETE" }));

    await expect(res.json()).resolves.toEqual({ ok: true });
    await expect(db.business.findUnique({ where: { id: business.id } })).resolves.toMatchObject({ logoUrl: null });
    expect(error).toHaveBeenCalledWith("[upload:logo] no se pudo borrar el logo anterior:", "no encontrado");
  });

  it("responde errores genéricos si falla el almacenamiento", async () => {
    const { owner } = await createShop();
    signIn(owner);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    storage.upload.mockResolvedValueOnce({ error: { message: "lleno" } });
    expect((await logoRoute.POST(uploadRequest("/api/upload/logo", png()))).status).toBe(500);
    storage.upload.mockRejectedValueOnce(new Error("red"));
    expect((await logoRoute.POST(uploadRequest("/api/upload/logo", png()))).status).toBe(500);
    signIn(null);
    expect((await logoRoute.DELETE(uploadRequest("/api/upload/logo", null, { method: "DELETE" }))).status).toBe(401);
  });
});
