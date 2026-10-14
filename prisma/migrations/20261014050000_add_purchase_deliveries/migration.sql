CREATE TABLE "purchase_order_deliveries" (
  "id" SERIAL PRIMARY KEY,
  "order_id" INTEGER NOT NULL REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "delivery_date" DATE NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "synced" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "purchase_order_deliveries_order_id_delivery_date_idx" ON "purchase_order_deliveries"("order_id", "delivery_date");
CREATE INDEX "purchase_order_deliveries_synced_delivery_date_idx" ON "purchase_order_deliveries"("synced", "delivery_date");
