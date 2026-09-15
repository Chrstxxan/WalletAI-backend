-- CreateTable
CREATE TABLE `FixedExpenseRecord` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fixedExpenseId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `amount` DOUBLE NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `isPaid` BOOLEAN NOT NULL DEFAULT false,
    `paidAt` DATETIME(3) NULL,

    UNIQUE INDEX `FixedExpenseRecord_fixedExpenseId_month_year_key`(`fixedExpenseId`, `month`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FixedExpenseRecord` ADD CONSTRAINT `FixedExpenseRecord_fixedExpenseId_fkey` FOREIGN KEY (`fixedExpenseId`) REFERENCES `FixedExpense`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FixedExpenseRecord` ADD CONSTRAINT `FixedExpenseRecord_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
