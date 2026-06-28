import { BrevoClient } from "@getbrevo/brevo";
import { env } from "~/env";

const brevo = new BrevoClient({ apiKey: env.BREVO_API_KEY });

const FROM = { name: "BILLIFY", email: env.SMTP_FROM };

export async function sendVerificationCode(to: string, code: string, name: string) {
  await brevo.transactionalEmails.sendTransacEmail({
    sender: FROM,
    to: [{ email: to }],
    subject: `${code} — Código de verificación BILLIFY`,
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
    subject: `¡Bienvenido a BILLIFY, ${ownerName}!`,
    htmlContent: welcomeHtml(ownerName, businessName),
  });
}

export async function sendEmployeeWelcomeEmail(
  to: string,
  employeeName: string,
  ownerName: string,
  businessName: string,
  loginEmail: string,
  password: string,
) {
  await brevo.transactionalEmails.sendTransacEmail({
    sender: FROM,
    to: [{ email: to }],
    subject: `${ownerName} te ha registrado en ${businessName} — BILLIFY`,
    htmlContent: employeeWelcomeHtml(employeeName, ownerName, businessName, loginEmail, password),
  });
}

export async function sendInvoiceEmail(
  to: string,
  invoiceNumber: string,
  businessName: string,
  pdfBuffer: Buffer,
) {
  await brevo.transactionalEmails.sendTransacEmail({
    sender: FROM,
    to: [{ email: to }],
    subject: `Factura ${invoiceNumber} — ${businessName}`,
    htmlContent: invoiceHtml(invoiceNumber, businessName),
    attachment: [
      { name: `factura-${invoiceNumber}.pdf`, content: pdfBuffer.toString("base64") },
    ],
  });
}

// ─── Templates ──────────────────────────────────────────────────────────────

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
          <p style="margin:0 0 24px;font-size:14px;color:#94a3b8">Hola ${name}, usa el código de abajo para activar tu cuenta BILLIFY. Expira en <strong style="color:#e2e8f0">15 minutos</strong>.</p>
          <div style="background:#0f172a;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px">
            <p style="margin:0;font-size:42px;font-weight:700;color:#7c3aed;letter-spacing:0.3em">${code}</p>
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
          <p style="margin:0 0 24px;font-size:14px;color:#94a3b8">Hola ${name}, usa el código de abajo para crear una nueva contraseña. Expira en <strong style="color:#e2e8f0">15 minutos</strong>.</p>
          <div style="background:#0f172a;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px">
            <p style="margin:0;font-size:42px;font-weight:700;color:#7c3aed;letter-spacing:0.3em">${token}</p>
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
            <td width="36" valign="top" style="padding-top:2px;font-size:20px">${f.icon}</td>
            <td>
              <p style="margin:0;font-size:14px;font-weight:600;color:#f1f5f9">${f.title}</p>
              <p style="margin:2px 0 0;font-size:13px;color:#94a3b8">${f.desc}</p>
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
          <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#f1f5f9">¡Bienvenido, ${ownerName}!</p>
          <p style="margin:0 0 24px;font-size:14px;color:#94a3b8">
            Tu negocio <strong style="color:#e2e8f0">${businessName}</strong> ya está registrado en BILLIFY.
            Aquí tienes un resumen de todo lo que puedes hacer:
          </p>

          <table width="100%" cellpadding="0" cellspacing="0">
            ${featureRows}
          </table>

          <div style="margin-top:28px;background:#0f172a;border-radius:12px;padding:20px;text-align:center">
            <p style="margin:0 0 4px;font-size:13px;color:#64748b">¿Necesitas ayuda?</p>
            <p style="margin:0;font-size:13px;color:#94a3b8">Escríbenos a <a href="mailto:${env.SMTP_FROM}" style="color:#7c3aed;text-decoration:none">${env.SMTP_FROM}</a></p>
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
  password: string,
) {
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
          <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#f1f5f9">Hola, ${employeeName}</p>
          <p style="margin:0 0 24px;font-size:14px;color:#94a3b8">
            <strong style="color:#e2e8f0">${ownerName}</strong> te ha registrado como cajero en
            <strong style="color:#e2e8f0">${businessName}</strong> en BILLIFY.
            Estas son tus credenciales de acceso:
          </p>

          <div style="background:#0f172a;border-radius:12px;padding:20px;margin:0 0 20px">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #1e293b">
                  <p style="margin:0;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.08em">Correo</p>
                  <p style="margin:4px 0 0;font-size:15px;color:#e2e8f0">${loginEmail}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0">
                  <p style="margin:0;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.08em">Contraseña inicial</p>
                  <p style="margin:4px 0 0;font-size:15px;font-weight:700;color:#7c3aed;letter-spacing:0.05em">${password}</p>
                </td>
              </tr>
            </table>
          </div>

          <div style="background:#1a3a2a;border:1px solid #166534;border-radius:10px;padding:14px 16px;margin:0 0 20px">
            <p style="margin:0;font-size:13px;color:#86efac">
              🔒 Por seguridad, cambia tu contraseña en tu próximo inicio de sesión desde la configuración de tu perfil.
            </p>
          </div>

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
            Adjunto encontrarás la factura <strong style="color:#e2e8f0">${invoiceNumber}</strong> de <strong style="color:#e2e8f0">${businessName}</strong>.
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
