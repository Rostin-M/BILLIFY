import "server-only";

import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";

import { toBogotaDateKey } from "./bogotaTime";

/**
 * Si la caja que se usaría para esta acción sigue abierta desde un día
 * Bogotá anterior al de hoy, bloquea la operación. Una caja abierta que
 * cruza la medianoche mezcla las ventas de dos días en un solo saldo, así
 * que hay que cerrarla (contar el efectivo de ese día) antes de seguir
 * registrando ventas o movimientos nuevos.
 */
export async function assertCashRegisterNotStale(
  db: Prisma.TransactionClient,
  businessId: string,
  userId: string,
): Promise<void> {
  const register =
    (await db.cashRegister.findFirst({
      where: { businessId, userId, status: "OPEN" },
      select: { openedAt: true },
    })) ??
    (await db.cashRegister.findFirst({
      where: { businessId, status: "OPEN" },
      select: { openedAt: true },
    }));

  if (!register) return;

  if (toBogotaDateKey(register.openedAt) !== toBogotaDateKey(new Date())) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "Hay una caja abierta desde un día anterior. Ciérrala en Caja antes de seguir registrando ventas o movimientos de hoy.",
    });
  }
}

/**
 * Caja a la que se asigna una venta nueva (llamar dentro de la transacción que la crea):
 * la caja OPEN del propio vendedor; si no tiene, la única caja OPEN del negocio cuando hay
 * exactamente una; en cualquier otro caso null (no se adivina a qué cajero le entró el dinero).
 *
 * FOR KEY SHARE: si la caja se está cerrando en paralelo (cierre con FOR UPDATE), esta lectura
 * espera al cierre y, al releer la fila ya CLOSED, deja de encontrarla — la venta nunca queda
 * ligada a una caja cuyo saldo ya se contó. No bloquea otras ventas simultáneas.
 */
export async function resolveSaleCashRegisterId(
  tx: Prisma.TransactionClient,
  businessId: string,
  userId: string,
): Promise<string | null> {
  const own = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "cash_registers"
     WHERE "business_id" = ${businessId} AND "user_id" = ${userId} AND "status" = 'OPEN'
     LIMIT 1
     FOR KEY SHARE
  `;
  if (own[0]) return own[0].id;

  const open = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "cash_registers"
     WHERE "business_id" = ${businessId} AND "status" = 'OPEN'
     LIMIT 2
     FOR KEY SHARE
  `;
  return open.length === 1 ? open[0]!.id : null;
}
