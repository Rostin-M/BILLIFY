-- DropIndex
DROP INDEX "products_business_id_barcode_idx";

-- CreateIndex
CREATE UNIQUE INDEX "products_business_id_barcode_key" ON "products"("business_id", "barcode");

