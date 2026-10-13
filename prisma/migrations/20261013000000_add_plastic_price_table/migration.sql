CREATE TABLE "plastic_price_tables" (
    "id" VARCHAR(50) NOT NULL,
    "groups" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plastic_price_tables_pkey" PRIMARY KEY ("id")
);
