/**
 * Correo con forma "algo@dominio.ext": una sola @, algo antes, y en el dominio un punto que
 * no esté ni al principio ni al final. Sin expresión regular con cuantificadores encadenados,
 * así el tiempo es lineal aunque llegue un texto largo hecho a propósito.
 * `forbidden` son los caracteres que no se aceptan en ninguna parte (siempre espacios y @).
 */
export function isSimpleEmail(value: string, forbidden = ""): boolean {
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return false;
  for (const ch of value) {
    if (ch !== "@" && (/\s/.test(ch) || forbidden.includes(ch))) return false;
  }
  const domain = value.slice(at + 1);
  return domain.length >= 3 && domain.slice(1, -1).includes(".");
}
