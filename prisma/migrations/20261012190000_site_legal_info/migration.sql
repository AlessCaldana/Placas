-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "legalAddress" VARCHAR(255),
ADD COLUMN     "legalName" VARCHAR(160),
ADD COLUMN     "pecEmail" VARCHAR(254),
ADD COLUMN     "reaNumber" VARCHAR(40),
ADD COLUMN     "taxCode" VARCHAR(20),
ADD COLUMN     "vatNumber" VARCHAR(20);

