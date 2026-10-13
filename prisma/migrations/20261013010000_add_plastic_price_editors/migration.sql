CREATE TABLE "plastic_price_editors" (
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plastic_price_editors_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "plastic_price_editors" ADD CONSTRAINT "plastic_price_editors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
