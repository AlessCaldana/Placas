-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'NEEDS_REVIEW', 'CANCELLED');

-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "shippingEuCents" INTEGER,
ADD COLUMN     "shippingItalyCents" INTEGER,
ADD COLUMN     "shippingWorldCents" INTEGER;

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "stripeSessionId" VARCHAR(255),
    "stripePaymentIntent" VARCHAR(255),
    "country" CHAR(2) NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "productsCents" INTEGER NOT NULL,
    "shippingCents" INTEGER NOT NULL,
    "platformFeeCents" INTEGER NOT NULL,
    "applicationFeeCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "customerEmail" VARCHAR(254),
    "customerName" VARCHAR(200),
    "shippingAddress" JSONB,
    "reviewReason" VARCHAR(200),
    "paidAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID,
    "referenceCode" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_stripeSessionId_key" ON "orders"("stripeSessionId");

-- CreateIndex
CREATE INDEX "orders_status_createdAt_idx" ON "orders"("status", "createdAt");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_productId_idx" ON "order_items"("productId");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

