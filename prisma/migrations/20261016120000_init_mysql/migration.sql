-- CreateTable
CREATE TABLE `categories` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(140) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `parentId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `categories_slug_key`(`slug`),
    INDEX `categories_parentId_idx`(`parentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `category_translations` (
    `id` CHAR(36) NOT NULL,
    `categoryId` CHAR(36) NOT NULL,
    `locale` ENUM('IT', 'FR', 'ES', 'EN', 'NL') NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `category_translations_locale_idx`(`locale`),
    UNIQUE INDEX `category_translations_categoryId_locale_key`(`categoryId`, `locale`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` CHAR(36) NOT NULL,
    `referenceCode` VARCHAR(64) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `categoryId` CHAR(36) NOT NULL,
    `brand` VARCHAR(120) NULL,
    `model` VARCHAR(120) NULL,
    `size` VARCHAR(80) NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `quantity` INTEGER NULL,
    `viewCount` INTEGER NOT NULL DEFAULT 0,
    `showOnHero` BOOLEAN NOT NULL DEFAULT false,
    `material` VARCHAR(120) NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'UNAVAILABLE') NOT NULL DEFAULT 'DRAFT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `products_referenceCode_key`(`referenceCode`),
    INDEX `products_categoryId_status_idx`(`categoryId`, `status`),
    INDEX `products_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_images` (
    `id` CHAR(36) NOT NULL,
    `productId` CHAR(36) NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `altText` VARCHAR(200) NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `product_images_productId_position_idx`(`productId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_translations` (
    `id` CHAR(36) NOT NULL,
    `productId` CHAR(36) NOT NULL,
    `locale` ENUM('IT', 'FR', 'ES', 'EN', 'NL') NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `product_translations_locale_idx`(`locale`),
    UNIQUE INDEX `product_translations_productId_locale_key`(`productId`, `locale`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_options` (
    `id` CHAR(36) NOT NULL,
    `type` ENUM('SIZE', 'PRICE') NOT NULL,
    `value` VARCHAR(100) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `product_options_type_value_key`(`type`, `value`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `site_settings` (
    `id` VARCHAR(32) NOT NULL DEFAULT 'default',
    `name` VARCHAR(120) NOT NULL,
    `logoUrl` VARCHAR(500) NULL,
    `email` VARCHAR(254) NULL,
    `phone` VARCHAR(32) NULL,
    `whatsappNumber` VARCHAR(20) NULL,
    `shippingItalyCents` INTEGER NULL,
    `shippingEuCents` INTEGER NULL,
    `shippingWorldCents` INTEGER NULL,
    `legalName` VARCHAR(160) NULL,
    `vatNumber` VARCHAR(20) NULL,
    `taxCode` VARCHAR(20) NULL,
    `legalAddress` VARCHAR(255) NULL,
    `pecEmail` VARCHAR(254) NULL,
    `reaNumber` VARCHAR(40) NULL,
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` CHAR(36) NOT NULL,
    `orderNumber` VARCHAR(16) NULL,
    `status` ENUM('PENDING', 'PAID', 'NEEDS_REVIEW', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `stripeSessionId` VARCHAR(255) NULL,
    `stripePaymentIntent` VARCHAR(255) NULL,
    `country` CHAR(2) NOT NULL,
    `itemCount` INTEGER NOT NULL,
    `productsCents` INTEGER NOT NULL,
    `shippingCents` INTEGER NOT NULL,
    `platformFeeCents` INTEGER NOT NULL,
    `applicationFeeCents` INTEGER NOT NULL,
    `totalCents` INTEGER NOT NULL,
    `customerEmail` VARCHAR(254) NULL,
    `customerName` VARCHAR(200) NULL,
    `customerPhone` VARCHAR(32) NULL,
    `locale` VARCHAR(5) NULL,
    `shippingAddress` JSON NULL,
    `invoiceRequested` BOOLEAN NOT NULL DEFAULT false,
    `billingBusinessName` VARCHAR(200) NULL,
    `billingTaxIdType` VARCHAR(16) NULL,
    `billingTaxId` VARCHAR(64) NULL,
    `billingAddress` JSON NULL,
    `reviewReason` VARCHAR(200) NULL,
    `carrier` VARCHAR(32) NULL,
    `trackingNumber` VARCHAR(64) NULL,
    `trackingUrl` VARCHAR(500) NULL,
    `shippedAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `orders_orderNumber_key`(`orderNumber`),
    UNIQUE INDEX `orders_stripeSessionId_key`(`stripeSessionId`),
    INDEX `orders_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `orders_shippedAt_idx`(`shippedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_items` (
    `id` CHAR(36) NOT NULL,
    `orderId` CHAR(36) NOT NULL,
    `productId` CHAR(36) NULL,
    `referenceCode` VARCHAR(64) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `unitPriceCents` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,

    INDEX `order_items_orderId_idx`(`orderId`),
    INDEX `order_items_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reviews` (
    `id` CHAR(36) NOT NULL,
    `orderId` CHAR(36) NOT NULL,
    `firstName` VARCHAR(60) NOT NULL,
    `lastName` VARCHAR(60) NOT NULL,
    `rating` INTEGER NOT NULL,
    `comment` TEXT NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'HIDDEN') NOT NULL DEFAULT 'PENDING',
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `reviews_orderId_key`(`orderId`),
    INDEX `reviews_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_users` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `role` ENUM('SUPERADMIN', 'ADMIN') NOT NULL DEFAULT 'ADMIN',
    `passwordHash` TEXT NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `sessionVersion` INTEGER NOT NULL DEFAULT 0,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `admin_users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `category_translations` ADD CONSTRAINT `category_translations_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_images` ADD CONSTRAINT `product_images_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_translations` ADD CONSTRAINT `product_translations_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Seed the initial product size and price presets.
INSERT INTO `product_options` (`id`, `type`, `value`, `createdAt`) VALUES
    ('00000000-0000-4000-8000-000000000001', 'SIZE', '30 × 40 cm', UTC_TIMESTAMP(3)),
    ('00000000-0000-4000-8000-000000000002', 'SIZE', '45 × 30 cm', UTC_TIMESTAMP(3)),
    ('00000000-0000-4000-8000-000000000003', 'PRICE', '5.00', UTC_TIMESTAMP(3));
