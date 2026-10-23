import "server-only";

import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";

const fmtCOP = (v: number) =>
  v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });

/** Lo que debe un cliente: ventas fiadas vigentes menos sus abonos. */
export async function computeCustomerDebt(db: Prisma.TransactionClient, businessId: string, customerId: string) {
  const [creditTotal, paidTotal] = await Promise.all([
    db.sale.aggregate({
      where: { businessId, customerId, paymentMethod: "CREDIT", status: "COMPLETED" },
      _sum: { total: true },
    }),
    db.customerPayment.aggregate({
      where: { businessId, customerId },
      _sum: { amount: true },
    }),
  ]);
  return (creditTotal._sum.total ?? 0) - (paidTotal._sum.amount ?? 0);
}

/**
 * Antes de fiarle `amount` a un cliente: si el negocio exige el acuerdo firmado, que lo haya
 * firmado; y si el cliente tiene monto máximo, que la nueva deuda no lo pase.
 */
export async function assertCreditAllowed(
  db: Prisma.TransactionClient,
  businessId: string,
  customerId: string,
  amount: number,
): Promise<void> {
  // Bloquear al cliente: dos fiados simultáneos no pueden pasarse juntos del monto máximo.
  await db.$queryRaw`SELECT "id" FROM "customers" WHERE "id" = ${customerId} AND "business_id" = ${businessId} FOR UPDATE`;
  const [business, customer] = await Promise.all([
    db.business.findUnique({ where: { id: businessId }, select: { creditSignatureRequired: true } }),
    db.customer.findFirst({
      where: { id: customerId, businessId },
      select: { name: true, creditLimit: true, _count: { select: { creditAgreements: true } } },
    }),
  ]);
  if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente no encontrado en este negocio." });

  if (business?.creditSignatureRequired && customer._count.creditAgreements === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${customer.name} no ha firmado el acuerdo de fiado. Ábrele la cuenta en Fiados antes de fiarle.`,
    });
  }

  if (customer.creditLimit != null) {
    const debt = await computeCustomerDebt(db, businessId, customerId);
    if (debt + amount > customer.creditLimit + 0.01) {
      const available = Math.max(customer.creditLimit - debt, 0);
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Se pasa del monto máximo de fiado de ${customer.name} (${fmtCOP(customer.creditLimit)}). Debe ${fmtCOP(Math.max(debt, 0))}; le puedes fiar hasta ${fmtCOP(available)}.`,
      });
    }
  }
}
