import "server-only";

import type { Prisma } from "@prisma/client";

import { toBogotaDateKey } from "./bogotaTime";

/** Formato visible del consecutivo: F-YYYY-NNNNN (ej. F-2026-00017). */
export function formatInvoiceNumber(year: number, sequence: number): string {
  return `F-${year}-${String(sequence).padStart(5, "0")}`;
}

/** Año calendario en hora de Bogotá (una factura emitida el 31/dic a las 10 p. m. es de ese año). */
export function bogotaYear(date: Date = new Date()): number {
  return Number(toBogotaDateKey(date).slice(0, 4));
}

/**
 * Reserva el siguiente número de factura del negocio de forma atómica.
 *
 * Debe llamarse DENTRO de la transacción que crea la venta: el UPDATE bloquea la fila
 * del consecutivo hasta el commit, así dos cobros simultáneos nunca reciben el mismo
 * número y, si la venta falla (rollback), el número tampoco se consume.
 *
 * Si el negocio aún no tiene fila para el año, se crea partiendo del número más alto
 * ya emitido ese año (por si hubo facturas antes de existir el consecutivo).
 */
export async function nextInvoiceNumber(
  tx: Prisma.TransactionClient,
  businessId: string,
): Promise<string> {
  const year = bogotaYear();

  const updated = await tx.$queryRaw<{ last_number: number }[]>`
    UPDATE "invoice_sequences"
       SET "last_number" = "last_number" + 1, "updated_at" = now()
     WHERE "business_id" = ${businessId} AND "year" = ${year}
    RETURNING "last_number"
  `;

  let sequence = updated[0]?.last_number;

  if (sequence === undefined) {
    const prefix = `F-${year}-`;
    const inserted = await tx.$queryRaw<{ last_number: number }[]>`
      INSERT INTO "invoice_sequences" ("business_id", "year", "last_number", "updated_at")
      VALUES (
        ${businessId},
        ${year},
        COALESCE((
          SELECT MAX(split_part("invoice_number", '-', 3)::int)
            FROM "sales"
           WHERE "business_id" = ${businessId}
             AND "invoice_number" ~ '^F-[0-9]{4}-[0-9]+$'
             AND starts_with("invoice_number", ${prefix})
        ), 0) + 1,
        now()
      )
      ON CONFLICT ("business_id", "year") DO UPDATE
        SET "last_number" = "invoice_sequences"."last_number" + 1, "updated_at" = now()
      RETURNING "last_number"
    `;
    sequence = inserted[0]?.last_number;
  }

  if (sequence === undefined) {
    throw new Error("No se pudo reservar el número de factura.");
  }

  return formatInvoiceNumber(year, Number(sequence));
}
