/**
 * Billetes y monedas en circulación en Colombia, para el arqueo de caja
 * (contar cuántos hay de cada uno en vez de escribir el total).
 */
export const COP_BILLS = [100_000, 50_000, 20_000, 10_000, 5_000, 2_000] as const;
export const COP_COINS = [1_000, 500, 200, 100, 50] as const;
export const COP_DENOMINATIONS: readonly number[] = [...COP_BILLS, ...COP_COINS];

/** { "<denominación>": cantidad } — así se guarda en CashRegister.countedBreakdown. */
export type CashBreakdown = Record<string, number>;

export function isDenomination(value: number): boolean {
  return COP_DENOMINATIONS.includes(value);
}

/** Total en pesos de un arqueo. */
export function sumBreakdown(breakdown: CashBreakdown): number {
  return Object.entries(breakdown).reduce((sum, [denomination, count]) => sum + Number(denomination) * count, 0);
}

/** Diferencia del cuadre en pesos enteros: positivo = sobra, negativo = falta. */
export function cashDifference(counted: number, expected: number): number {
  return Math.round(counted - expected);
}
