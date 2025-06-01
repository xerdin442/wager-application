/*
  Warnings:

  - You are about to drop the column `txHash` on the `transactions` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "transactions" DROP COLUMN "txHash",
ADD COLUMN     "txIdentifier" TEXT;
