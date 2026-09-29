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
 *
 * El ajuste se hace en una sola sentencia UPDATE (stock = stock + delta) con la condición
 * `stock >= cantidad` para las salidas: dos ventas simultáneas del mismo producto ya no
 * pueden leer el mismo stock y pisarse (lost update), ni dejarlo en negativo.
 */
export async function adjustStock({
  tx,
  productId,
  businessId,
  userId,
  quantity,
  reason,
  note,
}: AdjustStockParams): Promise<{ newStock: number; previousStock: number }> {
  const isDecrement = quantity < 0;

  const { count } = await tx.product.updateMany({
    where: {
      id: productId,
      businessId,
      ...(isDecrement ? { stock: { gte: -quantity } } : {}),
    },
    data: { stock: { increment: quantity } },
  });

  if (count !== 1) {
    const product = await tx.product.findFirst({
      where: { id: productId, businessId },
      select: { name: true, stock: true },
    });
    if (!product) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Producto no encontrado en este negocio.",
      });
    }
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Stock insuficiente para "${product.name}". Disponible: ${product.stock}.`,
    });
  }

  // La fila quedó bloqueada por el UPDATE hasta el commit: esta lectura ve nuestro propio valor.
  const updated = await tx.product.findFirst({
    where: { id: productId, businessId },
    select: { stock: true },
  });
  const newStock = updated?.stock ?? 0;

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

  return { newStock, previousStock: newStock - quantity };
}

export type RestorableItem = {
  quantity: number;
  /** Unidades descontadas al vender/pedir; null en filas anteriores a este campo. */
  stockDeducted: number | null;
  product: { trackStock: boolean; openPrice: boolean; soldByWeight: boolean };
};

/**
 * Cuántas unidades devolver al inventario al anular una venta o cancelar un pedido.
 * Se devuelve exactamente lo que se descontó (stockDeducted), aunque el producto haya
 * cambiado de configuración después. Solo en filas históricas (null) se aplica la regla
 * anterior: la cantidad si el producto controla stock y no es de monto libre ni por peso
 * (esos nunca descontaban unidades).
 */
export function stockToRestore(item: RestorableItem): number {
  if (item.stockDeducted !== null) return item.stockDeducted;
  const { trackStock, openPrice, soldByWeight } = item.product;
  if (!trackStock || openPrice || soldByWeight) return 0;
  return item.quantity;
}
