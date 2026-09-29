import { TRPCError } from "@trpc/server";
import { z } from "zod";

// Límites de entrada compartidos por venta rápida y pedidos de mesa.
export const MAX_MONEY = 1e9;
export const MAX_QUANTITY = 100000;
export const MAX_WEIGHT_KG = 1000;
export const MAX_SALE_ITEMS = 200;

export const saleItemInputSchema = z.object({
  productId: z.string().min(1).max(64),
  quantity: z
    .number()
    .int()
    .positive("La cantidad debe ser mayor a cero")
    .max(MAX_QUANTITY, "Cantidad demasiado grande"),
  weightKg: z.number().finite().positive().max(MAX_WEIGHT_KG, "Peso demasiado grande").optional(),
  customAmount: z.number().finite().positive().max(MAX_MONEY, "Monto demasiado grande").optional(),
});

// Ruta que genera /api/upload/receipt: "<businessId>/<timestamp>-<uuid>.<ext>".
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isValidReceiptPath(businessId: string, path: string): boolean {
  const pattern = new RegExp(`^${escapeRegExp(businessId)}/\\d+-[0-9a-f-]{36}\\.(png|jpg|webp)$`);
  return pattern.test(path);
}

/**
 * Valida que el comprobante enviado por el cliente sea un archivo de ESTE negocio subido
 * por nuestro endpoint — evita que se adjunte (y luego se firme) un archivo de otro negocio.
 */
export function assertReceiptPath(businessId: string, path: string | undefined): string | null {
  if (!path) return null;
  if (!isValidReceiptPath(businessId, path)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "El comprobante adjunto no es válido." });
  }
  return path;
}

// Producto tal como se necesita para resolver una línea de venta (subset de Product).
export type SellableProduct = {
  id: string;
  name: string;
  unit: string;
  price: number;
  trackStock: boolean;
  taxSlots: number[];
  openPrice: boolean;
  soldByWeight: boolean;
};

export type SaleItemRequest = {
  productId: string;
  quantity: number;
  /** Peso en kg — requerido cuando el producto está marcado "se vende por peso". */
  weightKg?: number;
  /** Monto total de la línea — requerido cuando el producto está marcado "monto libre". */
  customAmount?: number;
};

export type ResolvedSaleItem = {
  productId: string;
  name: string;
  unit: string;
  price: number;
  quantity: number;
  subtotal: number;
  taxSlots: number[];
  /** Cuánto descontar del stock del producto — 0 para productos sin control de stock o de venta especial. */
  stockDelta: number;
};

// Redondea hacia arriba a la centena más cercana (convención de precios en COP),
// ej. $4780 -> $4800.
function roundUpToHundred(amount: number): number {
  return Math.ceil(amount / 100) * 100;
}

/**
 * Calcula nombre, precio y subtotal reales de una línea de venta a partir del producto
 * y lo que envió el cliente. Centraliza la lógica de "monto libre" y "venta por peso" para
 * que venta rápida y pedidos de mesa no puedan divergir ni confiar en un precio del cliente
 * para productos normales.
 */
export function resolveSaleItem(product: SellableProduct, item: SaleItemRequest): ResolvedSaleItem {
  if (product.soldByWeight) {
    if (!item.weightKg || item.weightKg <= 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Indica el peso de "${product.name}".` });
    }
    const lineTotal = roundUpToHundred(product.price * item.weightKg);
    return {
      productId: product.id,
      name: `${product.name} (${item.weightKg} kg)`,
      unit: product.unit,
      price: lineTotal,
      quantity: 1,
      subtotal: lineTotal,
      taxSlots: product.taxSlots,
      stockDelta: 0,
    };
  }

  if (product.openPrice) {
    if (!item.customAmount || item.customAmount <= 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Indica el monto para "${product.name}".` });
    }
    return {
      productId: product.id,
      name: product.name,
      unit: product.unit,
      price: item.customAmount,
      quantity: 1,
      subtotal: item.customAmount,
      taxSlots: product.taxSlots,
      stockDelta: 0,
    };
  }

  return {
    productId: product.id,
    name: product.name,
    unit: product.unit,
    price: product.price,
    quantity: item.quantity,
    subtotal: product.price * item.quantity,
    taxSlots: product.taxSlots,
    stockDelta: product.trackStock ? item.quantity : 0,
  };
}
