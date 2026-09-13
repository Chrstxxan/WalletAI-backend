/*
  Warnings:

  - You are about to drop the `cardpurchase` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `cardpurchase` DROP FOREIGN KEY `CardPurchase_cardId_fkey`;

-- AlterTable
ALTER TABLE `creditcard` ALTER COLUMN `limit` DROP DEFAULT;

-- DropTable
DROP TABLE `cardpurchase`;

-- CreateTable
CREATE TABLE `CardInvoice` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cardId` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,

    UNIQUE INDEX `CardInvoice_cardId_month_year_key`(`cardId`, `month`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CardInvoiceItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoiceId` INTEGER NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `installmentAmount` DOUBLE NOT NULL,
    `currentInstallment` INTEGER NOT NULL,
    `totalInstallments` INTEGER NOT NULL,
    `category` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CardInvoice` ADD CONSTRAINT `CardInvoice_cardId_fkey` FOREIGN KEY (`cardId`) REFERENCES `CreditCard`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CardInvoiceItem` ADD CONSTRAINT `CardInvoiceItem_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `CardInvoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
