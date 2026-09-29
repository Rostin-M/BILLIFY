-- Cada venta queda ligada a la caja donde entró el dinero, y cada ítem guarda
-- cuántas unidades se descontaron realmente del inventario.

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "stock_deducted" INTEGER;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "cash_register_id" TEXT;

-- AlterTable
ALTER TABLE "table_order_items" ADD COLUMN     "stock_deducted" INTEGER;

-- CreateIndex
CREATE INDEX "sales_cash_register_id_idx" ON "sales"("cash_register_id");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cash_register_id_fkey" FOREIGN KEY ("cash_register_id") REFERENCES "cash_registers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Relleno de ventas existentes ──────────────────────────────────────────
-- 1) La caja del mismo usuario que estaba abierta cuando se hizo la venta.
UPDATE "sales" s
   SET "cash_register_id" = cr."id"
  FROM "cash_registers" cr
 WHERE s."cash_register_id" IS NULL
   AND cr."business_id" = s."business_id"
   AND cr."user_id" = s."user_id"
   AND cr."opened_at" <= s."created_at"
   AND (cr."closed_at" IS NULL OR cr."closed_at" >= s."created_at");

-- 2) Si el vendedor no tenía caja propia, la única caja del negocio abierta en ese momento.
UPDATE "sales" s
   SET "cash_register_id" = (
     SELECT cr."id" FROM "cash_registers" cr
      WHERE cr."business_id" = s."business_id"
        AND cr."opened_at" <= s."created_at"
        AND (cr."closed_at" IS NULL OR cr."closed_at" >= s."created_at")
   )
 WHERE s."cash_register_id" IS NULL
   AND (
     SELECT count(*) FROM "cash_registers" cr
      WHERE cr."business_id" = s."business_id"
        AND cr."opened_at" <= s."created_at"
        AND (cr."closed_at" IS NULL OR cr."closed_at" >= s."created_at")
   ) = 1;
