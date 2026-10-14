CREATE TABLE "payments" (
  "id" SERIAL NOT NULL,
  "customer_code" VARCHAR(300) NOT NULL,
  "customer_name" VARCHAR(255) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "payment_date" DATE NOT NULL,
  "remark" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0)
);
CREATE INDEX "payments_customer_code_payment_date_created_at_idx" ON "payments"("customer_code", "payment_date", "created_at");

CREATE TABLE "full_container_records" (
  "id" SERIAL NOT NULL,
  "order_date" DATE NOT NULL,
  "buyer" VARCHAR(255) NOT NULL,
  "item_name" VARCHAR(255) NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL,
  "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "tax_included" BOOLEAN NOT NULL DEFAULT false,
  "delivery_info" VARCHAR(255),
  "warehouse_on_arrival" BOOLEAN NOT NULL DEFAULT false,
  "remark" TEXT,
  "supplier" VARCHAR(255) NOT NULL,
  "supply_order_date" DATE,
  "supply_unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "supply_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "supply_tax_included" BOOLEAN NOT NULL DEFAULT false,
  "follow_status" VARCHAR(255),
  "delivered" BOOLEAN NOT NULL DEFAULT false,
  "delivery_date" DATE,
  "supply_remark" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "full_container_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "full_container_records_buyer_order_date_idx" ON "full_container_records"("buyer", "order_date");
