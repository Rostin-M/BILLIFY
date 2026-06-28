import "server-only";

import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";

export type AdjustStockParams = {
  tx: Prisma.TransactionClient;
  productId: string;
  businessId: string;
  userId: string;
  /** Positivo = entrada, negativo = salida */
  quantity: number;
  /** "SALE" | "MANUAL_ADJUSTMENT" | "CORRECTION" | "RETURN" */
  reason: string;
  note?: string;
};

/**
 * Ajusta el stock de un producto atómicamente dentro de una transacción Prisma.
 * Registra el movimiento en `inventory_movements` para trazabilidad.
 * Lanza TRPCError NOT_FOUND o BAD_REQUEST si el producto no existe o el stock quedaría negativo.
 */
export async function adjustStock({
  tx,
  productId,
  businessId,
  userId,
  quantity,
  reason,
  note,
}: AdjustStockParams): Promise<{ newStock: number }> {
  const product = await tx.product.findFirst({
    where: { id: productId, businessId },
    select: { id: true, name: true, stock: true },
  });

  if (!product) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Producto no encontrado en este negocio.",
    });
  }

  const newStock = product.stock + quantity;

  if (newStock < 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Stock insuficiente para "${product.name}". Disponible: ${product.stock}.`,
    });
  }

  await tx.product.update({
    where: { id: productId },
    data: { stock: newStock },
  });

  await tx.inventoryMovement.create({
    data: {
      businessId,
      productId,
      userId,
      quantity,
      reason,
      note: note ?? null,
      stockAfter: newStock,
    },
  });

  return { newStock };
}
