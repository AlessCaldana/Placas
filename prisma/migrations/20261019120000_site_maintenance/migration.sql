-- AlterTable
ALTER TABLE `site_settings` ADD COLUMN `maintenanceMessage` VARCHAR(300) NULL,
    ADD COLUMN `maintenanceMode` BOOLEAN NOT NULL DEFAULT false;
