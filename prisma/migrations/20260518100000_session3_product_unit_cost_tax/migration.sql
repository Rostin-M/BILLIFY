-- AlterTable products
ALTER TABLE "products" ADD COLUMN "cost" DOUBLE PRECISION;
ALTER TABLE "products" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'und';
ALTER TABLE "products" ADD COLUMN "tax_rate" DOUBLE PRECISION;

-- AlterTable sale_items
ALTER TABLE "sale_items" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'und';

-- AlterTable Business
ALTER TABLE "Business" ADD COLUMN "auto_tax" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Business" ADD COLUMN "max_cash_registers" INTEGER NOT NULL DEFAULT 1;
