-- Foto del comprobante de transferencia, adjunta opcionalmente a la venta
ALTER TABLE "sales" ADD COLUMN "receipt_path" TEXT;
