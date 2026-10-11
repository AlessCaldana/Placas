CREATE TABLE "site_settings" (
    "id" VARCHAR(32) NOT NULL DEFAULT 'default',
    "name" VARCHAR(120) NOT NULL,
    "logoUrl" VARCHAR(500),
    "email" VARCHAR(254),
    "phone" VARCHAR(32),
    "whatsappNumber" VARCHAR(20),
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);
