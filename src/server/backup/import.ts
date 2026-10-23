import "server-only";

import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import { type BackupFile, type BackupImportSummary } from "~/lib/backup/format";
import { getPlan, type PlanCode } from "~/lib/subscription/catalog";
import { rememberBrands } from "~/server/lib/brands";

/** Motivo de los movimientos de inventario que crea la importación (ver ProductHistory). */
export const IMPORT_MOVEMENT_REASON = "IMPORT";

/** Prefijo de la llave de idempotencia de fiados y abonos importados. */
const importKey = (ref: string) => `import:${ref}`;

const normalize = (value: string) => value.trim().toLocaleLowerCase("es-CO");

/** Los Json opcionales de Prisma no aceptan null en createMany: se omiten. */
const jsonOrUndefined = (value: unknown) =>
  value === null || value === undefined
    ? undefined
    : (value as Prisma.InputJsonValue);

type ImportContext = { businessId: string; userId: string; plan: PlanCode };

/**
 * Busca el registro existente que corresponde a uno del archivo: primero por la
 * llave fuerte (código de barras o documento) y, si no, por nombre, siempre que
 * las llaves no se contradigan. Un existente solo se empareja una vez.
 */
function matcher<T extends { id: string; name: string }>(
  rows: T[],
  keyOf: (row: T) => string | null,
) {
  const byKey = new Map<string, T>();
  const byName = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key && !byKey.has(key)) byKey.set(key, row);
    if (!byName.has(normalize(row.name))) byName.set(normalize(row.name), row);
  }
  const claimed = new Set<string>();
  return {
    byKey,
    match(name: string, key: string | null): T | undefined {
      let found = key ? byKey.get(key) : undefined;
      if (!found) {
        const candidate = byName.get(normalize(name));
        const existingKey = candidate ? keyOf(candidate) : null;
        if (candidate && (!key || !existingKey || existingKey === key))
          found = candidate;
      }
      if (!found || claimed.has(found.id)) return undefined;
      claimed.add(found.id);
      return found;
    },
  };
}

type ProductEntry = BackupFile["products"][number];
type ExistingProduct = Awaited<ReturnType<Prisma.TransactionClient["product"]["findMany"]>>[number];
type ProductMatcher = ReturnType<typeof matcher<ExistingProduct>>;

const productFields = (p: ProductEntry) => ({
  name: p.name,
  price: p.price,
  cost: p.cost,
  unit: p.unit,
  taxSlots: p.taxSlots,
  trackStock: p.trackStock,
  isActive: p.isActive,
  category: p.category,
  lotNumber: p.lotNumber,
  expiresAt: p.expiresAt,
  brand: p.brand,
  presentation: p.presentation,
  openPrice: p.openPrice,
  soldByWeight: p.soldByWeight,
});

function importMovement(ctx: ImportContext, productId: string, quantity: number, stockAfter: number, note: string) {
  return { businessId: ctx.businessId, productId, userId: ctx.userId, quantity, reason: IMPORT_MOVEMENT_REASON, note, stockAfter };
}

async function updateMatchedProduct(
  tx: Prisma.TransactionClient,
  p: ProductEntry,
  match: ExistingProduct,
  products: ProductMatcher,
) {
  // Sin código en el archivo se conserva el que ya tenía; tampoco se le quita a otro producto.
  const owner = p.barcode ? products.byKey.get(p.barcode) : undefined;
  const barcode = p.barcode && (!owner || owner.id === match.id) ? p.barcode : match.barcode;
  await tx.product.update({
    where: { id: match.id },
    data: { ...productFields(p), barcode, stock: p.stock },
  });
}

