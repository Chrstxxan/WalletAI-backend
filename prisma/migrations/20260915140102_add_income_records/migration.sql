-- CreateTable
CREATE TABLE `IncomeRecord` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `incomeSourceId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `amount` DOUBLE NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `isReceived` BOOLEAN NOT NULL DEFAULT false,
    `receivedAt` DATETIME(3) NULL,

    UNIQUE INDEX `IncomeRecord_incomeSourceId_month_year_key`(`incomeSourceId`, `month`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `IncomeRecord` ADD CONSTRAINT `IncomeRecord_incomeSourceId_fkey` FOREIGN KEY (`incomeSourceId`) REFERENCES `IncomeSource`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncomeRecord` ADD CONSTRAINT `IncomeRecord_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
