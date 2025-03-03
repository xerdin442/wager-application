/*
  Warnings:

  - You are about to drop the `bookmarks` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `balance` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ethAddress` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `solAddress` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "WagerCategory" AS ENUM ('FOOTBALL', 'BASKETBALL', 'TENNIS', 'BOXING', 'GAMING', 'POLITICS', 'ENTERTAINMENT', 'FANTASY', 'OTHERS');

-- CreateEnum
CREATE TYPE "WagerStatus" AS ENUM ('PENDING', 'ACTIVE', 'SETTLED', 'DISPUTE');

-- DropForeignKey
ALTER TABLE "bookmarks" DROP CONSTRAINT "bookmarks_userId_fkey";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "balance" INTEGER NOT NULL,
ADD COLUMN     "ethAddress" TEXT NOT NULL,
ADD COLUMN     "solAddress" TEXT NOT NULL;

-- DropTable
DROP TABLE "bookmarks";

-- CreateTable
CREATE TABLE "wagers" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "conditions" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "WagerStatus" NOT NULL DEFAULT 'PENDING',
    "category" "WagerCategory" NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "playerOne" INTEGER NOT NULL,
    "playerTwo" INTEGER NOT NULL,
    "winner" INTEGER,

    CONSTRAINT "wagers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "category" "WagerCategory" NOT NULL,
    "disputes" INTEGER NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);
