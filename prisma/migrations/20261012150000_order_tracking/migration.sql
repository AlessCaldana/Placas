-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "carrier" VARCHAR(32),
ADD COLUMN     "orderNumber" VARCHAR(16),
ADD COLUMN     "shippedAt" TIMESTAMPTZ(6),
ADD COLUMN     "trackingNumber" VARCHAR(64),
ADD COLUMN     "trackingUrl" VARCHAR(500);

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");

-- CreateIndex
CREATE INDEX "orders_shippedAt_idx" ON "orders"("shippedAt");

-- Backfill: order number for existing orders (test data). New orders get a
-- random number from the unambiguous alphabet when they are created.
UPDATE "orders" SET "orderNumber" = 'PL-' || upper(substr(md5("id"::text), 1, 6)) WHERE "orderNumber" IS NULL;
