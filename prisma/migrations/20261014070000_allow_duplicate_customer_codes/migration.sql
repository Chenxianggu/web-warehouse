-- Preserve all customer master records from the original warehouse database.
-- Historical orders and receiver history intentionally refer to the shared code.
DROP INDEX "customers_code_key";
CREATE INDEX "customers_code_idx" ON "customers"("code");
