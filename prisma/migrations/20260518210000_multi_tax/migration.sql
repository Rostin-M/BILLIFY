-- AlterTable Business: replace taxName/taxRate with taxes JSON array
ALTER TABLE "Business" ADD COLUMN "taxes" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Migrate existing single tax to the new array format
UPDATE "Business"
SET "taxes" = jsonb_build_array(
  jsonb_build_object('name', "tax_name", 'rate', "tax_rate", 'enabled', true)
)
WHERE "tax_rate" > 0;

ALTER TABLE "Business" DROP COLUMN "tax_name";
ALTER TABLE "Business" DROP COLUMN "tax_rate";

-- AlterTable Sale: add taxLines for per-sale tax breakdown
ALTER TABLE "sales" ADD COLUMN "tax_lines" JSONB;
