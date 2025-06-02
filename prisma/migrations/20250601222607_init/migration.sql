-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "retries" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "balance" SET DEFAULT 0;
