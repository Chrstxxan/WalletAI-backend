-- AlterTable
ALTER TABLE `FixedExpense` ADD COLUMN `creditCardId` INTEGER NULL;

-- AlterTable
ALTER TABLE `CardInvoiceItem` ADD COLUMN `fixedExpenseId` INTEGER NULL;

-- CreateIndex
CREATE UNIQUE INDEX `CardInvoiceItem_invoiceId_fixedExpenseId_key` ON `CardInvoiceItem`(`invoiceId`, `fixedExpenseId`);

-- AddForeignKey
ALTER TABLE `FixedExpense` ADD CONSTRAINT `FixedExpense_creditCardId_fkey` FOREIGN KEY (`creditCardId`) REFERENCES `CreditCard`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CardInvoiceItem` ADD CONSTRAINT `CardInvoiceItem_fixedExpenseId_fkey` FOREIGN KEY (`fixedExpenseId`) REFERENCES `FixedExpense`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
