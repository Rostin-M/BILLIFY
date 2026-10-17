/**
 * Plantilla base de todos los correos de BILLIFY (tema oscuro).
 *
 * Pensada para clientes de correo, no para navegadores: tablas de diagramación con
 * role="presentation", estilos en línea, ancho fluido con tope de 600 px (tabla
 * fantasma para Outlook), colores sólidos con `bgcolor` de respaldo, botón hecho
 * con una celda de tabla y la marca en texto para que se entienda aunque se
 * bloqueen las imágenes. Cada correo sale además en texto plano.
 *
 * Todo texto que entra aquí se escapa: los llamadores pasan texto, nunca HTML.
 */

/** Un fragmento de párrafo: texto normal o resaltado en negrita. */
export type Inline = string | { strong: string };

export type EmailBlock =
  | { kind: "paragraph"; content: Inline[] }
  /** Lista numerada: solo para pasos en orden. */
  | { kind: "steps"; items: { title: string; detail: string }[] }
  /** Código grande (verificación, recuperación). */
  | { kind: "code"; label: string; value: string }
  /** Tabla de datos clave (factura, acceso). La fila `emphasis` se muestra en grande. */
  | { kind: "facts"; rows: { label: string; value: string; emphasis?: boolean }[] }
  /** Aviso destacado (seguridad, consecuencias). */
  | { kind: "callout"; content: Inline[] };

export type EmailSpec = {
  /** Texto que la bandeja muestra junto al asunto. */
  preheader: string;
  /** Nombre grande de la cabecera: BILLIFY o, en la factura, el negocio. */
  brand: string;
  /** Línea pequeña bajo la marca (qué tipo de correo es). */
  eyebrow: string;
  title: string;
  /** "Hola Ana," — null omite el saludo. */
  greeting: string | null;
  blocks: EmailBlock[];
  cta?: { label: string; url: string } | null;
  /** Nota pequeña bajo el contenido (p. ej. "Si no fuiste tú, ignora este correo"). */
  note?: string;
  /** Líneas del pie: contacto, motivo del correo, aviso legal. */
  footer: string[];
};

// ─── Paleta (oscura) ──────────────────────────────────────────────────────────
// Contrastes sobre CARD (#151c2f): TEXT 15:1, BODY 11:1, MUTED 6.4:1 — todos AA.
const C = {
  page: "#0b1020",
  card: "#151c2f",
  inset: "#0f1526",
  border: "#26304a",
  brand: "#7c3aed",
  brandSoft: "#ddd6fe",
  accent: "#c4b5fd",
  text: "#f1f5f9",
  body: "#cbd5e1",
  muted: "#94a3b8",
  calloutBg: "#1e1838",
  calloutBorder: "#4c3b8f",
} as const;

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const inlineHtml = (parts: Inline[]) =>
  parts
    .map((p) =>
      typeof p === "string" ? escapeHtml(p) : `<strong style="color:${C.text};font-weight:600">${escapeHtml(p.strong)}</strong>`,
    )
    .join("");

const inlineText = (parts: Inline[]) => parts.map((p) => (typeof p === "string" ? p : p.strong)).join("");

function blockHtml(b: EmailBlock): string {
  switch (b.kind) {
    case "paragraph":
      return `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${C.body}">${inlineHtml(b.content)}</p>`;
    case "steps":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">${b.items
        .map(
          (s, i) => `<tr>
  <td width="36" valign="top" style="padding:0 0 14px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="26" height="26" align="center" bgcolor="${C.brand}" style="background-color:${C.brand};border-radius:13px;font-family:${FONT};font-size:13px;font-weight:700;color:#ffffff;line-height:26px">${i + 1}</td></tr></table>
  </td>
  <td valign="top" style="padding:2px 0 14px;font-family:${FONT}">
    <p style="margin:0;font-size:15px;line-height:22px;font-weight:600;color:${C.text}">${escapeHtml(s.title)}</p>
    <p style="margin:2px 0 0;font-size:14px;line-height:21px;color:${C.muted}">${escapeHtml(s.detail)}</p>
  </td>
</tr>`,
        )
        .join("")}</table>`;
    case "code":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px"><tr>
  <td align="center" bgcolor="${C.inset}" style="background-color:${C.inset};border:1px solid ${C.border};border-radius:12px;padding:20px 16px;font-family:${FONT}">
    <p style="margin:0 0 6px;font-size:13px;line-height:18px;color:${C.muted}">${escapeHtml(b.label)}</p>
    <p style="margin:0;font-size:38px;line-height:46px;font-weight:700;letter-spacing:6px;color:${C.accent};font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace">${escapeHtml(b.value)}</p>
  </td>
</tr></table>`;
    case "facts":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.inset}" style="margin:0 0 20px;background-color:${C.inset};border:1px solid ${C.border};border-radius:12px">${b.rows
        .map(
          (r, i) => `<tr>
  <td style="padding:${i === 0 ? 16 : 10}px 18px ${i === b.rows.length - 1 ? 16 : 10}px;font-family:${FONT};font-size:14px;line-height:20px;color:${C.muted}${i > 0 ? `;border-top:1px solid ${C.border}` : ""}">${escapeHtml(r.label)}</td>
  <td align="right" style="padding:${i === 0 ? 16 : 10}px 18px ${i === b.rows.length - 1 ? 16 : 10}px;font-family:${FONT};font-size:${r.emphasis ? 22 : 15}px;line-height:${r.emphasis ? 28 : 20}px;font-weight:${r.emphasis ? 700 : 600};color:${r.emphasis ? C.text : C.body};word-break:break-word${i > 0 ? `;border-top:1px solid ${C.border}` : ""}">${escapeHtml(r.value)}</td>
</tr>`,
        )
        .join("")}</table>`;
    case "callout":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px"><tr>
  <td bgcolor="${C.calloutBg}" style="background-color:${C.calloutBg};border:1px solid ${C.calloutBorder};border-radius:10px;padding:14px 16px;font-family:${FONT};font-size:14px;line-height:21px;color:${C.brandSoft}">${inlineHtml(b.content)}</td>
</tr></table>`;
  }
}

