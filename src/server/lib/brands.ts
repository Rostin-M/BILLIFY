import "server-only";

import type { Prisma } from "@prisma/client";

export const MAX_BRANDS = 200;
// Igual al máximo de la marca en el producto.
export const MAX_BRAND_LENGTH = 120;

const sameBrand = (a: string, b: string) =>
  a.trim().toLocaleLowerCase("es-CO") === b.trim().toLocaleLowerCase("es-CO");

/**
 * Agrega a la lista de marcas del negocio las que aún no estén (sin distinguir
 * mayúsculas) y devuelve la lista resultante. Al llegar al máximo, las nuevas
 * no se agregan. Cada agregado es un solo UPDATE condicional, así dos productos
 * guardados a la vez no se pisan la lista.
 */
export async function rememberBrands(
  db: Prisma.TransactionClient,
  businessId: string,
  candidates: ReadonlyArray<string | null | undefined>,
): Promise<string[]> {
  const unique: string[] = [];
  for (const raw of candidates) {
    const brand = raw?.trim();
    if (!brand || brand.length > MAX_BRAND_LENGTH) continue;
    if (!unique.some((b) => sameBrand(b, brand))) unique.push(brand);
  }

  for (const brand of unique) {
    await db.$executeRaw`
      UPDATE "Business"
      SET "brands" = array_append("brands", ${brand})
      WHERE "id" = ${businessId}
        AND cardinality("brands") < ${MAX_BRANDS}
        AND NOT EXISTS (SELECT 1 FROM unnest("brands") AS b WHERE lower(b) = lower(${brand}))`;
  }

  const business = await db.business.findUnique({
    where: { id: businessId },
    select: { brands: true },
  });
  return business?.brands ?? [];
}

/**
 * Registra la marca del producto y la devuelve escrita como ya estaba en la
 * lista (ej. "diana" → "Diana"), para no tener la misma marca con dos grafías.
 */
export async function rememberBrand(
  db: Prisma.TransactionClient,
  businessId: string,
  brand: string | undefined,
): Promise<string | undefined> {
  const trimmed = brand?.trim();
  if (!trimmed) return undefined;
  const brands = await rememberBrands(db, businessId, [trimmed]);
  return brands.find((b) => sameBrand(b, trimmed)) ?? trimmed;
}
