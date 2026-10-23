/** "algo@dominio.ext"; `forbidden` son caracteres que no se aceptan. */
export function isSimpleEmail(value: string, forbidden = ""): boolean {
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return false;
  for (const ch of value) {
    if (ch !== "@" && (/\s/.test(ch) || forbidden.includes(ch))) return false;
  }
  const domain = value.slice(at + 1);
  return domain.length >= 3 && domain.slice(1, -1).includes(".");
}
