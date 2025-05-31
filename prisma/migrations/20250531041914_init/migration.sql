/*
  Warnings:

  - You are about to drop the column `coin` on the `transactions` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "transactions" DROP COLUMN "coin";

-- DropEnum
DROP TYPE "Coin";
