/*
  Warnings:

  - Made the column `retries` on table `transactions` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "transactions" ALTER COLUMN "retries" SET NOT NULL;
