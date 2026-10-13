-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "billingAddress" JSONB,
ADD COLUMN     "billingBusinessName" VARCHAR(200),
ADD COLUMN     "billingTaxId" VARCHAR(64),
ADD COLUMN     "billingTaxIdType" VARCHAR(16),
ADD COLUMN     "invoiceRequested" BOOLEAN NOT NULL DEFAULT false;

