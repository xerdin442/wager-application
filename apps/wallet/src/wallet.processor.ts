import { UtilsService } from '@app/utils';
import { Process, Processor } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Job } from 'bull';
import { DepositDTO, WithdrawalDTO } from './dto';
import { Transaction, User } from '@prisma/client';
import { WalletService } from './wallet.service';

interface TransactionJob {
  user: User;
  transaction: Transaction;
}

@Injectable()
@Processor('wallet-queue')
export class WalletProcessor {
  private readonly context: string = WalletProcessor.name;

  constructor(
    private readonly utils: UtilsService,
    private readonly walletService: WalletService,
  ) {}

  @Process('deposit')
  async processDeposit(job: Job<Record<string, any>>): Promise<void> {
    const { user, transaction } = job.data as TransactionJob;
    const dto = job.data.dto as DepositDTO;
    const date: string = transaction.createdAt.toISOString();

    try {
      // Notify user of successful deposit
    } catch (error) {
      // Notify user of failed deposit

      throw error;
    }
  }

  @Process('withdrawal')
  async processWithdrawal(job: Job<Record<string, any>>): Promise<void> {
    const { user, transaction } = job.data as TransactionJob;
    const dto = job.data.dto as WithdrawalDTO;
    const date: string = transaction.createdAt.toISOString();

    try {
      dto.chain === 'BASE'
        ? await this.walletService.processWithdrawalOnBase(dto, transaction)
        : await this.walletService.processWithdrawalOnSolana(dto, transaction);

      // Notify user of successful withdrawal
      const subject = 'Withdrawal Successful';
      const content = `Your withdrawal of $${dto.amount} on ${date} was successful. Your balance is $${user.balance}`;
      await this.utils.sendEmail(user.email, subject, content);

      this.utils
        .logger()
        .info(
          `[${this.context}] Successful withdrawal by ${user.email}. Amount: $${dto.amount}\n`,
        );

      // Check platform wallet balance
    } catch (error) {
      // Notify user of failed withdrawal
      const subject = 'Failed Withdrawal';
      const content = `Your withdrawal of $${dto.amount} on ${date} was unsuccessful. Please try again later.`;
      await this.utils.sendEmail(user.email, subject, content);

      this.utils
        .logger()
        .error(
          `[${this.context}] Failed withdrawal by ${user.email}. Amount: $${dto.amount}\n`,
        );

      throw error;
    }
  }
}
