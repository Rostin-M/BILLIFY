import { describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  SUPABASE_URL: undefined as string | undefined,
  SUPABASE_SERVICE_ROLE_KEY: undefined as string | undefined,
}));
vi.mock("~/env", () => ({ env }));

const { createSupabaseServiceClient, LOGO_BUCKET, objectPathFromPublicUrl } = await import("./supabase-server");

const BASE = "https://abc.supabase.co/storage/v1/object/public";

describe("objectPathFromPublicUrl", () => {
  it("extrae la ruta del objeto dentro del bucket", () => {
    expect(objectPathFromPublicUrl(`${BASE}/${LOGO_BUCKET}/b1/logo%20nuevo.png?t=1`, LOGO_BUCKET)).toBe(
      "b1/logo nuevo.png",
    );
  });

  it("rechaza otros buckets, rutas sospechosas y URLs inválidas", () => {
    expect(objectPathFromPublicUrl(`${BASE}/otro/b1/logo.png`, LOGO_BUCKET)).toBeNull();
    // "..%2F" no es un segmento de punto para el parser de URL, pero al decodificarlo sí.
    expect(objectPathFromPublicUrl(`${BASE}/${LOGO_BUCKET}/b1/..%2Fb2/logo.png`, LOGO_BUCKET)).toBeNull();
    // "%2E%2E" lo resuelve el propio parser de URL: queda una ruta limpia de otra carpeta.
    expect(objectPathFromPublicUrl(`${BASE}/${LOGO_BUCKET}/b1/%2E%2E/b2/logo.png`, LOGO_BUCKET)).toBe("b2/logo.png");
    expect(objectPathFromPublicUrl(`${BASE}/${LOGO_BUCKET}/%2Fetc`, LOGO_BUCKET)).toBeNull();
    expect(objectPathFromPublicUrl(`${BASE}/${LOGO_BUCKET}/`, LOGO_BUCKET)).toBeNull();
    expect(objectPathFromPublicUrl(`${BASE}/${LOGO_BUCKET}/%E0%A4%A`, LOGO_BUCKET)).toBeNull();
    expect(objectPathFromPublicUrl("no es url", LOGO_BUCKET)).toBeNull();
  });
});

describe("createSupabaseServiceClient", () => {
  it("exige la configuración de Supabase", () => {
    expect(() => createSupabaseServiceClient()).toThrow(/SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("crea el cliente cuando hay configuración", () => {
    env.SUPABASE_URL = "https://abc.supabase.co";
    env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    expect(createSupabaseServiceClient().storage).toBeDefined();
  });
});
