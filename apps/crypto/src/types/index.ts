import { TransactionStatus, TransactionType } from '@prisma/client';

export type Chain = 'base' | 'solana';

export type CryptoTransaction = {
  status: TransactionStatus;
  amount: number;
  type: TransactionType;
  chain: Chain;
};
