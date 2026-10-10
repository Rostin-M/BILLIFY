-- Panel de administración de la plataforma (/admin): rol SUPERADMIN, activaciones
-- manuales de plan y bitácora propia.
--
-- OJO: PostgreSQL no deja USAR un valor de enum agregado con ADD VALUE dentro de
-- la misma transacción que lo crea. Por eso aquí los valores nuevos ('SUPERADMIN',
-- 'MANUAL') no aparecen en defaults, datos ni índices parciales, y el CHECK de
-- abajo compara el rol como texto.

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPERADMIN';

-- AlterEnum
ALTER TYPE "SubscriptionPaymentKind" ADD VALUE IF NOT EXISTS 'MANUAL';

-- CreateEnum
CREATE TYPE "SubscriptionGrantReason" AS ENUM ('MANUAL_PAYMENT', 'COURTESY', 'COMPENSATION');

-- AlterTable
ALTER TABLE "subscription_payments" ADD COLUMN     "needs_review" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "grant_reason" "SubscriptionGrantReason",
ADD COLUMN     "grant_days" INTEGER,
ADD COLUMN     "grant_note" TEXT,
ADD COLUMN     "external_reference" TEXT,
ADD COLUMN     "grant_snapshot" JSONB,
ADD COLUMN     "revoked_at" TIMESTAMP(3),
ADD COLUMN     "revoked_by_id" TEXT,
ADD COLUMN     "revoke_note" TEXT;

-- CreateTable
CREATE TABLE "platform_audit_logs" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT,
    "admin_email" TEXT NOT NULL,
    "admin_name" TEXT,
    "action" TEXT NOT NULL,
    "business_id" TEXT,
    "business_name" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "summary" TEXT NOT NULL,
    "detail" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_payments_kind_created_at_idx" ON "subscription_payments"("kind", "created_at");

-- CreateIndex
CREATE INDEX "subscription_payments_needs_review_created_at_idx" ON "subscription_payments"("needs_review", "created_at");

-- CreateIndex
CREATE INDEX "platform_audit_logs_created_at_idx" ON "platform_audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "platform_audit_logs_business_id_created_at_idx" ON "platform_audit_logs"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "platform_audit_logs_admin_id_created_at_idx" ON "platform_audit_logs"("admin_id", "created_at");

-- AddForeignKey
-- SET NULL: borrar al administrador o al negocio conserva la bitácora (quedan el
-- correo y los nombres copiados en la fila).
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Reglas que Prisma no modela ─────────────────────────────────────────────
-- Un SUPERADMIN nunca pertenece a un negocio: así ningún código de negocio puede
-- tratarlo como propietario o cajero. (Se compara como texto: ver nota de arriba.)
ALTER TABLE "User" ADD CONSTRAINT "User_superadmin_without_business_check"
  CHECK ("role"::text <> 'SUPERADMIN' OR "business_id" IS NULL);

-- ─── Datos existentes ────────────────────────────────────────────────────────
-- Pagos que el código anterior ya había dejado "para revisar" solo en el mensaje.
UPDATE "subscription_payments"
   SET "needs_review" = true
 WHERE "status_message" LIKE 'Wompi reportó anulación después de aprobado%'
    OR ("status" = 'PENDING' AND "status_message" LIKE 'Monto recibido no coincide%');

-- Tabla interna del backend: sin acceso desde las API públicas de Supabase
-- (mismo criterio que las demás migraciones).
ALTER TABLE "platform_audit_logs" ENABLE ROW LEVEL SECURITY;
