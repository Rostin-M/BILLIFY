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
