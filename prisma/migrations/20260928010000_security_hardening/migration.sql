-- Endurecimiento de seguridad (auditoría 2026-09-28).
-- Códigos de verificación/reset pasan a guardarse como hash: los registros vigentes
-- (de vida corta, 15 min) se descartan y el usuario solo debe pedir un código nuevo.
DELETE FROM "password_reset_tokens";
DELETE FROM "pending_registrations";

-- DropForeignKey
ALTER TABLE "Account" DROP CONSTRAINT "Account_userId_fkey";

-- DropForeignKey
ALTER TABLE "Post" DROP CONSTRAINT "Post_createdById_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_userId_fkey";

-- DropForeignKey
ALTER TABLE "email_verification_codes" DROP CONSTRAINT "email_verification_codes_user_id_fkey";

-- DropIndex
DROP INDEX "password_reset_tokens_token_key";

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "cashiers_can_edit_prices" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "failed_logins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMP(3),
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "session_version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "cash_movements" ADD COLUMN     "idempotency_key" TEXT;

-- AlterTable
ALTER TABLE "customer_payments" ADD COLUMN     "idempotency_key" TEXT;

-- AlterTable
ALTER TABLE "password_reset_tokens" DROP COLUMN "token",
ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "token_hash" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "pending_registrations" DROP COLUMN "code",
ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "code_hash" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "idempotency_key" TEXT;

-- AlterTable
ALTER TABLE "table_orders" ADD COLUMN     "idempotency_key" TEXT;

-- DropTable
DROP TABLE "Account";

-- DropTable
DROP TABLE "Post";

-- DropTable
DROP TABLE "Session";

-- DropTable
DROP TABLE "VerificationToken";

-- DropTable
DROP TABLE "email_verification_codes";

-- CreateTable
CREATE TABLE "invoice_sequences" (
    "business_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_sequences_pkey" PRIMARY KEY ("business_id","year")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "window_start" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "auth_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "email" TEXT,
    "user_id" TEXT,
    "business_id" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rate_limits_expires_at_idx" ON "rate_limits"("expires_at");

-- CreateIndex
CREATE INDEX "auth_events_email_created_at_idx" ON "auth_events"("email", "created_at");

-- CreateIndex
CREATE INDEX "auth_events_business_id_created_at_idx" ON "auth_events"("business_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "cash_movements_business_id_idempotency_key_key" ON "cash_movements"("business_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "customer_payments_business_id_idempotency_key_key" ON "customer_payments"("business_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "sales_business_id_idempotency_key_key" ON "sales"("business_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "table_orders_table_session_id_idempotency_key_key" ON "table_orders"("table_session_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "invoice_sequences" ADD CONSTRAINT "invoice_sequences_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_events" ADD CONSTRAINT "auth_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─── Consecutivo de facturas ───────────────────────────────────────────────
-- Arranca desde el número más alto emitido por negocio/año (formato F-YYYY-NNNNN).
INSERT INTO "invoice_sequences" ("business_id", "year", "last_number", "updated_at")
SELECT "business_id",
       split_part("invoice_number", '-', 2)::int,
       MAX(split_part("invoice_number", '-', 3)::int),
       CURRENT_TIMESTAMP
FROM "sales"
WHERE "invoice_number" ~ '^F-[0-9]{4}-[0-9]+$'
GROUP BY 1, 2;

-- Número de factura único por negocio. Las facturas anteriores a esta migración
-- tienen 3 duplicados históricos (bug de numeración en cobro de mesas) que no se
-- alteran por ser documentos ya emitidos; la regla aplica a las nuevas.
CREATE UNIQUE INDEX "sales_business_invoice_number_unique"
  ON "sales" ("business_id", "invoice_number")
  WHERE "invoice_number" IS NOT NULL AND "created_at" >= '2026-09-28';

-- Una sola caja abierta por usuario (evita carreras al abrir caja).
CREATE UNIQUE INDEX "cash_registers_one_open_per_user"
  ON "cash_registers" ("business_id", "user_id")
  WHERE "status" = 'OPEN';

-- ─── RLS: bloquear la Data API de Supabase ─────────────────────────────────
-- La app accede solo vía Prisma con el rol dueño de las tablas (bypass RLS).
-- Sin políticas, anon/authenticated no pueden leer ni escribir nada.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  END IF;
END $$;

-- ─── Storage: límites de tipo y tamaño en los buckets ──────────────────────
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    UPDATE storage.buckets
       SET file_size_limit = 2097152,
           allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
     WHERE id = 'business-logos';
    UPDATE storage.buckets
       SET public = false,
           file_size_limit = 4194304,
           allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
     WHERE id = 'payment-receipts';
  END IF;
END $$;
