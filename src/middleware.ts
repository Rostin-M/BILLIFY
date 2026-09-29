/**
 * Middleware (Edge runtime). Deniega por defecto: toda ruta que no esté en la
 * lista pública exige un JWT de sesión válido y vigente (24 h desde el login).
 *
 * Solo importa la configuración Edge de NextAuth (sin Prisma ni bcrypt). La
 * revalidación contra la BD (isActive, sessionVersion, rol) la hacen las
 * páginas, tRPC y los route handlers con `loadActiveUser`.
 *
 * También emite la Content-Security-Policy con un nonce por petición (enfoque
 * oficial de Next.js 15): el nonce viaja en la cabecera `x-nonce` y en la CSP de
 * la petición, de donde Next lo toma para sus propios <script>; el layout raíz lo
 * lee con `headers()` (lo que hace dinámicas todas las páginas) y se lo pasa a
 * next-themes. El resto de cabeceras de seguridad sigue en next.config.js.
 */
import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { edgeAuthConfig } from "~/server/auth/edge.config";

const { auth } = NextAuth(edgeAuthConfig);

const isDev = process.env.NODE_ENV !== "production";

/** Origen de Supabase (logos públicos en <img> y en los PDF generados en el navegador). */
function supabaseOrigin(): string {
  try {
    return process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : "";
  } catch {
    return "";
  }
}

const SUPABASE_ORIGIN = supabaseOrigin();

function contentSecurityPolicy(nonce: string): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Solo scripts con el nonce de esta respuesta; 'strict-dynamic' deja que esos
    // scripts carguen los chunks de Next. Sin 'unsafe-inline'.
    // 'wasm-unsafe-eval': @react-pdf/renderer usa yoga-layout compilado a WebAssembly.
    // 'unsafe-eval' solo en desarrollo (React Refresh / HMR de Next).
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      "'wasm-unsafe-eval'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    // Estilos en línea de React/Tailwind y de librerías (sonner, next-themes): se
    // mantiene 'unsafe-inline' en style-src (riesgo mucho menor que en scripts).
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", SUPABASE_ORIGIN],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", SUPABASE_ORIGIN, ...(isDev ? ["ws:"] : [])],
    // Cámara del lector de códigos de barras.
    "media-src": ["'self'", "blob:", "mediastream:"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    // Las facturas PDF se abren en una pestaña nueva con URL blob:.
    "frame-src": ["'self'", "blob:"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };
  const policy = Object.entries(directives)
    .map(([name, values]) => [name, ...values.filter(Boolean)].join(" "))
    .join("; ");
  return isDev ? policy : `${policy}; upgrade-insecure-requests`;
}

const CHANGE_PASSWORD_PATH = "/auth/cambiar-contrasena";

/** Rutas exactas públicas. */
const PUBLIC_EXACT = new Set(["/", "/manifest.webmanifest", "/sw.js"]);
/**
 * Prefijos públicos (la ruta base y todo lo que cuelga de ella).
 * /api/webhooks y /api/cron no usan sesión: se autentican con firma de la
 * pasarela y con CRON_SECRET dentro de cada ruta.
 */
const PUBLIC_PREFIXES = ["/auth", "/legal", "/api/auth", "/api/trpc", "/icons", "/api/webhooks", "/api/cron"];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_EXACT.has(pathname) || PUBLIC_PREFIXES.some((p) => matchesPrefix(pathname, p));
}

/** Rutas que un usuario con cambio de contraseña pendiente sí puede usar. */
function isAllowedWhileMustChangePassword(pathname: string): boolean {
  return (
    matchesPrefix(pathname, CHANGE_PASSWORD_PATH) ||
    matchesPrefix(pathname, "/api/auth") ||
    matchesPrefix(pathname, "/api/trpc")
  );
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Defensa CSRF en profundidad para /api/*: si el navegador envía Origin y no
 * coincide con el host de la petición, se rechaza. (Las cookies de NextAuth
 * ya son SameSite=Lax; esto cubre subdominios hermanos y navegadores viejos.)
 */
function isCrossOrigin(req: Request, requestHost: string): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== requestHost;
  } catch {
    // Origin "null" (iframes sandbox, redirecciones opacas) o malformado.
    return true;
  }
}

export default auth((req) => {
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);

  // Cabeceras de la petición para los Server Components: Next extrae el nonce de
  // la CSP de la petición y el layout raíz lo lee de `x-nonce`.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const withCsp = <T extends Response>(res: T): T => {
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };
  const next = () => withCsp(NextResponse.next({ request: { headers: requestHeaders } }));

  const { pathname, search } = req.nextUrl;
  const isApi = matchesPrefix(pathname, "/api");

  if (isApi && !SAFE_METHODS.has(req.method)) {
    const requestHost = req.headers.get("x-forwarded-host") ?? req.nextUrl.host;
    if (isCrossOrigin(req, requestHost)) {
      return withCsp(NextResponse.json({ error: "Origen no permitido" }, { status: 403 }));
    }
  }

  const user = req.auth?.user;

  if (user?.mustChangePassword && !isAllowedWhileMustChangePassword(pathname)) {
    if (isApi) {
      return withCsp(NextResponse.json({ error: "Debes cambiar tu contraseña" }, { status: 403 }));
    }
    return withCsp(NextResponse.redirect(new URL(CHANGE_PASSWORD_PATH, req.nextUrl.origin)));
  }

  if (isPublicPath(pathname)) return next();

  if (!user) {
    if (isApi) {
      return withCsp(NextResponse.json({ error: "No autorizado" }, { status: 401 }));
    }
    const loginUrl = new URL("/auth/login", req.nextUrl.origin);
    // Solo la ruta relativa: nunca una URL absoluta (evita open redirect).
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return withCsp(NextResponse.redirect(loginUrl));
  }

  return next();
});

export const config = {
  matcher: [
    // Todo excepto estáticos de Next, favicon y archivos de imagen/fuente.
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|woff|woff2|ttf|otf)$).*)",
  ],
};
