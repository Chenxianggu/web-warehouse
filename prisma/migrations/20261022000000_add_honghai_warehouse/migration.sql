-- Existing receipts and orders remain in the original warehouse.
CREATE TYPE "Warehouse" AS ENUM ('MAIN', 'HONGHAI');
ALTER TABLE "inbound_records" ADD COLUMN "warehouse" "Warehouse" NOT NULL DEFAULT 'MAIN';
ALTER TABLE "orders" ADD COLUMN "warehouse" "Warehouse" NOT NULL DEFAULT 'MAIN';
ALTER TABLE "purchase_orders" ADD COLUMN "warehouse" "Warehouse" NOT NULL DEFAULT 'MAIN';
