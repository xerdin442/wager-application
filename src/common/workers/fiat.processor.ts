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
  async processDeposit(job: Job) { }

  @Process('withdrawal')
  async processWithdrawal(job: Job) {
    const redis: RedisClientType = await initializeRedis(
      Secrets.REDIS_URL,
      'Withdrawal Details',
      Secrets.WITHDRAWAL_DETAILS_STORE_INDEX,
    );

    try {
      const { dto, email, userId } = job.data;
      
      // Verify account details
      await this.payments.verifyAccountDetails({ ...dto });
      // Transfer funds from platform fiat balance to specified user withdrawal account
      await this.payments.initiateTransfer({ ...dto }, dto.amount * 100, { userId });

      // Check if withdrawal details with account number already exists
      const existingDetails = await redis.get(email);
      if (JSON.parse(existingDetails).accountNumber === dto.accountNumber) return;

      // Store withdrawal details for 90 days
      const details: AccountDetails = { ...dto };
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
  async finalizeTransfer(job: Job) { }
}