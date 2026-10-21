-- AlterTable
ALTER TABLE `category_translations` MODIFY `locale` ENUM('IT', 'FR', 'ES', 'EN', 'NL', 'DE') NOT NULL;

-- AlterTable
ALTER TABLE `product_translations` MODIFY `locale` ENUM('IT', 'FR', 'ES', 'EN', 'NL', 'DE') NOT NULL;
