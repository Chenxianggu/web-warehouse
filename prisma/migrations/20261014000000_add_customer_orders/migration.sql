-- Reference orders allow manually entered customers. Receiver history must
-- also work before a customer has been added to the customer directory.
ALTER TABLE "receiver_history" DROP CONSTRAINT "receiver_history_customer_code_fkey";

CREATE TABLE "orders" (
    "id" SERIAL NOT NULL,
    "order_no" VARCHAR(50) NOT NULL,
    "customer_code" VARCHAR(50) NOT NULL,
    "customer_name" VARCHAR(255) NOT NULL,
    "receiver" VARCHAR(255) NOT NULL,
    "order_date" DATE NOT NULL,
    "is_shipped" BOOLEAN NOT NULL DEFAULT false,
    "deduct_futures" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_items" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "pack_count" DECIMAL(12,2) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "remark" VARCHAR(500),
    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "orders_order_no_key" ON "orders"("order_no");
CREATE INDEX "orders_order_date_created_at_idx" ON "orders"("order_date", "created_at");
CREATE INDEX "orders_customer_code_idx" ON "orders"("customer_code");
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
