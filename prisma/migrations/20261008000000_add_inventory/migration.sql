CREATE TABLE "materials" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "packs_per_ton" INTEGER NOT NULL DEFAULT 40,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inbound_records" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "pack_count" DECIMAL(12,2) NOT NULL,
    "inbound_unit_price" DECIMAL(14,4),
    "tax_included" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_type" VARCHAR(50),
    "source_id" INTEGER,
    CONSTRAINT "inbound_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "materials_code_key" ON "materials"("code");
CREATE INDEX "materials_name_idx" ON "materials"("name");
CREATE INDEX "inbound_records_code_idx" ON "inbound_records"("code");
