-- DropIndex
DROP INDEX "transactions_txHash_key";

-- AlterTable
ALTER TABLE "transactions" ALTER COLUMN "txHash" DROP NOT NULL;
