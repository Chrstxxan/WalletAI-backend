/*
  Warnings:

  - You are about to drop the column `fixedExpenses` on the `FinancialProfile` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `FinancialProfile` DROP COLUMN `fixedExpenses`;

-- CreateTable
CREATE TABLE `FixedExpense` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FixedExpense` ADD CONSTRAINT `FixedExpense_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
