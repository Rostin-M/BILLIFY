-- Add TABLE to SaleType enum
ALTER TYPE "SaleType" ADD VALUE 'TABLE';

-- Add TableSessionStatus enum
CREATE TYPE "TableSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- Create table_sessions
CREATE TABLE "table_sessions" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "TableSessionStatus" NOT NULL DEFAULT 'OPEN',
  "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "table_sessions_pkey" PRIMARY KEY ("id")
);

-- Create table_guests
CREATE TABLE "table_guests" (
  "id" TEXT NOT NULL,
  "table_session_id" TEXT NOT NULL,
  "customer_id" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "document" TEXT,
  "phone" TEXT,
  "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "table_guests_pkey" PRIMARY KEY ("id")
);

-- Create table_orders
CREATE TABLE "table_orders" (
  "id" TEXT NOT NULL,
  "table_guest_id" TEXT NOT NULL,
  "table_session_id" TEXT NOT NULL,
  "subtotal" DOUBLE PRECISION NOT NULL,
  "tax_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tax_lines" JSONB,
  "total" DOUBLE PRECISION NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "table_orders_pkey" PRIMARY KEY ("id")
);

-- Create table_order_items
CREATE TABLE "table_order_items" (
  "id" TEXT NOT NULL,
  "table_order_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'und',
  "price" DOUBLE PRECISION NOT NULL,
  "quantity" INTEGER NOT NULL,
  "subtotal" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "table_order_items_pkey" PRIMARY KEY ("id")
);

-- Add table_session_id to sales
ALTER TABLE "sales" ADD COLUMN "table_session_id" TEXT;

-- Indexes
CREATE INDEX "table_sessions_business_id_idx" ON "table_sessions"("business_id");
CREATE INDEX "table_guests_table_session_id_idx" ON "table_guests"("table_session_id");
CREATE INDEX "table_orders_table_guest_id_idx" ON "table_orders"("table_guest_id");
CREATE INDEX "table_orders_table_session_id_idx" ON "table_orders"("table_session_id");
CREATE INDEX "table_order_items_table_order_id_idx" ON "table_order_items"("table_order_id");

-- FK: table_sessions
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FK: table_guests
ALTER TABLE "table_guests" ADD CONSTRAINT "table_guests_table_session_id_fkey"
  FOREIGN KEY ("table_session_id") REFERENCES "table_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "table_guests" ADD CONSTRAINT "table_guests_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FK: table_orders
ALTER TABLE "table_orders" ADD CONSTRAINT "table_orders_table_guest_id_fkey"
  FOREIGN KEY ("table_guest_id") REFERENCES "table_guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "table_orders" ADD CONSTRAINT "table_orders_table_session_id_fkey"
  FOREIGN KEY ("table_session_id") REFERENCES "table_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FK: table_order_items
ALTER TABLE "table_order_items" ADD CONSTRAINT "table_order_items_table_order_id_fkey"
  FOREIGN KEY ("table_order_id") REFERENCES "table_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "table_order_items" ADD CONSTRAINT "table_order_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FK: sales → table_sessions
ALTER TABLE "sales" ADD CONSTRAINT "sales_table_session_id_fkey"
  FOREIGN KEY ("table_session_id") REFERENCES "table_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
