import { z } from "zod";

/**
 * Formato del archivo de respaldo de productos y clientes (JSON).
 * Lo comparten la exportación, la importación y la pantalla que lo previsualiza.
 *
 * Reglas:
 * - `ref` es el id original: sirve para enlazar fiados ↔ productos dentro del
 *   archivo y para no duplicar fiados si el mismo archivo se carga dos veces.
 * - Los productos llevan el último precio; no hay historial de precios ni de
 *   movimientos de inventario.
 * - Un cliente trae `credit` solo si tiene fiado pendiente: todas sus ventas
 *   fiadas y sus abonos, con fechas, para que el saldo cuadre al importarlo.
 */

export const BACKUP_FORMAT = "billify-backup";
export const BACKUP_VERSION = 1;

/** Topes para no cargar archivos que tumben el servidor (y el límite de 4,5 MB de Vercel). */
export const BACKUP_LIMITS = {
  fileBytes: 4 * 1024 * 1024,
  products: 10_000,
  customers: 10_000,
  creditSalesPerCustomer: 2_000,
  itemsPerSale: 200,
  paymentsPerCustomer: 2_000,
} as const;

const money = z.number().finite().min(0).max(1_000_000_000);
const text = (max: number) => z.string().trim().max(max);
/** Texto opcional: vacío, null o ausente quedan como null. */
const optionalText = (max: number) =>
  text(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined || v === null || v === "" ? null : v));
/** En el archivo las fechas van como texto ISO; al validar se vuelven Date. */
const isoDate = z
  .union([z.string().datetime({ offset: true }), z.date()])
  .pipe(z.coerce.date({ errorMap: () => ({ message: "Fecha inválida" }) }));
const ref = z.string().trim().min(1).max(64);

export const backupProductSchema = z.object({
  ref,
  name: text(120).min(1),
  price: money,
  cost: money
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  unit: text(20).min(1).default("und"),
  taxSlots: z.array(z.number().int().min(0).max(2)).max(3).default([]),
  stock: z.number().int().min(0).max(1_000_000_000).default(0),
  trackStock: z.boolean().default(true),
  isActive: z.boolean().default(true),
  category: optionalText(60),
  lotNumber: optionalText(60),
  expiresAt: isoDate
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  barcode: optionalText(64),
  brand: optionalText(80),
  presentation: optionalText(80),
  openPrice: z.boolean().default(false),
  soldByWeight: z.boolean().default(false),
  createdAt: isoDate.optional(),
});

const taxLinesSchema = z
  .unknown()
  .nullable()
  .optional()
  .transform((v) => v ?? null);

export const backupCreditSaleSchema = z.object({
  ref,
  date: isoDate,
  saleType: z.enum(["QUICK", "INVOICED", "TABLE"]).default("QUICK"),
  invoiceNumber: optionalText(40),
  subtotal: money,
  taxAmount: money.default(0),
  taxLines: taxLinesSchema,
  total: money,
  note: optionalText(500),
  items: z
    .array(
      z.object({
        productRef: ref,
        name: text(120).min(1),
        unit: text(20).min(1).default("und"),
        price: money,
        quantity: z.number().int().min(1).max(1_000_000),
        subtotal: money,
        taxLines: taxLinesSchema,
      }),
    )
    .min(1)
    .max(BACKUP_LIMITS.itemsPerSale),
});

export const backupPaymentSchema = z.object({
  ref,
  date: isoDate,
  amount: money.refine((v) => v > 0, "El abono debe ser mayor a 0"),
  method: z.enum(["CASH", "CARD", "TRANSFER"]).default("CASH"),
  note: optionalText(500),
});

export const backupCustomerSchema = z.object({
  ref,
  name: text(120).min(1),
  alias: optionalText(80),
  document: optionalText(30),
  email: optionalText(254),
  phone: optionalText(30),
  isActive: z.boolean().default(true),
  createdAt: isoDate.optional(),
  credit: z
    .object({
      /** Saldo pendiente al exportar (informativo: al importar se recalcula). */
      balance: money,
      /** Fecha del primer fiado que sigue sin pagar por completo. */
      pendingSince: isoDate.nullable(),
      sales: z
        .array(backupCreditSaleSchema)
        .max(BACKUP_LIMITS.creditSalesPerCustomer),
      payments: z
        .array(backupPaymentSchema)
        .max(BACKUP_LIMITS.paymentsPerCustomer),
    })
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});

export const backupFileSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT, {
      errorMap: () => ({ message: "El archivo no es un respaldo de BILLIFY." }),
    }),
    version: z.literal(BACKUP_VERSION, {
      errorMap: () => ({
        message: "Esta versión del archivo no es compatible.",
      }),
    }),
    exportedAt: isoDate,
    business: z.object({ name: text(120), document: text(30) }),
    products: z.array(backupProductSchema).max(BACKUP_LIMITS.products),
    customers: z.array(backupCustomerSchema).max(BACKUP_LIMITS.customers),
  })
  .superRefine((file, ctx) => {
    const refs = new Set<string>();
    const barcodes = new Set<string>();
    file.products.forEach((p, i) => {
      if (refs.has(p.ref))
        ctx.addIssue({
          code: "custom",
          path: ["products", i, "ref"],
          message: "Producto repetido en el archivo.",
        });
      refs.add(p.ref);
      if (p.barcode) {
        if (barcodes.has(p.barcode)) {
          ctx.addIssue({
            code: "custom",
            path: ["products", i, "barcode"],
            message: `Código de barras repetido: ${p.barcode}.`,
          });
        }
        barcodes.add(p.barcode);
      }
    });
    file.customers.forEach((c, i) =>
      c.credit?.sales.forEach((s, j) =>
        s.items.forEach((item, k) => {
          if (!refs.has(item.productRef)) {
            ctx.addIssue({
              code: "custom",
              path: ["customers", i, "credit", "sales", j, "items", k],
              message: `El fiado de ${c.name} usa un producto que no está en el archivo.`,
            });
          }
        }),
      ),
    );
  });

/** Archivo tal como se escribe (fechas como texto ISO). */
export type BackupFileInput = z.input<typeof backupFileSchema>;
/** Archivo ya validado (fechas como Date, opcionales resueltos). */
export type BackupFile = z.output<typeof backupFileSchema>;

export type BackupImportSummary = {
  products: { created: number; updated: number };
  customers: { created: number; updated: number };
  credit: { sales: number; payments: number; skipped: number };
};

/** Primer mensaje de error legible de una validación fallida. */
export function firstBackupIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "El archivo no es válido.";
  const where = issue.path.length ? ` (${issue.path.join(" › ")})` : "";
  return issue.code === "custom" || issue.path.length <= 1
    ? issue.message
    : `${issue.message}${where}`;
}
