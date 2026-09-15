-- AlterTable
ALTER TABLE `fixedexpense` ADD COLUMN `month` INTEGER NULL,
    ADD COLUMN `recorrente` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `year` INTEGER NULL;

-- AlterTable
ALTER TABLE `incomesource` ADD COLUMN `month` INTEGER NULL,
    ADD COLUMN `recorrente` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `year` INTEGER NULL;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `lastSeenMonth` INTEGER NULL,
    ADD COLUMN `lastSeenYear` INTEGER NULL;
