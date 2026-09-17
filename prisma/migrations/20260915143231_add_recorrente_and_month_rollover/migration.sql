-- AlterTable
ALTER TABLE `FixedExpense` ADD COLUMN `month` INTEGER NULL,
    ADD COLUMN `recorrente` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `year` INTEGER NULL;

-- AlterTable
ALTER TABLE `IncomeSource` ADD COLUMN `month` INTEGER NULL,
    ADD COLUMN `recorrente` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `year` INTEGER NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `lastSeenMonth` INTEGER NULL,
    ADD COLUMN `lastSeenYear` INTEGER NULL;
