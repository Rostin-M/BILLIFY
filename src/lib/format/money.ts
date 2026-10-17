/**
 * Formato de pesos colombianos para toda la app (pantallas y PDF): "$ 12.500".
 * Una sola instancia de Intl, en vez de crear una en cada llamada.
 */
const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });

export function formatCOP(value: number): string {
  return COP.format(value);
}
