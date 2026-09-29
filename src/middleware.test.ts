import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// NextAuth en el Edge envuelve el handler y le agrega `req.auth`; aquí se inyecta a mano.
vi.mock("next-auth", () => ({
  default: () => ({
    auth: (handler: (req: NextRequest) => Response) => handler,
  }),
}));

const { default: middleware } = await import("./middleware");

type AuthUser = { mustChangePassword?: boolean } | null;

function request(path: string, opts: { method?: string; user?: AuthUser; origin?: string } = {}) {
  const headers = new Headers();
  if (opts.origin) headers.set("origin", opts.origin);
  const req = new NextRequest(`https://billify.test${path}`, { method: opts.method ?? "GET", headers });
  return Object.assign(req, { auth: opts.user ? { user: opts.user } : null });
}

const run = (req: ReturnType<typeof request>) =>
  (middleware as unknown as (r: typeof req) => Response)(req);

describe("middleware", () => {
  it("deja pasar rutas públicas con CSP y nonce", () => {
    const res = run(request("/auth/login"));

    expect(res.headers.get("x-middleware-next")).toBe("1");
    const csp = res.headers.get("Content-Security-Policy")!;
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("https://supabase.billify.test");
  });

  it("redirige al login sin sesión conservando la ruta relativa", () => {
    const res = run(request("/ventas?tab=quick"));

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/auth/login");
    expect(location.searchParams.get("callbackUrl")).toBe("/ventas?tab=quick");
  });

  it("responde 401 en APIs protegidas sin sesión", async () => {
    const res = run(request("/api/upload/logo"));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "No autorizado" });
  });

  it("permite rutas protegidas con sesión", () => {
    expect(run(request("/ventas", { user: {} })).headers.get("x-middleware-next")).toBe("1");
  });

  it("obliga a cambiar la contraseña antes de usar la app", async () => {
    const user = { mustChangePassword: true };

    const page = run(request("/ventas", { user }));
    const api = run(request("/api/upload/logo", { method: "POST", user }));
    const allowed = run(request("/api/trpc/auth.changePassword", { method: "POST", user }));

    expect(new URL(page.headers.get("location")!).pathname).toBe("/auth/cambiar-contrasena");
    expect(api.status).toBe(403);
    await expect(api.json()).resolves.toEqual({ error: "Debes cambiar tu contraseña" });
    expect(allowed.headers.get("x-middleware-next")).toBe("1");
  });

  it("bloquea peticiones a /api desde otro origen (CSRF)", () => {
    const cross = run(request("/api/trpc/sale.create", { method: "POST", origin: "https://evil.test" }));
    const nullOrigin = run(request("/api/trpc/sale.create", { method: "POST", origin: "null" }));
    const sameOrigin = run(request("/api/trpc/sale.create", { method: "POST", origin: "https://billify.test" }));
    const safeMethod = run(request("/api/trpc/sale.list", { origin: "https://evil.test" }));

    expect(cross.status).toBe(403);
    expect(nullOrigin.status).toBe(403);
    expect(sameOrigin.headers.get("x-middleware-next")).toBe("1");
    expect(safeMethod.headers.get("x-middleware-next")).toBe("1");
  });
});
