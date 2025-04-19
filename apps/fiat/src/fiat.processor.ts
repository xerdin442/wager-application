import { DbService } from '@app/db';
import { MetricsService } from '@app/metrics';
import { Processor, Process } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Job } from 'bull';
import { RedisClientType } from 'redis';
import { FiatService } from './fiat.service';
import { AccountDetails, FiatTransactionNotification } from './types';
import { UtilsService } from '@app/utils';
import { ConfigService } from '@nestjs/config';
import { FiatWithdrawalDto } from './dto';

@Injectable()
@Processor('fiat-queue')
export class FiatProcessor {
  private readonly context: string = FiatProcessor.name;

  private readonly metricLabels: string[] = ['fiat'];

  constructor(
    private readonly fiatService: FiatService,
    private readonly prisma: DbService,
    private readonly metrics: MetricsService,
    private readonly utils: UtilsService,
    private readonly config: ConfigService,
  ) {}

  @Process('deposit')
  async processDeposit(job: Job<Record<string, any>>) {
    const { notificationId, paystackEvent: event, userId, amount } = job.data;

    const notification: FiatTransactionNotification = {
      id: notificationId as string,
      amount: amount as number,
      status: 'SUCCESS',
      type: 'DEPOSIT',
    };
    console.log(notification);

    try {
      if (event === 'charge.success') {
        // Update user balance and store transaction details
        const user = await this.fiatService.updateDbAfterTransaction(
          userId as number,
          amount as number,
          'SUCCESS',
          'DEPOSIT',
        );

        // Update deposit metrics
        this.metrics.incrementCounter('successful_deposits', this.metricLabels);
        this.metrics.incrementCounter(
          'deposit_volume',
          this.metricLabels,
          amount as number,
        );

        // **Notify client of transaction status
        // this.gateway.sendTransactionStatus(user.email, notification);

        // Notify user of successful deposit
        const content = `${amount}USDC has been deposited in your wallet. Your balance is ${user.balance}USDC`;
        await this.utils.sendEmail(user, 'Deposit Complete', content);

        this.utils
          .logger()
          .info(
            `[${this.context}] Fiat deposit by ${user.email} was successful. Amount: ${amount}USDC\n`,
          );

        return;
      } else if (event === 'charge.failed') {
        // Store failed transaction details
        const user = await this.fiatService.updateDbAfterTransaction(
          userId as number,
          amount as number,
          'FAILED',
          'DEPOSIT',
        );

        // Update deposit metrics
        this.metrics.incrementCounter('failed_deposits', this.metricLabels);

        // **Notify client of transaction status
        // this.gateway.sendTransactionStatus(email, {
        //   ...notification,
        //   status: 'FAILED',
        // });

        // Notify user of failed deposit
        const content = `Your deposit of ${amount}USDC was unsuccessful. Please try again later.`;
        await this.utils.sendEmail(user, 'Failed Deposit', content);

        this.utils
          .logger()
          .warn(
            `[${this.context}] Fiat deposit by ${user.email} was unsuccessful.\n`,
          );

        return;
      }
    } catch (error) {
      throw error;
    }
  }

  @Process('initiate-withdrawal')
  async initiateWithdrawal(job: Job<Record<string, any>>) {
    const redis: RedisClientType = await this.utils.connectToRedis(
      this.config.getOrThrow<string>('REDIS_URL'),
      'Withdrawal Details',
      this.config.getOrThrow<number>('WITHDRAWAL_DETAILS_STORE_INDEX'),
    );

    try {
      const { email, userId } = job.data;
      const dto = job.data.dto as FiatWithdrawalDto;

      // Deduct withdrawal amount from user balance
      await this.prisma.user.update({
        where: { id: userId as number },
        data: { balance: { decrement: dto.amount } },
      });

      // Verify account details
      await this.fiatService.verifyAccountDetails({
        ...dto,
      });
      // Convert USD to naira and transfer to specified withdrawal account
      const withdrawalAmount = await this.fiatService.fiatConversion(
        { ...dto },
        'NGN',
      );
      await this.fiatService.initiateTransfer(
        { ...dto },
        withdrawalAmount * 100,
        {
          userId: userId as number,
          amount: dto.amount,
        },
      );

      // Check if withdrawal details with account number already exists
      const data = await redis.get(email as string);
      const existingDetails = JSON.parse(data as string) as AccountDetails[];
      for (const detail of existingDetails) {
        if (detail.accountNumber === dto.accountNumber) return;
      }

      // Store new withdrawal details for 90 days
      const details: AccountDetails[] = [...existingDetails, { ...dto }];
      await redis.setEx(
        email as string,
        90 * 24 * 3600,
        JSON.stringify(details),
      );

      return;
    } catch (error) {
      throw error;
    } finally {
      await redis.disconnect();
    }
  }

  @Process('complete-withdrawal')
  async completeWithdrawal(job: Job<Record<string, any>>) {
    const {
      notificationId,
      paystackEvent: event,
      userId,
      amount,
      date,
    } = job.data;

    const notification: FiatTransactionNotification = {
      id: notificationId as string,
      amount: amount as number,
      status: 'SUCCESS',
      type: 'WITHDRAWAL',
    };
    console.log(notification);

    try {
      if (event === 'transfer.success') {
        // Update user balance and store transaction details
        const user = await this.fiatService.updateDbAfterTransaction(
          userId as number,
          amount as number,
          'SUCCESS',
          'WITHDRAWAL',
        );

        // Update withdrawal metrics
        this.metrics.incrementCounter(
          'successful_withdrawals',
          this.metricLabels,
        );
        this.metrics.incrementCounter(
          'withdrawal_volume',
          this.metricLabels,
          amount as number,
        );

        // **Notify client of transaction status
        // this.gateway.sendTransactionStatus(user.email, notification);

        // Notify user of successful withdrawal
        const content = `Your withdrawal of ${amount}USDC on ${date} was successful. Your balance is ${user.balance}USDC`;
        await this.utils.sendEmail(user, 'Withdrawal Successful', content);

        this.utils
          .logger()
          .info(
            `[${this.context}] Fiat withdrawal by ${user.email} was successful. Amount: ${amount}USDC\n`,
          );
      } else if (event === 'transfer.failed' || event === 'transfer.reversed') {
        // Store failed transaction details
        const user = await this.fiatService.updateDbAfterTransaction(
          userId as number,
          amount as number,
          'FAILED',
          'WITHDRAWAL',
        );

        // Update withdrawal metrics
        this.metrics.incrementCounter('failed_withdrawals', this.metricLabels);

        // **Notify client of transaction status
        // this.gateway.sendTransactionStatus(user.email, {
        //   ...notification,
        //   status: 'FAILED',
        // });

        // Notify user of failed withdrawal
        const content = `Your withdrawal of ${amount}USDC on ${date} was unsuccessful. Please try again later.`;
        await this.utils.sendEmail(user, 'Failed Withdrawal', content);

        this.utils
          .logger()
          .warn(
            `[${this.context}] Fiat withdrawal by ${user.email} was unsuccessful.\n`,
          );
      }
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while processing transfer of withdrawal amount. Error: ${error.message}\n`,
        );
      throw error;
    }
  }
}
