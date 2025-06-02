import { UtilsService } from '@app/utils';
import { Process, Processor } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Job } from 'bull';
import { DepositDTO, WithdrawalDTO } from './dto';
import { Transaction, User } from '@prisma/client';
import { WalletService } from './wallet.service';

interface TransactionJob {
  dto: DepositDTO | WithdrawalDTO;
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
  async processDeposit(job: Job<TransactionJob>): Promise<void> {
    const { user, transaction } = job.data;
    const dto = job.data.dto as DepositDTO;
    const date: string = transaction.createdAt.toISOString();

    try {
      let depositComplete: boolean | null;
      dto.chain === 'BASE'
        ? (depositComplete = await this.walletService.processDepositOnBase(
            user.id,
            dto,
            transaction,
          ))
        : (depositComplete = await this.walletService.processDepositOnSolana(
            user.id,
            dto,
            transaction,
          ));

      if (depositComplete === true) {
        // Notify user of successful deposit
        const content = `$${dto.amount} has been deposited in your wallet. Your balance is $${user.balance}. Date: ${date}`;
        await this.utils.sendEmail(user.email, 'Deposit Successful', content);

        this.utils
          .logger()
          .info(
            `[${this.context}] Successful deposit by ${user.email}. Amount: $${dto.amount}\n`,
          );
      } else if (depositComplete === false) {
        // Notify user of failed deposit
        const content = `Your deposit of $${dto.amount} on ${date} was unsuccessful. Please try again later.`;
        await this.utils.sendEmail(user.email, 'Failed Deposit', content);

        this.utils
          .logger()
          .info(
            `[${this.context}] Failed deposit by ${user.email}. Amount: $${dto.amount}\n`,
          );
      } else if (depositComplete === null) {
        this.utils
          .logger()
          .warn(
            `[${this.context}] Deposit transaction is pending confirmation and retries have been scheduled. Tx: ${dto.txIdentifier}\n`,
          );
      }
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occured while confirming user deposit for tx: ${dto.txIdentifier}. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  @Process('withdrawal')
  async processWithdrawal(job: Job<TransactionJob>): Promise<void> {
    const { user, transaction } = job.data;
    const dto = job.data.dto as WithdrawalDTO;
    const date: string = transaction.createdAt.toISOString();

    try {
      dto.chain === 'BASE'
        ? await this.walletService.processWithdrawalOnBase(dto, transaction)
        : await this.walletService.processWithdrawalOnSolana(dto, transaction);

      // Notify user of successful withdrawal
      const content = `Your withdrawal of $${dto.amount} on ${date} was successful. Your balance is $${user.balance}`;
      await this.utils.sendEmail(user.email, 'Withdrawal Successful', content);

      this.utils
        .logger()
        .info(
          `[${this.context}] Successful withdrawal by ${user.email}. Amount: $${dto.amount}\n`,
        );

      // Check balance of native assets and stablecoins in platform wallet
      await this.walletService.checkStablecoinBalance(dto.chain);
      await this.walletService.checkNativeAssetBalance(dto.chain);
    } catch (error) {
      // Notify user of failed withdrawal
      const content = `Your withdrawal of $${dto.amount} on ${date} was unsuccessful. Please try again later.`;
      await this.utils.sendEmail(user.email, 'Failed Withdrawal', content);

      this.utils
        .logger()
        .error(
          `[${this.context}] Failed withdrawal by ${user.email}. Amount: $${dto.amount}\n`,
        );

      throw error;
    }
  }
}
