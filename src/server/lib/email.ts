import { BrevoClient } from "@getbrevo/brevo";
import { env } from "~/env";

const brevo = new BrevoClient({ apiKey: env.BREVO_API_KEY });

const FROM = { name: "BILLIFY", email: env.SMTP_FROM };

// ─── Saneamiento ────────────────────────────────────────────────────────────

/** Escapa un valor para interpolarlo de forma segura dentro de HTML. */
export function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Limpia el asunto: sin saltos de línea (inyección de cabeceras) y máximo 120 caracteres. */
function safeSubject(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, 120);
}

/** Quita las "/" finales sin regex (evita backtracking con entradas largas). */
function stripTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") end--;
  return url.slice(0, end);
}

/** URL pública de la app para los enlaces de los correos (null si no está configurada). */
export function appBaseUrl(): string | null {
  const explicit = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (explicit) return stripTrailingSlashes(explicit);
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : null;
}

export async function sendVerificationCode(to: string, code: string, name: string) {
  await brevo.transactionalEmails.sendTransacEmail({
    sender: FROM,
    to: [{ email: to }],
    subject: safeSubject(`${code} — Código de verificación BILLIFY`),
    htmlContent: verificationHtml(code, name),
  });
}

export async function sendPasswordReset(to: string, token: string, name: string) {
  await brevo.transactionalEmails.sendTransacEmail({
    sender: FROM,
    to: [{ email: to }],
    subject: "Restablecer contraseña — BILLIFY",
    htmlContent: passwordResetHtml(token, name),
  });
}

export async function sendWelcomeEmail(to: string, ownerName: string, businessName: string) {
  await brevo.transactionalEmails.sendTransacEmail({
    sender: FROM,
    to: [{ email: to }],
    subject: safeSubject(`¡Bienvenido a BILLIFY, ${ownerName}!`),
    htmlContent: welcomeHtml(ownerName, businessName),
  });
}

/**
 * Aviso al empleado recién creado. NUNCA incluye la contraseña: el propietario
 * se la entrega en persona y el empleado debe cambiarla en su primer ingreso.
 */
export async function sendEmployeeWelcomeEmail(
  to: string,
  employeeName: string,
  ownerName: string,
  businessName: string,
  loginEmail: string,
) {
  await brevo.transactionalEmails.sendTransacEmail({
    sender: FROM,
    to: [{ email: to }],
    subject: safeSubject(`${ownerName} te ha registrado en ${businessName} — BILLIFY`),
    htmlContent: employeeWelcomeHtml(employeeName, ownerName, businessName, loginEmail),
  });
}

export async function sendInvoiceEmail(
  to: string,
  invoiceNumber: string,
  businessName: string,
  pdfBuffer: Buffer,
) {
  // El número de factura también va en el nombre del adjunto: solo caracteres seguros
  const fileNumber = invoiceNumber.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "factura";
  await brevo.transactionalEmails.sendTransacEmail({
    sender: FROM,
    to: [{ email: to }],
    subject: safeSubject(`Factura ${invoiceNumber} — ${businessName}`),
    htmlContent: invoiceHtml(invoiceNumber, businessName),
    attachment: [
      { name: `factura-${fileNumber}.pdf`, content: pdfBuffer.toString("base64") },
    ],
  });
}

/** Aviso de suscripción (recordatorio, vencimiento, pago recibido). Texto plano: se escapa todo. */
export type SubscriptionEmail = {
  subject: string;
  title: string;
  /** Párrafos del cuerpo. */
  paragraphs: string[];
  ctaLabel: string;
};

export async function sendSubscriptionEmail(to: string, name: string | null, email: SubscriptionEmail) {
  await brevo.transactionalEmails.sendTransacEmail({
    sender: FROM,
    to: [{ email: to }],
    subject: safeSubject(`${email.subject} — BILLIFY`),
    htmlContent: subscriptionHtml(name, email),
  });
}

// ─── Templates ──────────────────────────────────────────────────────────────
// Todo valor interpolado pasa por escapeHtml().

