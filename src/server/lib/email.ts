import { BrevoClient } from "@getbrevo/brevo";
import { env } from "~/env";
import { escapeHtml, renderEmail, type EmailSpec } from "./emailLayout";

const brevo = new BrevoClient({ apiKey: env.BREVO_API_KEY });

const FROM = { name: "BILLIFY", email: env.SMTP_FROM };

// ─── Saneamiento ────────────────────────────────────────────────────────────

export { escapeHtml };

/** Limpia el asunto: sin saltos de línea (inyección de cabeceras) y máximo 120 caracteres. */
function safeSubject(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, 120);
}

/** Nombre visible del remitente: sin saltos de línea ni comillas y máximo 70 caracteres (límite de Brevo). */
function safeSenderName(value: string): string {
  return value.replace(/[\r\n"<>]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 70);
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

/** "Hola Ana," o, si no hay nombre, "Hola,". */
function greet(name: string | null | undefined): string {
  const clean = name?.trim();
  return clean ? `Hola ${clean},` : "Hola,";
}

/** Pie común de los correos de cuenta: ayuda y por qué llega el correo. */
function accountFooter(reason: string): string[] {
  return [`¿Necesitas ayuda? Escríbenos a ${env.SMTP_FROM}.`, reason];
}

async function send(
  message: { to: string; subject: string; spec: EmailSpec } & {
    sender?: { name: string; email: string };
    replyTo?: { email: string; name?: string };
    attachment?: { name: string; content: string }[];
  },
) {
  const { html, text } = renderEmail(message.spec);
  await brevo.transactionalEmails.sendTransacEmail({
    sender: message.sender ?? FROM,
    to: [{ email: message.to }],
    ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    subject: safeSubject(message.subject),
    htmlContent: html,
    textContent: text,
    ...(message.attachment ? { attachment: message.attachment } : {}),
  });
}

// ─── Cuenta ─────────────────────────────────────────────────────────────────

export async function sendVerificationCode(to: string, code: string, name: string) {
  await send({
    to,
    subject: `${code} — Código de verificación BILLIFY`,
    spec: {
      preheader: `Tu código es ${code}. Vence en 15 minutos.`,
      brand: "BILLIFY",
      eyebrow: "Verificación de cuenta",
      title: "Verifica tu correo",
      greeting: greet(name),
      blocks: [
        { kind: "paragraph", content: ["Usa este código para activar tu cuenta de BILLIFY. Vence en ", { strong: "15 minutos" }, "."] },
        { kind: "code", label: "Tu código de verificación", value: code },
      ],
      note: "Si no creaste una cuenta en BILLIFY, ignora este correo: sin este código nadie puede activarla.",
      footer: accountFooter("Recibes este correo porque se registró una cuenta con esta dirección."),
    },
  });
}

export async function sendPasswordReset(to: string, token: string, name: string) {
  await send({
    to,
    subject: "Restablecer contraseña — BILLIFY",
    spec: {
      preheader: `Tu código para crear una contraseña nueva es ${token}. Vence en 15 minutos.`,
      brand: "BILLIFY",
      eyebrow: "Seguridad de la cuenta",
      title: "Restablece tu contraseña",
      greeting: greet(name),
      blocks: [
        {
          kind: "paragraph",
          content: ["Usa este código para crear una contraseña nueva. Vence en ", { strong: "15 minutos" }, "."],
        },
        { kind: "code", label: "Tu código de recuperación", value: token },
      ],
      note: "Si no pediste cambiar tu contraseña, ignora este correo: tu contraseña actual sigue funcionando.",
      footer: accountFooter("Recibes este correo porque alguien pidió restablecer la contraseña de esta cuenta."),
    },
  });
}

export async function sendWelcomeEmail(to: string, ownerName: string, businessName: string) {
  const baseUrl = appBaseUrl();
  await send({
    to,
    subject: `Te damos la bienvenida a BILLIFY, ${ownerName}`,
    spec: {
      preheader: `${businessName} ya está en BILLIFY. Tres pasos para hacer tu primera venta.`,
      brand: "BILLIFY",
      eyebrow: "Tu cuenta está lista",
      title: `Te damos la bienvenida, ${ownerName}`,
      greeting: null,
      blocks: [
        {
          kind: "paragraph",
          content: ["Tu negocio ", { strong: businessName }, " ya está registrado. Para hacer tu primera venta:"],
        },
        {
          kind: "steps",
          items: [
            { title: "Agrega tus productos", detail: "Con nombre y precio basta; el resto puedes completarlo después." },
            { title: "Abre la caja", detail: "Indica con cuánto efectivo empiezas el día." },
            { title: "Vende", detail: "Desde Punto de venta, toca los productos y confirma la venta." },
          ],
        },
        {
          kind: "paragraph",
          content: [
            "Cuando lo necesites, también puedes emitir facturas en PDF, llevar los fiados de tus clientes y darle acceso a tus cajeros.",
          ],
        },
      ],
      cta: baseUrl ? { label: "Entrar a BILLIFY", url: `${baseUrl}/auth/login` } : null,
      footer: accountFooter("Recibes este correo porque acabas de crear una cuenta en BILLIFY."),
    },
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
  const baseUrl = appBaseUrl();
  await send({
    to,
    subject: `${ownerName} te ha registrado en ${businessName} — BILLIFY`,
    spec: {
      preheader: `Ya tienes acceso a BILLIFY como cajero de ${businessName}.`,
      brand: "BILLIFY",
      eyebrow: `Acceso a ${businessName}`,
      title: "Ya tienes acceso a BILLIFY",
      greeting: greet(employeeName),
      blocks: [
        {
          kind: "paragraph",
          content: [{ strong: ownerName }, " te registró como cajero en ", { strong: businessName }, "."],
        },
        { kind: "facts", rows: [{ label: "Correo de acceso", value: loginEmail }] },
        {
          kind: "callout",
          content: [
            ownerName,
            " te entregará tu contraseña temporal en persona. Al entrar por primera vez tendrás que cambiarla por una tuya.",
          ],
        },
      ],
      cta: baseUrl ? { label: "Iniciar sesión", url: `${baseUrl}/auth/login` } : null,
      note: "Si no reconoces este registro, ignora este correo.",
      footer: accountFooter(`Recibes este correo porque ${ownerName} creó una cuenta de cajero con esta dirección.`),
    },
  });
}

// ─── Factura al cliente final ───────────────────────────────────────────────

/** Datos de la venta y del negocio para el cuerpo del correo de factura (todos opcionales). */
export type InvoiceEmailDetails = {
  total?: number;
  issuedAt?: Date;
  customerName?: string | null;
  business?: { address?: string | null; phone?: string | null; email?: string | null };
};

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const ISSUED_AT = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Correo simple válido para usarlo como "responder a" (evita cabeceras rotas). */
const looksLikeEmail = (v: string | null | undefined): v is string =>
  !!v && v.length <= 254 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(v);

export async function sendInvoiceEmail(
  to: string,
  invoiceNumber: string,
  businessName: string,
  pdfBuffer: Buffer,
  details: InvoiceEmailDetails = {},
) {
  // El número de factura también va en el nombre del adjunto: solo caracteres seguros
  const fileNumber = invoiceNumber.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "factura";
  const fileName = `Factura-${fileNumber}.pdf`;
  const customer = details.customerName?.trim();
  const isNamedCustomer = !!customer && customer.toLowerCase() !== "consumidor final";
  const contact = details.business ?? {};
  const replyEmail = contact.email?.trim();

  const facts: { label: string; value: string; emphasis?: boolean }[] = [{ label: "Factura", value: invoiceNumber }];
  if (details.issuedAt) facts.push({ label: "Fecha", value: ISSUED_AT.format(details.issuedAt) });
  if (isNamedCustomer) facts.push({ label: "Cliente", value: customer });
  if (details.total != null) facts.push({ label: "Total", value: COP.format(details.total), emphasis: true });

  const contactLines = [
    contact.address?.trim(),
    contact.phone?.trim() ? `Tel. ${contact.phone.trim()}` : null,
    looksLikeEmail(replyEmail) ? replyEmail : null,
  ].filter((l): l is string => !!l);

  await send({
    to,
    // El cliente reconoce al negocio, no a BILLIFY: el remitente lleva su nombre
    // y las respuestas le llegan al negocio si tiene correo configurado.
    sender: { name: safeSenderName(`${businessName} vía BILLIFY`), email: env.SMTP_FROM },
    replyTo: looksLikeEmail(replyEmail) ? { email: replyEmail, name: safeSenderName(businessName) } : undefined,
    subject: `Factura ${invoiceNumber} — ${businessName}`,
    spec: {
      preheader:
        details.total != null
          ? `Factura ${invoiceNumber} por ${COP.format(details.total)}. El PDF va adjunto.`
          : `Factura ${invoiceNumber}. El PDF va adjunto.`,
      brand: businessName,
      eyebrow: "Factura de venta",
      title: `Tu factura ${invoiceNumber}`,
      greeting: greet(isNamedCustomer ? customer : null),
      blocks: [
        { kind: "paragraph", content: ["Gracias por tu compra en ", { strong: businessName }, ". Este es el resumen:"] },
        { kind: "facts", rows: facts },
        { kind: "paragraph", content: ["La factura completa va adjunta en PDF: ", { strong: fileName }, "."] },
      ],
      note: replyEmail && looksLikeEmail(replyEmail)
        ? "¿Tienes alguna pregunta sobre esta compra? Responde a este correo y le llegará al negocio."
        : undefined,
      footer: [
        businessName,
        ...contactLines,
        "Factura operativa: no tiene validez tributaria ante la DIAN.",
        "Enviada con BILLIFY, software de punto de venta.",
      ],
    },
    attachment: [{ name: fileName, content: pdfBuffer.toString("base64") }],
  });
}

// ─── Suscripción ────────────────────────────────────────────────────────────

/** Aviso de suscripción (recordatorio, vencimiento, pago recibido). Texto plano: se escapa todo. */
export type SubscriptionEmail = {
  subject: string;
  title: string;
  /** Párrafos del cuerpo. */
  paragraphs: string[];
  ctaLabel: string;
};

export async function sendSubscriptionEmail(to: string, name: string | null, email: SubscriptionEmail) {
  const baseUrl = appBaseUrl();
  const blocks: EmailSpec["blocks"] = email.paragraphs.map((p) => ({ kind: "paragraph", content: [p] }));
  if (!baseUrl) blocks.push({ kind: "paragraph", content: ["Entra a BILLIFY y abre ", { strong: "Suscripción" }, "."] });

  await send({
    to,
    subject: `${email.subject} — BILLIFY`,
    spec: {
      preheader: email.paragraphs[0] ?? email.title,
      brand: "BILLIFY",
      eyebrow: "Tu suscripción",
      title: email.title,
      greeting: greet(name),
      blocks,
      cta: baseUrl ? { label: email.ctaLabel, url: `${baseUrl}/suscripcion` } : null,
      footer: accountFooter("Recibes este aviso porque administras una cuenta de BILLIFY."),
    },
  });
}
