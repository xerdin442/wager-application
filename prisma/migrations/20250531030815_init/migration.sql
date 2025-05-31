/*
  Warnings:

  - You are about to drop the column `method` on the `transactions` table. All the data in the column will be lost.
  - You are about to drop the column `ethAddress` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `ethPrivateKey` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `solAddress` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `solPrivateKey` on the `users` table. All the data in the column will be lost.
  - Added the required column `chain` to the `transactions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `coin` to the `transactions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Chain" AS ENUM ('BASE', 'SOLANA');

-- CreateEnum
CREATE TYPE "Coin" AS ENUM ('USDC', 'USDT');

-- AlterTable
ALTER TABLE "transactions" DROP COLUMN "method",
ADD COLUMN     "chain" "Chain" NOT NULL,
ADD COLUMN     "coin" "Coin" NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "ethAddress",
DROP COLUMN "ethPrivateKey",
DROP COLUMN "solAddress",
DROP COLUMN "solPrivateKey";

-- DropEnum
DROP TYPE "TransactionMethod";
