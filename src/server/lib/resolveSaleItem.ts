import { TRPCError } from "@trpc/server";

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
