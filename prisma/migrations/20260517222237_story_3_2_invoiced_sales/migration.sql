-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('QUICK', 'INVOICED');

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "invoice_number" TEXT,
ADD COLUMN     "sale_type" "SaleType" NOT NULL DEFAULT 'QUICK';
