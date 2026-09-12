-- CreateTable
CREATE TABLE `FinancialProfile` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `monthlyIncome` DOUBLE NOT NULL DEFAULT 0,
    `fixedExpenses` DOUBLE NOT NULL DEFAULT 0,
    `workingCapital` DOUBLE NOT NULL DEFAULT 0,
    `creditTypes` JSON NULL,

    UNIQUE INDEX `FinancialProfile_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FinancialProfile` ADD CONSTRAINT `FinancialProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
