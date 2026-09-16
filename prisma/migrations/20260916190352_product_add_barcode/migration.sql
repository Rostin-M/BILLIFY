-- AlterTable
ALTER TABLE "products" ADD COLUMN     "barcode" TEXT;

-- CreateIndex
CREATE INDEX "products_business_id_barcode_idx" ON "products"("business_id", "barcode");
