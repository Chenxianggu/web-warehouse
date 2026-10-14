CREATE TABLE "futures" (
  "id" SERIAL NOT NULL,
  "order_date" DATE NOT NULL,
  "customer_name" VARCHAR(255) NOT NULL DEFAULT '',
  "item_code" VARCHAR(100) NOT NULL,
  "quantity" DECIMAL(18,8) NOT NULL,
  "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "arrival_date" DATE,
  "storage_fee_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "storage_fee_days" INTEGER NOT NULL DEFAULT 0,
  "storage_fee_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "outbound_quantity" DECIMAL(18,8) NOT NULL DEFAULT 0,
  "outbound_history" JSONB NOT NULL DEFAULT '[]',
  "status" VARCHAR(20) NOT NULL DEFAULT 'unfinished',
  "remark" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "futures_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "futures_customer_name_item_code_status_idx" ON "futures"("customer_name", "item_code", "status");
CREATE INDEX "futures_order_date_id_idx" ON "futures"("order_date", "id");
