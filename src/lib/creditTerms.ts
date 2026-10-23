// Acuerdo de fiado: texto de condiciones que el cliente acepta y firma.
// El dueño puede reemplazarlo en Configuración; estos marcadores se llenan al firmar.

export const CREDIT_TERMS_PLACEHOLDERS = ["{negocio}", "{cliente}", "{limite}", "{plazo}"] as const;

export const DEFAULT_CREDIT_TERMS = `1. {negocio} le abre a {cliente} una cuenta de fiado para llevar productos y pagarlos después.
2. El monto máximo que puede deber es {limite}. No se fiarán compras que superen ese monto.
3. Cada compra fiada debe pagarse {plazo}. Se pueden hacer abonos parciales en cualquier momento.
4. El cliente reconoce como suyas las compras fiadas registradas a su nombre y se compromete a pagarlas.
5. Si el cliente se atrasa en sus pagos, {negocio} puede suspender el fiado hasta que se ponga al día.
6. El cliente puede pedir en cualquier momento el detalle de lo que debe.`;

export const MAX_CREDIT_TERMS_LENGTH = 4000;

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export function creditLimitLabel(limit: number | null | undefined): string {
  return limit ? COP.format(limit) : "sin límite";
}

export function creditTermLabel(days: number | null | undefined): string {
  if (!days) return "cuando el cliente pueda, sin fecha fija";
  return `dentro de los ${days} días siguientes a la compra`;
}

/** Texto final del acuerdo con los datos de este cliente. */
export function renderCreditTerms(
  template: string | null | undefined,
  data: { businessName: string; customerName: string; creditLimit: number | null; creditTermDays: number | null },
): string {
  const base = template?.trim() ? template : DEFAULT_CREDIT_TERMS;
  return base
    .replaceAll("{negocio}", data.businessName)
    .replaceAll("{cliente}", data.customerName)
    .replaceAll("{limite}", creditLimitLabel(data.creditLimit))
    .replaceAll("{plazo}", creditTermLabel(data.creditTermDays));
}
