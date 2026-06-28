// Versión de contrato: v1
// Tipos compartidos entre todos los adaptadores de integración.
// Los datos se pasan como plain objects — desacoplados de los modelos Prisma.

export type SaleData = {
  id: string;
  invoiceNumber: string | null;
  saleType: "QUICK" | "INVOICED";
  paymentMethod: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  note: string | null;
  createdAt: Date;
  customer: { name: string; document?: string | null; email?: string | null } | null;
  items: { name: string; quantity: number; price: number; subtotal: number }[];
};

export type ProductData = {
  id: string;
  name: string;
  stock: number;
  category: string | null;
};

export type CashRegisterData = {
  id: string;
  openingBalance: number;
  closingBalance: number;
  cashSalesTotal: number;
  manualBalance: number;
  openedAt: Date;
  closedAt: Date;
};

export type IntegrationResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Envuelve una llamada a integración externa para que los fallos
 * no bloqueen la operación core. Registra el error y retorna fallback.
 */
export async function safeIntegrationCall<T>(
  name: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[Integration:${name}]`, err);
    return fallback;
  }
}
