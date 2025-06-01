import { UtilsService } from '@app/utils';
import { Process, Processor } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Job } from 'bull';
import { DepositDTO, WithdrawalDTO } from './dto';
import { User } from '@prisma/client';

interface TransactionJob {
  user: User;
  transactionId: number;
}

@Injectable()
@Processor('wallet-queue')
export class WalletProcessor {
  private readonly context: string = WalletProcessor.name;

  constructor(private readonly utils: UtilsService) {}

  @Process('deposit')
  async processDeposit(job: Job<Record<string, any>>): Promise<void> {
    try {
      const { user, transactionId } = job.data as TransactionJob;
      const dto = job.data.dto as DepositDTO;

      // Notify user of successful withdrawal

      // Check platform wallet balance

    } catch (error) {
      // Notify user of failed withdrawal

      throw error;
    }
  }

  @Process('withdrawal')
  async processWithdrawal(job: Job<Record<string, any>>): Promise<void> {
    try {
      const { user, transactionId } = job.data as TransactionJob;
      const dto = job.data.dto as WithdrawalDTO;
    } catch (error) {
      throw error;
    }
  }
}
