import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// NextAuth en el Edge envuelve el handler y le agrega `req.auth`; aquí se inyecta a mano.
vi.mock("next-auth", () => ({
  default: () => ({
    auth: (handler: (req: NextRequest) => Response) => handler,
  }),
}));

const { default: middleware } = await import("./middleware");

type AuthUser = {
  mustChangePassword?: boolean;
  role?: "OWNER" | "CASHIER" | "SUPERADMIN";
  businessId?: string | null;
  email?: string | null;
} | null;

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

describe("middleware: panel de la plataforma (/admin)", () => {
  const admin = { role: "SUPERADMIN", businessId: null, email: "admin@billify.co" } as const;
  const location = (res: Response) => new URL(res.headers.get("location")!).pathname;

  afterEach(() => vi.unstubAllEnvs());

  it("sin sesión envía al login", () => {
    const res = run(request("/admin/negocios"));

    expect(location(res)).toBe("/auth/login");
    expect(new URL(res.headers.get("location")!).searchParams.get("callbackUrl")).toBe("/admin/negocios");
  });

  it("deja entrar solo al SUPERADMIN cuyo correo está en PLATFORM_ADMIN_EMAILS", () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "Admin@Billify.co");

    expect(run(request("/admin", { user: admin })).headers.get("x-middleware-next")).toBe("1");
    expect(run(request("/admin/negocios/b1", { user: admin })).headers.get("x-middleware-next")).toBe("1");
  });

  it("envía al inicio a propietarios, cajeros y administradores fuera de la lista", () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "admin@billify.co");
    const owner = { role: "OWNER", businessId: "b1", email: "admin@billify.co" } as const;
    const cashier = { role: "CASHIER", businessId: "b1", email: "caja@x.co" } as const;

    expect(location(run(request("/admin", { user: owner })))).toBe("/");
    expect(location(run(request("/admin/negocios", { user: cashier })))).toBe("/");
    expect(location(run(request("/admin", { user: { ...admin, email: "otro@billify.co" } })))).toBe("/");
    // Un token SUPERADMIN con negocio no es un administrador válido.
    expect(location(run(request("/admin", { user: { ...admin, businessId: "b1" } })))).toBe("/");
    // Rutas que solo empiezan parecido no son el panel.
    expect(run(request("/administracion", { user: owner })).headers.get("x-middleware-next")).toBe("1");
  });

  it("falla cerrado si no está definida PLATFORM_ADMIN_EMAILS", () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", undefined);

    expect(location(run(request("/admin", { user: admin })))).toBe("/");
  });

  it("saca al administrador de las páginas de negocio, pero no de las públicas ni de las APIs", () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "admin@billify.co");

    expect(location(run(request("/ventas", { user: admin })))).toBe("/admin");
    expect(location(run(request("/suscripcion/resultado", { user: admin })))).toBe("/admin");
    expect(run(request("/", { user: admin })).headers.get("x-middleware-next")).toBe("1");
    expect(run(request("/auth/cambiar-contrasena", { user: admin })).headers.get("x-middleware-next")).toBe("1");
    expect(run(request("/api/upload/logo", { method: "POST", user: admin })).headers.get("x-middleware-next")).toBe("1");
  });

  it("exige cambiar la contraseña antes de entrar al panel", () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "admin@billify.co");

    const res = run(request("/admin", { user: { ...admin, mustChangePassword: true } }));

    expect(location(res)).toBe("/auth/cambiar-contrasena");
  });
});