function blockText(b: EmailBlock): string {
  switch (b.kind) {
    case "paragraph":
      return inlineText(b.content);
    case "steps":
      return b.items.map((s, i) => `${i + 1}. ${s.title}: ${s.detail}`).join("\n");
    case "code":
      return `${b.label}: ${b.value}`;
    case "facts":
      return b.rows.map((r) => `${r.label}: ${r.value}`).join("\n");
    case "callout":
      return inlineText(b.content);
  }
}

function ctaHtml(cta: { label: string; url: string }): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px"><tr>
  <td align="center" bgcolor="${C.brand}" style="background-color:${C.brand};border-radius:10px">
    <a href="${escapeHtml(cta.url)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(cta.label)}</a>
  </td>
</tr></table>`;
}

/** Arma el correo completo (HTML + texto plano) a partir de su contenido. */
export function renderEmail(spec: EmailSpec): { html: string; text: string } {
  const year = new Date().getFullYear();
  const footerLines = [...spec.footer, `© ${year} BILLIFY`];

  // Relleno invisible tras el preheader: evita que la bandeja muestre texto del cuerpo.
  const preheaderPad = "&#8199;&#65279;&#847; ".repeat(40);

  const html = `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(spec.title)}</title>
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; }
  a { color:${C.accent}; }
  @media (max-width:480px) {
    .px { padding-left:20px !important; padding-right:20px !important; }
    .outer { padding:16px 8px !important; }
    .title { font-size:20px !important; line-height:28px !important; }
  }
</style>
</head>
<body bgcolor="${C.page}" style="margin:0;padding:0;background-color:${C.page}">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.page}">${escapeHtml(spec.preheader)}${preheaderPad}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background-color:${C.page}">
<tr><td align="center" class="outer" style="padding:32px 16px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto">
  <tr><td bgcolor="${C.brand}" class="px" style="background-color:${C.brand};border-radius:16px 16px 0 0;padding:24px 32px;font-family:${FONT}">
    <p style="margin:0;font-size:20px;line-height:26px;font-weight:700;letter-spacing:1px;color:#ffffff">${escapeHtml(spec.brand)}</p>
    <p style="margin:4px 0 0;font-size:13px;line-height:18px;color:${C.brandSoft}">${escapeHtml(spec.eyebrow)}</p>
  </td></tr>
  <tr><td bgcolor="${C.card}" class="px" style="background-color:${C.card};padding:32px;font-family:${FONT}">
    <h1 class="title" style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:700;color:${C.text}">${escapeHtml(spec.title)}</h1>
    ${spec.greeting ? `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${C.body}">${escapeHtml(spec.greeting)}</p>` : ""}
    ${spec.blocks.map(blockHtml).join("\n    ")}
    ${spec.cta ? ctaHtml(spec.cta) : ""}
    ${spec.note ? `<p style="margin:8px 0 0;font-size:13px;line-height:20px;color:${C.muted}">${escapeHtml(spec.note)}</p>` : ""}
  </td></tr>
  <tr><td bgcolor="${C.card}" class="px" style="background-color:${C.card};border-top:1px solid ${C.border};border-radius:0 0 16px 16px;padding:20px 32px 24px;font-family:${FONT}">
    ${footerLines.map((l) => `<p style="margin:0 0 4px;font-size:12px;line-height:18px;color:${C.muted}">${escapeHtml(l)}</p>`).join("\n    ")}
  </td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;

  const text = [
    spec.brand.toUpperCase(),
    spec.title,
    "",
    ...(spec.greeting ? [spec.greeting, ""] : []),
    ...spec.blocks.flatMap((b) => [blockText(b), ""]),
    ...(spec.cta ? [`${spec.cta.label}: ${spec.cta.url}`, ""] : []),
    ...(spec.note ? [spec.note, ""] : []),
    "—",
    ...footerLines,
  ].join("\n");

  return { html, text };
}
