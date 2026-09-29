import { beforeEach, describe, expect, it, vi } from "vitest";

const sendTransacEmail = vi.fn();

vi.mock("~/env", () => ({ env: { BREVO_API_KEY: "test-key", SMTP_FROM: "facturacion@billify.test" } }));
vi.mock("@getbrevo/brevo", () => ({
  BrevoClient: class {
    transactionalEmails = { sendTransacEmail };
  },
}));

const email = await import("./email");

type SentEmail = {
  sender: { name: string; email: string };
  to: { email: string }[];
  subject: string;
  htmlContent: string;
  attachment?: { name: string; content: string }[];
};
const lastEmail = () => sendTransacEmail.mock.calls.at(-1)![0] as SentEmail;

beforeEach(() => {
  sendTransacEmail.mockReset();
  vi.unstubAllEnvs();
});

describe("escapeHtml", () => {
  it("escapa los caracteres especiales de HTML", () => {
    expect(email.escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;",
    );
    expect(email.escapeHtml(null)).toBe("");
    expect(email.escapeHtml(42)).toBe("42");
  });
});

describe("envío de correos", () => {
  it("código de verificación: escapa el nombre y limpia el asunto", async () => {
    await email.sendVerificationCode("ana@x.co", "123456", "<script>Ana</script>");

    const sent = lastEmail();
    expect(sent.sender).toEqual({ name: "BILLIFY", email: "facturacion@billify.test" });
    expect(sent.to).toEqual([{ email: "ana@x.co" }]);
    expect(sent.subject).toBe("123456 — Código de verificación BILLIFY");
    expect(sent.htmlContent).toContain("&lt;script&gt;Ana&lt;/script&gt;");
    expect(sent.htmlContent).not.toContain("<script>");
  });

  it("recuperación de contraseña incluye el código", async () => {
    await email.sendPasswordReset("ana@x.co", "654321", "Ana");
    expect(lastEmail().htmlContent).toContain("654321");
    expect(lastEmail().subject).toBe("Restablecer contraseña — BILLIFY");
  });

  it("bienvenida: el asunto no admite saltos de línea (inyección de cabeceras)", async () => {
    vi.stubEnv("AUTH_URL", "https://app.billify.co///");

    await email.sendWelcomeEmail("ana@x.co", "Ana\r\nBcc: victima@x.co", "Panadería");

    expect(lastEmail().subject).toBe("¡Bienvenido a BILLIFY, Ana Bcc: victima@x.co!");
    expect(lastEmail().htmlContent).toContain("Panadería");
  });

  it("empleado nuevo: nunca incluye contraseña y usa la URL pública", async () => {
    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "billify.vercel.app");

    await email.sendEmployeeWelcomeEmail("luis@x.co", "Luis", "Marta", "Tienda", "luis@x.co");

    const sent = lastEmail();
    expect(sent.subject).toBe("Marta te ha registrado en Tienda — BILLIFY");
    expect(sent.htmlContent).toContain("luis@x.co");
    expect(sent.htmlContent.toLowerCase()).not.toContain("contraseña:");
  });

  it("empleado nuevo: el enlace de login usa AUTH_URL sin barras finales, u omite el botón sin URL", async () => {
    vi.stubEnv("AUTH_URL", "https://app.billify.co///");
    await email.sendEmployeeWelcomeEmail("luis@x.co", "Luis", "Marta", "Tienda", "luis@x.co");
    expect(lastEmail().htmlContent).toContain('href="https://app.billify.co/auth/login"');

    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    await email.sendEmployeeWelcomeEmail("luis@x.co", "Luis", "Marta", "Tienda", "luis@x.co");
    expect(lastEmail().htmlContent).not.toContain("/auth/login");
  });

  it("factura: adjunta el PDF con un nombre de archivo seguro", async () => {
    await email.sendInvoiceEmail("c@x.co", "F-2026-00001", "Tienda", Buffer.from("%PDF-1.4"));
    await email.sendInvoiceEmail("c@x.co", "../../¿?", "Tienda", Buffer.from("x"));

    const [first, second] = sendTransacEmail.mock.calls.map((c) => c[0] as SentEmail);
    expect(first!.subject).toBe("Factura F-2026-00001 — Tienda");
    expect(first!.attachment).toEqual([
      { name: "factura-F-2026-00001.pdf", content: Buffer.from("%PDF-1.4").toString("base64") },
    ]);
    expect(second!.attachment![0]!.name).toBe("factura-factura.pdf");
  });

  it("propaga el error si Brevo falla", async () => {
    sendTransacEmail.mockRejectedValueOnce(new Error("Brevo caído"));
    await expect(email.sendPasswordReset("a@x.co", "1", "A")).rejects.toThrow("Brevo caído");
  });
});
