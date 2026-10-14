CREATE TABLE "purchase_orders" (
  "id" SERIAL NOT NULL,
  "order_date" DATE NOT NULL,
  "item_code" VARCHAR(100) NOT NULL,
  "category" VARCHAR(100) NOT NULL DEFAULT '',
  "quantity" DECIMAL(12,3) NOT NULL,
  "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "tax_included" BOOLEAN NOT NULL DEFAULT false,
  "arrival_date" DATE,
  "remittance_in_company" VARCHAR(255),
  "remittance_out_company" VARCHAR(255),
  "remittance_date" DATE,
  "delivery_info" VARCHAR(255),
  "remark" TEXT,
  "supplier" VARCHAR(255),
  "status" VARCHAR(20) NOT NULL DEFAULT 'unfinished',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "purchase_orders_item_code_order_date_idx" ON "purchase_orders"("item_code", "order_date");
