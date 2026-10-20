-- Prueba de la aceptación de los documentos legales (Ley 1581 de 2012, art. 9).
-- Solo agrega columnas opcionales y una tabla nueva: no toca datos existentes.

-- AlterTable
ALTER TABLE "pending_registrations" ADD COLUMN     "terms_accepted_at" TIMESTAMP(3),
ADD COLUMN     "terms_ip" TEXT,
ADD COLUMN     "terms_user_agent" TEXT,
ADD COLUMN     "terms_version" TEXT;

-- CreateTable
CREATE TABLE "legal_consents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "business_id" TEXT,
    "email" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "email_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "legal_consents_user_id_idx" ON "legal_consents"("user_id");

-- CreateIndex
CREATE INDEX "legal_consents_email_idx" ON "legal_consents"("email");

-- AddForeignKey
ALTER TABLE "legal_consents" ADD CONSTRAINT "legal_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
