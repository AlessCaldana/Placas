-- Additive only: products shown in the home page hero carousel.
ALTER TABLE "products"
ADD COLUMN "showOnHero" BOOLEAN NOT NULL DEFAULT false;
