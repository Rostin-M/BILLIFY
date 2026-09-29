"use server";

import { requireApiUser } from "~/server/auth/requirePageUser";
import { db } from "~/server/db";

/**
 * ¿El usuario de la sesión actual tiene una caja abierta? Lo usa
 * SessionExpiryGuard para recordar cerrarla antes de que venza la sesión.
 * Solo revela el estado de la propia caja del usuario autenticado.
 */
export async function hasOpenCashRegister(): Promise<boolean> {
  const user = await requireApiUser();
  if (!user?.businessId) return false;

  const register = await db.cashRegister.findFirst({
    where: { businessId: user.businessId, userId: user.id, status: "OPEN" },
    select: { id: true },
  });
  return register !== null;
}
