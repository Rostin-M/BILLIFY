import "server-only";

import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupFileInput,
} from "~/lib/backup/format";
import { type Db } from "~/server/subscription/service";

type CustomerOut = BackupFileInput["customers"][number];
type CreditOut = NonNullable<CustomerOut["credit"]>;

/** Diferencia mínima para considerar saldada una cuenta (redondeo de centavos). */
const SETTLED = 0.5;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function groupBy<T>(
  rows: readonly T[],
  key: (row: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = groups.get(k);
    if (list) list.push(row);
    else groups.set(k, [row]);
  }
  return groups;
}

/**
 * Fecha del primer fiado que sigue sin pagar: recorre fiados (+) y abonos (−) en
 * orden y se queda con el primer fiado después de la última vez que el saldo
 * llegó a cero.
 */
export function pendingSince(
  sales: readonly { date: Date; total: number }[],
  payments: readonly { date: Date; amount: number }[],
): Date | null {
  const events = [
    ...sales.map((s) => ({ date: s.date, delta: s.total })),
    ...payments.map((p) => ({ date: p.date, delta: -p.amount })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || b.delta - a.delta);

  let balance = 0;
  let since: Date | null = null;
  for (const event of events) {
    const before = balance;
    balance += event.delta;
    if (event.delta > 0 && before <= SETTLED) since = event.date;
    if (balance <= SETTLED) since = null;
  }
  return balance > SETTLED ? since : null;
}

/** Respaldo de productos y clientes (con sus fiados pendientes) de un negocio. */
export async function buildBackup(
  db: Db,
  businessId: string,
  now = new Date(),
): Promise<BackupFileInput> {
  const [business, products, customers, creditSales, payments] =
    await Promise.all([
      db.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { name: true, document: true },
      }),
      db.product.findMany({ where: { businessId }, orderBy: { name: "asc" } }),
      db.customer.findMany({ where: { businessId }, orderBy: { name: "asc" } }),
      db.sale.findMany({
        where: {
          businessId,
          paymentMethod: "CREDIT",
          status: "COMPLETED",
          customerId: { not: null },
        },
        orderBy: { createdAt: "asc" },
        include: { items: true },
      }),
      db.customerPayment.findMany({
        where: { businessId },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  const salesByCustomer = groupBy(creditSales, (s) => s.customerId!);
  const paymentsByCustomer = groupBy(payments, (p) => p.customerId);

  function creditOf(customerId: string): CreditOut | null {
    const sales = salesByCustomer.get(customerId) ?? [];
    const paid = paymentsByCustomer.get(customerId) ?? [];
    const balance =
      sales.reduce((sum, s) => sum + s.total, 0) -
      paid.reduce((sum, p) => sum + p.amount, 0);
    if (balance <= SETTLED) return null;

    return {
      balance: Math.round(balance * 100) / 100,
      pendingSince: iso(
        pendingSince(
          sales.map((s) => ({ date: s.createdAt, total: s.total })),
          paid.map((p) => ({ date: p.createdAt, amount: p.amount })),
        ),
      ),
      sales: sales.map((s) => ({
        ref: s.id,
        date: s.createdAt.toISOString(),
        saleType: s.saleType,
        invoiceNumber: s.invoiceNumber,
        subtotal: s.subtotal,
        taxAmount: s.taxAmount,
        taxLines: s.taxLines,
        total: s.total,
        note: s.note,
        items: s.items.map((item) => ({
          productRef: item.productId,
          name: item.name,
          unit: item.unit,
          price: item.price,
          quantity: item.quantity,
          subtotal: item.subtotal,
          taxLines: item.taxLines,
        })),
      })),
      payments: paid.map((p) => ({
        ref: p.id,
        date: p.createdAt.toISOString(),
        amount: p.amount,
        // Los abonos nunca son a crédito; si alguno viejo lo fuera, cuenta como efectivo.
        method: p.paymentMethod === "CREDIT" ? "CASH" : p.paymentMethod,
        note: p.note,
      })),
    };
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    business: { name: business.name, document: business.document },
    products: products.map((p) => ({
      ref: p.id,
      name: p.name,
      price: p.price,
      cost: p.cost,
      unit: p.unit,
      taxSlots: p.taxSlots,
      stock: Math.max(0, p.stock),
      trackStock: p.trackStock,
      isActive: p.isActive,
      category: p.category,
      lotNumber: p.lotNumber,
      expiresAt: iso(p.expiresAt),
      barcode: p.barcode,
      brand: p.brand,
      presentation: p.presentation,
      openPrice: p.openPrice,
      soldByWeight: p.soldByWeight,
      createdAt: p.createdAt.toISOString(),
    })),
    customers: customers.map((c) => ({
      ref: c.id,
      name: c.name,
      alias: c.alias,
      document: c.document,
      email: c.email,
      phone: c.phone,
      isActive: c.isActive,
      createdAt: c.createdAt.toISOString(),
      credit: creditOf(c.id),
    })),
  };
}
