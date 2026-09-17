// Los precios de producto en BILLIFY ya incluyen los impuestos aplicables
// (precio final al cliente). Para mostrar el desglose de subtotal + impuestos
// en el carrito, mesas y facturas, se extrae el impuesto "hacia atrás" a partir
// de ese precio final, usando solo los impuestos que el producto tiene
// seleccionados (taxSlots) entre los configurados por el negocio (business.taxes).

export type TaxConfig = { name: string; rate: number; enabled: boolean };
export type TaxLine = { name: string; rate: number; amount: number };
export type PricedItem = { price: number; quantity: number; taxSlots?: number[] };

export type SaleTotals = {
  subtotal: number;
  taxAmount: number;
  taxLines: TaxLine[];
  total: number;
};

export function computeSaleTotals(
  items: PricedItem[],
  taxes: TaxConfig[],
  autoTax: boolean,
): SaleTotals {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  if (!autoTax) {
    return { subtotal: total, taxAmount: 0, taxLines: [], total };
  }

  let subtotal = 0;
  const taxTotals = new Map<string, { rate: number; amount: number }>();

  for (const item of items) {
    const itemTotal = item.price * item.quantity;
    const applicable = (item.taxSlots ?? [])
      .map((slot) => taxes[slot])
      .filter((t): t is TaxConfig => !!t && t.enabled && t.rate > 0);

    const totalRate = applicable.reduce((sum, t) => sum + t.rate, 0);
    if (totalRate === 0) {
      subtotal += itemTotal;
      continue;
    }

    const itemSubtotal = itemTotal / (1 + totalRate / 100);
    const itemTaxAmount = itemTotal - itemSubtotal;
    subtotal += itemSubtotal;

    for (const tax of applicable) {
      const key = `${tax.name}|${tax.rate}`;
      const existing = taxTotals.get(key) ?? { rate: tax.rate, amount: 0 };
      existing.amount += itemTaxAmount * (tax.rate / totalRate);
      taxTotals.set(key, existing);
    }
  }

  const taxLines: TaxLine[] = Array.from(taxTotals.entries()).map(([key, v]) => ({
    name: key.split("|")[0]!,
    rate: v.rate,
    amount: Math.round(v.amount),
  }));
  const taxAmount = taxLines.reduce((sum, t) => sum + t.amount, 0);

  return { subtotal: Math.round(subtotal), taxAmount, taxLines, total };
}