function subscriptionHtml(name: string | null, email: SubscriptionEmail) {
  const baseUrl = appBaseUrl();
  const cta = baseUrl
    ? `<a href="${escapeHtml(`${baseUrl}/suscripcion`)}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:10px">${escapeHtml(email.ctaLabel)}</a>`
    : `<p style="margin:0;font-size:14px;color:#e2e8f0">Entra a BILLIFY → Suscripción.</p>`;
  const body = email.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#94a3b8">${escapeHtml(p)}</p>`)
    .join("");
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:system-ui,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden">
        <tr><td style="background:#7c3aed;padding:24px 32px">
          <p style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:0.15em">BILLIFY</p>
          <p style="margin:4px 0 0;font-size:13px;color:#ddd6fe">Tu suscripción</p>
        </td></tr>
        <tr><td style="padding:32px">
          <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#f1f5f9">${escapeHtml(email.title)}</p>
          <p style="margin:0 0 16px;font-size:14px;color:#94a3b8">Hola${name ? ` ${escapeHtml(name)}` : ""},</p>
          ${body}
          <div style="margin:24px 0 0">${cta}</div>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #334155">
          <p style="margin:0;font-size:11px;color:#475569;text-align:center">© 2026 BILLIFY · Todos los derechos reservados</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function verificationHtml(code: string, name: string) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:system-ui,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden">
        <tr><td style="background:#7c3aed;padding:24px 32px">
          <p style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:0.15em">BILLIFY</p>
          <p style="margin:4px 0 0;font-size:13px;color:#ddd6fe">Software de punto de venta</p>
        </td></tr>
        <tr><td style="padding:32px">
          <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#f1f5f9">Verifica tu correo</p>
          <p style="margin:0 0 24px;font-size:14px;color:#94a3b8">Hola ${escapeHtml(name)}, usa el código de abajo para activar tu cuenta BILLIFY. Expira en <strong style="color:#e2e8f0">15 minutos</strong>.</p>
          <div style="background:#0f172a;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px">
            <p style="margin:0;font-size:42px;font-weight:700;color:#7c3aed;letter-spacing:0.3em">${escapeHtml(code)}</p>
          </div>
          <p style="margin:0;font-size:12px;color:#64748b">Si no solicitaste este código, ignora este correo.</p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #334155">
          <p style="margin:0;font-size:11px;color:#475569;text-align:center">© 2026 BILLIFY · Todos los derechos reservados</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function passwordResetHtml(token: string, name: string) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:system-ui,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden">
        <tr><td style="background:#7c3aed;padding:24px 32px">
          <p style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:0.15em">BILLIFY</p>
          <p style="margin:4px 0 0;font-size:13px;color:#ddd6fe">Software de punto de venta</p>
        </td></tr>
        <tr><td style="padding:32px">
          <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#f1f5f9">Restablecer contraseña</p>
          <p style="margin:0 0 24px;font-size:14px;color:#94a3b8">Hola ${escapeHtml(name)}, usa el código de abajo para crear una nueva contraseña. Expira en <strong style="color:#e2e8f0">15 minutos</strong>.</p>
          <div style="background:#0f172a;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px">
            <p style="margin:0;font-size:42px;font-weight:700;color:#7c3aed;letter-spacing:0.3em">${escapeHtml(token)}</p>
          </div>
          <p style="margin:0;font-size:12px;color:#64748b">Si no solicitaste restablecer tu contraseña, ignora este correo.</p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #334155">
          <p style="margin:0;font-size:11px;color:#475569;text-align:center">© 2026 BILLIFY · Todos los derechos reservados</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function welcomeHtml(ownerName: string, businessName: string) {
  const features = [
    { icon: "⚡", title: "Venta rápida", desc: "Registra ventas cotidianas en segundos, sin datos del cliente ni factura numerada." },
    { icon: "🧾", title: "Facturación", desc: "Emite facturas numeradas (F-YYYY-NNNNN) con cliente, impuestos y nota. Descarga o imprime el PDF al instante." },
    { icon: "📋", title: "Historial de ventas", desc: "Consulta todas las ventas del día, descarga facturas en PDF, envíalas por correo y anula ventas con motivo." },
    { icon: "📦", title: "Productos", desc: "Gestiona tu catálogo con nombre, precio, unidad, categoría y control de stock." },
    { icon: "👥", title: "Clientes", desc: "Guarda un directorio de clientes con nombre, documento y correo para usar en tus facturas." },
    { icon: "👤", title: "Empleados", desc: "Registra cajeros con su propio acceso. Actívalos o desactívalos cuando quieras y controla permisos de caja." },
    { icon: "💰", title: "Caja", desc: "Abre y cierra la caja cada día. Registra entradas y salidas de efectivo con su descripción." },
    { icon: "📊", title: "Dashboard", desc: "Consulta métricas de ventas, ingresos del período y rendimiento de tu negocio en tiempo real." },
  ];

  const featureRows = features
    .map(
      (f) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #1e293b">
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td width="36" valign="top" style="padding-top:2px;font-size:20px">${escapeHtml(f.icon)}</td>
            <td>
              <p style="margin:0;font-size:14px;font-weight:600;color:#f1f5f9">${escapeHtml(f.title)}</p>
              <p style="margin:2px 0 0;font-size:13px;color:#94a3b8">${escapeHtml(f.desc)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:system-ui,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden">
        <tr><td style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:32px">
          <p style="margin:0;font-size:26px;font-weight:700;color:#fff;letter-spacing:0.15em">BILLIFY</p>
          <p style="margin:4px 0 0;font-size:13px;color:#ddd6fe">Software de punto de venta</p>
        </td></tr>
        <tr><td style="padding:32px">
          <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#f1f5f9">¡Bienvenido, ${escapeHtml(ownerName)}!</p>
          <p style="margin:0 0 24px;font-size:14px;color:#94a3b8">
            Tu negocio <strong style="color:#e2e8f0">${escapeHtml(businessName)}</strong> ya está registrado en BILLIFY.
            Aquí tienes un resumen de todo lo que puedes hacer:
          </p>

          <table width="100%" cellpadding="0" cellspacing="0">
            ${featureRows}
          </table>

          <div style="margin-top:28px;background:#0f172a;border-radius:12px;padding:20px;text-align:center">
            <p style="margin:0 0 4px;font-size:13px;color:#64748b">¿Necesitas ayuda?</p>
            <p style="margin:0;font-size:13px;color:#94a3b8">Escríbenos a <a href="mailto:${escapeHtml(env.SMTP_FROM)}" style="color:#7c3aed;text-decoration:none">${escapeHtml(env.SMTP_FROM)}</a></p>
          </div>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #334155">
          <p style="margin:0;font-size:11px;color:#475569;text-align:center">© 2026 BILLIFY · Todos los derechos reservados</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function employeeWelcomeHtml(
  employeeName: string,
  ownerName: string,
  businessName: string,
  loginEmail: string,
) {
  const baseUrl = appBaseUrl();
  const loginButton = baseUrl
    ? `<div style="text-align:center;margin:0 0 20px">
            <a href="${escapeHtml(`${baseUrl}/auth/login`)}" style="display:inline-block;background:#7c3aed;color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px">Iniciar sesión en BILLIFY</a>
          </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:system-ui,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden">
        <tr><td style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:24px 32px">
          <p style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:0.15em">BILLIFY</p>
          <p style="margin:4px 0 0;font-size:13px;color:#ddd6fe">Software de punto de venta</p>
        </td></tr>
        <tr><td style="padding:32px">
          <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#f1f5f9">Hola, ${escapeHtml(employeeName)}</p>
          <p style="margin:0 0 24px;font-size:14px;color:#94a3b8">
            <strong style="color:#e2e8f0">${escapeHtml(ownerName)}</strong> te ha registrado como cajero en
            <strong style="color:#e2e8f0">${escapeHtml(businessName)}</strong> en BILLIFY.
          </p>

          <div style="background:#0f172a;border-radius:12px;padding:20px;margin:0 0 20px">
            <p style="margin:0;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.08em">Correo de acceso</p>
            <p style="margin:4px 0 0;font-size:15px;color:#e2e8f0">${escapeHtml(loginEmail)}</p>
          </div>

          <div style="background:#1a3a2a;border:1px solid #166534;border-radius:10px;padding:14px 16px;margin:0 0 20px">
            <p style="margin:0;font-size:13px;color:#86efac">
              🔒 El propietario te dará tu contraseña temporal. Por seguridad, deberás cambiarla al ingresar por primera vez.
            </p>
          </div>

          ${loginButton}

          <p style="margin:0;font-size:12px;color:#64748b">Si no reconoces este registro, ignora este correo.</p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #334155">
          <p style="margin:0;font-size:11px;color:#475569;text-align:center">© 2026 BILLIFY · Todos los derechos reservados</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function invoiceHtml(invoiceNumber: string, businessName: string) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:system-ui,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden">
        <tr><td style="background:#7c3aed;padding:24px 32px">
          <p style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:0.15em">BILLIFY</p>
          <p style="margin:4px 0 0;font-size:13px;color:#ddd6fe">Software de punto de venta</p>
        </td></tr>
        <tr><td style="padding:32px">
          <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#f1f5f9">Tu factura está lista</p>
          <p style="margin:0 0 24px;font-size:14px;color:#94a3b8">
            Adjunto encontrarás la factura <strong style="color:#e2e8f0">${escapeHtml(invoiceNumber)}</strong> de <strong style="color:#e2e8f0">${escapeHtml(businessName)}</strong>.
          </p>
          <p style="margin:0;font-size:12px;color:#64748b">Este documento es una factura operativa · No tiene validez tributaria ante la DIAN.</p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #334155">
          <p style="margin:0;font-size:11px;color:#475569;text-align:center">© 2026 BILLIFY · Todos los derechos reservados</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
