import { Process, Processor } from "@nestjs/bull";
import { Injectable } from "@nestjs/common";
import { DbService } from "@src/db/db.service";
import { MetricsService } from "@src/metrics/metrics.service";
import { FiatService } from "@src/wallet/fiat/fiat.service";
import { Job } from "bull";
import { RedisClientType } from "redis";
import { initializeRedis } from "../config/redis-conf";
import { Secrets } from "../env";
import { AccountDetails } from "../types";
import logger from "../logger";
import { sendEmail } from "../config/mail";

@Injectable()
@Processor('fiat-queue')
export class FiatProcessor {
  private readonly context: string = FiatProcessor.name;

  constructor(
    private readonly payments: FiatService,
    private readonly prisma: DbService,
    private readonly metrics: MetricsService
  ) { };

  @Process('deposit')
  async processDeposit(job: Job) {
    const { event, userId, amount } = job.data;
    const user = await this.prisma.user.findUnique({
      where: { id: userId }
    });

    try {
      if (event === 'charge.success') {
        // Update user balance
        const updatedUser = await this.prisma.user.update({
          where: { id: userId },
          data: { balance: { increment: amount } }
        });

        // Notify user of successful deposit
        const content = `${amount} has been deposited in your wallet. Your balance is ${updatedUser.balance}`
        await sendEmail(user, 'Deposit Complete', content);

        logger.info(`[${this.context}] Funds deposit by ${user.email} was successful. Amount: ${amount}\n`);
      } else if (event === 'charge.failed') {
        // Notify user of failed deposit
        const content = `Your deposit of ${amount} was unsuccessful. Please try again later.`
        await sendEmail(user, 'Failed Deposit', content);

        this.metrics.incrementCounter('unsuccessful_deposits');  // Update number of unsuccessful deposits
        logger.warn(`[${this.context}] Funds deposit by ${user.email} was unsuccessful.\n`);
      }
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while processing funds deposit. Error: ${error.message}\n`);
      throw error;
    }    
  }

  @Process('withdrawal')
  async processWithdrawal(job: Job) {
    const redis: RedisClientType = await initializeRedis(
      Secrets.REDIS_URL,
      'Withdrawal Details',
      Secrets.WITHDRAWAL_DETAILS_STORE_INDEX,
    );

    try {
      const { dto, email, userId } = job.data;

      // Deduct withdrawal amount from user balance
      await this.prisma.user.update({
        where: { id: userId },
        data: { balance: { decrement: dto.amount } }
      });

      // Verify account details
      await this.payments.verifyAccountDetails({ ...dto });
      // Convert USD to naira and transfer to specified withdrawal account
      const withdrawalAmount = await this.payments.fiatConversion({ ...dto }, 'NGN');
      await this.payments.initiateTransfer(
        { ...dto },
        withdrawalAmount * 100,
        {
          userId,
          amount: dto.amount
        }
      );

      // Check if withdrawal details with account number already exists
      const existingDetails: AccountDetails[] = JSON.parse(await redis.get(email));
      for (let detail of existingDetails) {
        if (detail.accountNumber === dto.accountNumber) return;
      };

      // Store new withdrawal details for 90 days
      const details: AccountDetails[] = [ ...existingDetails, { ...dto } ];
      await redis.setEx(email, 90 * 24 * 3600, JSON.stringify(details));

      return;
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while completing funds withdrawal. Error: ${error.message}\n`);
      throw error;
    } finally {
      await redis.disconnect();
    }
  }

  @Process('transfer')
  async finalizeTransfer(job: Job) {
    const { event, userId, amount, date } = job.data;
    const user = await this.prisma.user.findUnique({
      where: { id: userId }
    });

    try {
      if (event === 'transfer.success') {
        // Notify user of successful withdrawal
        const content = `Your withdrawal of ${amount} on ${date} was successful.`
        await sendEmail(user, 'Withdrawal Successful', content);

        logger.info(`[${this.context}] Funds withdrawal by ${user.email} was successful. Amount: ${amount}\n`);
      } else if (event === 'transfer.failed' || event === 'transfer.reversed') {
        // Update user balance
        await this.prisma.user.update({
          where: { id: userId },
          data: { balance: { increment: amount } }
        });

        // Notify user of failed withdrawal
        const content = `Your withdrawal of ${amount} on ${date} was unsuccessful. Please try again later.`
        await sendEmail(user, 'Failed Withdrawal', content);

        this.metrics.incrementCounter('unsuccessful_withdrawals');  // Update number of unsuccessful withdrawals
        logger.warn(`[${this.context}] Funds withdrawal by ${user.email} was unsuccessful.\n`);
      }
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while processing transfer of withdrawal amount. Error: ${error.message}\n`);
      throw error;
    }
  }
}