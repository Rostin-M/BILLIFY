-- Cuadre de caja: efectivo contado al cerrar y ajustes del cierre.
-- Solo agrega columnas (nulas o con valor por defecto): los cierres anteriores quedan "sin conteo".

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "cash_blind_close" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cash_count_by_denomination" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "cash_registers" ADD COLUMN     "counted_cash" DOUBLE PRECISION,
ADD COLUMN     "counted_breakdown" JSONB;
