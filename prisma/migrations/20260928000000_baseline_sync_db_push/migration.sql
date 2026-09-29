-- Sincroniza el historial de migraciones con los cambios aplicados antes con 'prisma db push'.
-- En producción ya existe: se marca como aplicada con 'prisma migrate resolve --applied'.
-- CreateEnum
CREATE TYPE "public"."InvoiceContactSource" AS ENUM ('NONE', 'OWNER', 'BUSINESS');

-- CreateEnum
CREATE TYPE "public"."InvoiceTaxDetail" AS ENUM ('SUMMARY', 'PER_ITEM');

-- AlterTable
ALTER TABLE "public"."Business" ADD COLUMN     "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "email" TEXT,
ADD COLUMN     "invoice_email_source" "public"."InvoiceContactSource" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "invoice_phone_source" "public"."InvoiceContactSource" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "invoice_tax_detail" "public"."InvoiceTaxDetail" NOT NULL DEFAULT 'SUMMARY';

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "public"."products" DROP COLUMN "tax_rate",
ADD COLUMN     "tax_slots" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "public"."sale_items" ADD COLUMN     "tax_lines" JSONB;

