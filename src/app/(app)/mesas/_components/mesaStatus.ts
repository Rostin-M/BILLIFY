type GuestLike = { orders: { total: number; items: { quantity: number }[] }[] };

export type TableStatus =
  | "PENDING"
  /** Ya se cobró todo (con "Mantener clientes en mesa"): se puede cerrar o seguir pidiendo. */
  | "CHARGED"
  | "NO_ORDERS";

export function tableStatus(guests: { orders: unknown[] }[], salesCount: number): TableStatus {
  if (guests.some((g) => g.orders.length > 0)) return "PENDING";
  return salesCount > 0 ? "CHARGED" : "NO_ORDERS";
}

export function guestTotal(guest: { orders: { total: number }[] }): number {
  return guest.orders.reduce((s, o) => s + o.total, 0);
}

/** Unidades pedidas (un producto por peso o monto libre cuenta como 1). */
export function itemCount(orders: GuestLike["orders"]): number {
  return orders.reduce((n, o) => n + o.items.reduce((m, i) => m + Math.max(1, Math.round(i.quantity)), 0), 0);
}

export function elapsedLabel(from: Date | string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(from).getTime()) / 60_000));
  if (minutes < 1) return "recién abierta";
  if (minutes < 60) return `hace ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `hace ${h} h` : `hace ${h} h ${m} min`;
}

export const LONG_OPEN_MINUTES = 120;

export function minutesSince(from: Date | string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(from).getTime()) / 60_000));
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
