import { TransactionStatus, TransactionType } from '@prisma/client';

export type Chain = 'base' | 'solana';

export type RpcUrlMode = 'http' | 'websocket';

export type CryptoTransactionNotification = {
  id: string;
  status: TransactionStatus;
  amount: number;
  type: TransactionType;
  chain: Chain;
};
