-- Abonos de fiado en la caja: forma de pago y caja en la que entró el dinero.
-- Solo agrega columnas. Los abonos existentes quedan como efectivo sin caja (no cambian ningún cierre ya hecho).

-- AlterTable
ALTER TABLE "customer_payments" ADD COLUMN     "cash_register_id" TEXT,
ADD COLUMN     "payment_method" "PaymentMethod" NOT NULL DEFAULT 'CASH';

-- CreateIndex
CREATE INDEX "customer_payments_cash_register_id_idx" ON "customer_payments"("cash_register_id");

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_cash_register_id_fkey" FOREIGN KEY ("cash_register_id") REFERENCES "cash_registers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
