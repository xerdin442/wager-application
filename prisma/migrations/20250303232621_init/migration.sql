/*
  Warnings:

  - The values [FANTASY] on the enum `WagerCategory` will be removed. If these variants are still used in the database, this will fail.
  - Made the column `firstName` on table `users` required. This step will fail if there are existing NULL values in that column.
  - Made the column `lastName` on table `users` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "WagerCategory_new" AS ENUM ('FOOTBALL', 'BASKETBALL', 'TENNIS', 'BOXING', 'GAMING', 'POLITICS', 'ENTERTAINMENT', 'OTHERS');
ALTER TABLE "wagers" ALTER COLUMN "category" TYPE "WagerCategory_new" USING ("category"::text::"WagerCategory_new");
ALTER TABLE "admins" ALTER COLUMN "category" TYPE "WagerCategory_new" USING ("category"::text::"WagerCategory_new");
ALTER TYPE "WagerCategory" RENAME TO "WagerCategory_old";
ALTER TYPE "WagerCategory_new" RENAME TO "WagerCategory";
DROP TYPE "WagerCategory_old";
COMMIT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "firstName" SET NOT NULL,
ALTER COLUMN "lastName" SET NOT NULL;

-- AlterTable
ALTER TABLE "wagers" ALTER COLUMN "playerTwo" DROP NOT NULL;
