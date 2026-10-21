-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "brands" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Las marcas que ya tienen los productos pasan a la lista del negocio
-- (una por nombre sin distinguir mayúsculas, máximo 200 por negocio).
UPDATE "Business" AS b
SET "brands" = sub."brands"
FROM (
  SELECT "business_id", (array_agg("brand" ORDER BY lower("brand")))[1:200] AS "brands"
  FROM (
    SELECT DISTINCT ON ("business_id", lower(trim("brand")))
      "business_id", trim("brand") AS "brand"
    FROM "products"
    WHERE "brand" IS NOT NULL AND trim("brand") <> ''
    ORDER BY "business_id", lower(trim("brand")), "created_at"
  ) AS d
  GROUP BY "business_id"
) AS sub
WHERE b."id" = sub."business_id";
