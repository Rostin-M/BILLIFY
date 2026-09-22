-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "produce_module_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "open_price" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "presentation" TEXT,
ADD COLUMN     "sold_by_weight" BOOLEAN NOT NULL DEFAULT false;