async function assertProductLimit(tx: Prisma.TransactionClient, ctx: ImportContext, activeBefore: number) {
  const max = getPlan(ctx.plan).limits.products;
  if (max === null) return;
  const activeAfter = await tx.product.count({
    where: { businessId: ctx.businessId, isActive: true },
  });
  if (activeAfter > max && activeAfter > activeBefore) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Con este archivo tendrías ${activeAfter.toLocaleString("es-CO")} productos activos y tu plan ${getPlan(ctx.plan).name} permite ${max.toLocaleString("es-CO")}. Sube de plan o desactiva productos en el archivo.`,
    });
  }
}

async function importProducts(
  tx: Prisma.TransactionClient,
  ctx: ImportContext,
  file: BackupFile,
) {
  const existing = await tx.product.findMany({
    where: { businessId: ctx.businessId },
  });
  const activeBefore = existing.filter((p) => p.isActive).length;
  const products = matcher(existing, (p) => p.barcode);
  const refToId = new Map<string, string>();
  const creates: Prisma.ProductCreateManyInput[] = [];
  const movements: Prisma.InventoryMovementCreateManyInput[] = [];
  let updated = 0;

  for (const p of file.products) {
    const match = products.match(p.name, p.barcode);

    if (match) {
      refToId.set(p.ref, match.id);
      await updateMatchedProduct(tx, p, match, products);
      if (p.stock !== match.stock) {
        movements.push(importMovement(ctx, match.id, p.stock - match.stock, p.stock, "Stock del archivo importado"));
      }
      updated++;
      continue;
    }

    const id = randomUUID();
    refToId.set(p.ref, id);
    // Si el código ya es de otro producto del negocio, el nuevo entra sin código (es único por negocio).
    const barcode = p.barcode && !products.byKey.has(p.barcode) ? p.barcode : null;
    creates.push({
      id,
      businessId: ctx.businessId,
      ...productFields(p),
      barcode,
      stock: p.stock,
      createdAt: p.createdAt,
    });
    if (p.stock > 0) {
      movements.push(importMovement(ctx, id, p.stock, p.stock, "Stock inicial del archivo importado"));
    }
  }

  if (creates.length) await tx.product.createMany({ data: creates });
  if (movements.length)
    await tx.inventoryMovement.createMany({ data: movements });
  await rememberBrands(tx, ctx.businessId, file.products.map((p) => p.brand));
  await assertProductLimit(tx, ctx, activeBefore);

  return { refToId, summary: { created: creates.length, updated } };
}

async function importCustomers(
  tx: Prisma.TransactionClient,
  ctx: ImportContext,
  file: BackupFile,
) {
  const existing = await tx.customer.findMany({
    where: { businessId: ctx.businessId },
  });
  const customers = matcher(existing, (c) => c.document);
  const refToId = new Map<string, string>();
  const creates: Prisma.CustomerCreateManyInput[] = [];
  let updated = 0;

  for (const c of file.customers) {
    const fields = {
      name: c.name,
      alias: c.alias,
      email: c.email,
      phone: c.phone,
      isActive: c.isActive,
    };
    const match = customers.match(c.name, c.document);
    if (match) {
      refToId.set(c.ref, match.id);
      await tx.customer.update({
        where: { id: match.id },
        data: { ...fields, document: c.document ?? match.document },
      });
      updated++;
    } else {
      const id = randomUUID();
      refToId.set(c.ref, id);
      creates.push({
        id,
        businessId: ctx.businessId,
        ...fields,
        document: c.document,
        createdAt: c.createdAt,
      });
    }
  }

  if (creates.length) await tx.customer.createMany({ data: creates });
  return { refToId, summary: { created: creates.length, updated } };
}

type CreditSale = NonNullable<BackupFile["customers"][number]["credit"]>["sales"][number];
type CreditPayment = NonNullable<BackupFile["customers"][number]["credit"]>["payments"][number];

/** Refs de fiados y abonos que ya están: el archivo salió de este negocio (mismo id) o ya se importó (llave). */
async function knownCreditRefs(
  tx: Prisma.TransactionClient,
  businessId: string,
  saleRefs: string[],
  paymentRefs: string[],
) {
  const [knownSales, knownPayments] = await Promise.all([
    tx.sale.findMany({
      where: {
        businessId,
        OR: [
          { id: { in: saleRefs } },
          { idempotencyKey: { in: saleRefs.map(importKey) } },
        ],
      },
      select: { id: true, idempotencyKey: true },
    }),
    tx.customerPayment.findMany({
      where: {
        businessId,
        OR: [
          { id: { in: paymentRefs } },
          { idempotencyKey: { in: paymentRefs.map(importKey) } },
        ],
      },
      select: { id: true, idempotencyKey: true },
    }),
  ]);
  const known = new Set(
    [...knownSales, ...knownPayments].flatMap((r) => [r.id, r.idempotencyKey]),
  );
  return (ref: string) => known.has(ref) || known.has(importKey(ref));
}

// El consecutivo de factura es del negocio original: se deja como referencia en la nota.
const creditSaleNote = (s: CreditSale) =>
  [s.note, s.invoiceNumber ? `Factura original ${s.invoiceNumber}` : null].filter(Boolean).join(" · ") || null;

function creditSaleRows(ctx: ImportContext, customerId: string, s: CreditSale, productIds: Map<string, string>) {
  const saleId = randomUUID();
  const sale: Prisma.SaleCreateManyInput = {
    id: saleId,
    businessId: ctx.businessId,
    userId: ctx.userId,
    customerId,
    saleType: s.saleType,
    status: "COMPLETED",
    paymentMethod: "CREDIT",
    subtotal: s.subtotal,
    taxAmount: s.taxAmount,
    taxLines: jsonOrUndefined(s.taxLines),
    total: s.total,
    note: creditSaleNote(s),
    idempotencyKey: importKey(s.ref),
    createdAt: s.date,
  };
  const items: Prisma.SaleItemCreateManyInput[] = s.items.map((item) => ({
    saleId,
    productId: productIds.get(item.productRef)!,
    name: item.name,
    unit: item.unit,
    price: item.price,
    quantity: item.quantity,
    subtotal: item.subtotal,
    taxLines: jsonOrUndefined(item.taxLines),
    // El stock ya viene en el archivo: estas ventas no descuentan inventario (ni lo devuelven al anularlas).
    stockDeducted: 0,
  }));
  return { sale, items };
}

const creditPaymentRow = (ctx: ImportContext, customerId: string, p: CreditPayment): Prisma.CustomerPaymentCreateManyInput => ({
  businessId: ctx.businessId,
  customerId,
  userId: ctx.userId,
  amount: p.amount,
  note: p.note,
  paymentMethod: p.method,
  idempotencyKey: importKey(p.ref),
  createdAt: p.date,
});

async function importCredit(
  tx: Prisma.TransactionClient,
  ctx: ImportContext,
  file: BackupFile,
  productIds: Map<string, string>,
  customerIds: Map<string, string>,
) {
  const withCredit = file.customers.filter((c) => c.credit);
  const isKnown = await knownCreditRefs(
    tx,
    ctx.businessId,
    withCredit.flatMap((c) => c.credit!.sales.map((s) => s.ref)),
    withCredit.flatMap((c) => c.credit!.payments.map((p) => p.ref)),
  );

  const sales: Prisma.SaleCreateManyInput[] = [];
  const items: Prisma.SaleItemCreateManyInput[] = [];
  const payments: Prisma.CustomerPaymentCreateManyInput[] = [];
  let skipped = 0;

  for (const c of withCredit) {
    const customerId = customerIds.get(c.ref)!;
    for (const s of c.credit!.sales) {
      if (isKnown(s.ref)) {
        skipped++;
        continue;
      }
      const rows = creditSaleRows(ctx, customerId, s, productIds);
      sales.push(rows.sale);
      items.push(...rows.items);
    }
    for (const p of c.credit!.payments) {
      if (isKnown(p.ref)) skipped++;
      else payments.push(creditPaymentRow(ctx, customerId, p));
    }
  }

  if (sales.length) await tx.sale.createMany({ data: sales });
  if (items.length) await tx.saleItem.createMany({ data: items });
  if (payments.length) await tx.customerPayment.createMany({ data: payments });

  return { sales: sales.length, payments: payments.length, skipped };
}

/**
 * Carga un respaldo en el negocio, todo o nada (una sola transacción):
 * productos y clientes existentes se actualizan, los demás se crean, y los
 * fiados y abonos se recrean con sus fechas sin duplicar los ya cargados.
 */
export async function importBackup(
  db: PrismaClient,
  ctx: ImportContext,
  file: BackupFile,
): Promise<BackupImportSummary> {
  return db.$transaction(
    async (tx) => {
      const products = await importProducts(tx, ctx, file);
      const customers = await importCustomers(tx, ctx, file);
      const credit = await importCredit(
        tx,
        ctx,
        file,
        products.refToId,
        customers.refToId,
      );
      const summary: BackupImportSummary = {
        products: products.summary,
        customers: customers.summary,
        credit,
      };

      await tx.auditLog.create({
        data: {
          businessId: ctx.businessId,
          userId: ctx.userId,
          action: "IMPORT_BACKUP",
          entityType: "Business",
          entityId: ctx.businessId,
          detail: {
            ...summary,
            exportedAt: file.exportedAt.toISOString(),
            source: file.business.name,
          },
        },
      });
      return summary;
    },
    { maxWait: 10_000, timeout: 120_000 },
  );
}
