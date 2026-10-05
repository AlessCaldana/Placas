-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "CatalogLocale" AS ENUM ('IT', 'FR', 'ES', 'EN');

-- CreateEnum
CREATE TYPE "ProductOptionType" AS ENUM ('SIZE', 'PRICE');

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "parentId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_translations" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "locale" "CatalogLocale" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "searchTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "referenceCode" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "categoryId" UUID NOT NULL,
    "brand" VARCHAR(120),
    "model" VARCHAR(120),
    "size" VARCHAR(80) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER,
    "material" VARCHAR(120),
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_translations" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "locale" "CatalogLocale" NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "searchTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_options" (
    "id" UUID NOT NULL,
    "type" "ProductOptionType" NOT NULL,
    "value" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");

-- CreateIndex
CREATE INDEX "category_translations_locale_idx" ON "category_translations"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "category_translations_categoryId_locale_key" ON "category_translations"("categoryId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "products_referenceCode_key" ON "products"("referenceCode");

-- CreateIndex
CREATE INDEX "products_categoryId_status_idx" ON "products"("categoryId", "status");

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products"("name");

-- CreateIndex
CREATE INDEX "product_translations_locale_idx" ON "product_translations"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "product_translations_productId_locale_key" ON "product_translations"("productId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "product_options_type_value_key" ON "product_options"("type", "value");

-- Seed the initial product size and price presets.
INSERT INTO "product_options" ("id", "type", "value") VALUES
    ('00000000-0000-4000-8000-000000000001', 'SIZE', '30 × 40 cm'),
    ('00000000-0000-4000-8000-000000000002', 'SIZE', '45 × 30 cm'),
    ('00000000-0000-4000-8000-000000000003', 'PRICE', '5.00');

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_translations" ADD CONSTRAINT "category_translations_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_translations" ADD CONSTRAINT "product_translations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
