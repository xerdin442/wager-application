import { TransactionStatus, TransactionType } from '@prisma/client';

export type BankData = {
  id: number;
  name: string;
  slug: string;
  code: string;
  longcode: string;
  gateway: string | null;
  pay_with_bank: boolean;
  supports_transfer: boolean;
  active: boolean;
  country: string;
  currency: string;
  type: string;
  is_deleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AccountDetails = {
  accountName: string;
  accountNumber: string;
  bankName: string;
};

export type FiatTransactionNotification = {
  id: string;
  status: TransactionStatus;
  amount: number;
  type: TransactionType;
};
