CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "receiver_history" (
    "id" SERIAL NOT NULL,
    "customer_code" VARCHAR(50) NOT NULL,
    "receiver" VARCHAR(255) NOT NULL,
    CONSTRAINT "receiver_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customers_code_key" ON "customers"("code");
CREATE INDEX "customers_full_name_idx" ON "customers"("full_name");
CREATE UNIQUE INDEX "receiver_history_customer_code_receiver_key" ON "receiver_history"("customer_code", "receiver");
CREATE INDEX "receiver_history_customer_code_idx" ON "receiver_history"("customer_code");

ALTER TABLE "receiver_history" ADD CONSTRAINT "receiver_history_customer_code_fkey"
  FOREIGN KEY ("customer_code") REFERENCES "customers"("code") ON DELETE CASCADE ON UPDATE CASCADE;
