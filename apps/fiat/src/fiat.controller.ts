import { Controller, HttpStatus } from '@nestjs/common';
import { FiatService } from './fiat.service';
import { MessagePattern, RpcException } from '@nestjs/microservices';
import { User } from '@prisma/client';
import { FiatAmountDTO, FiatWithdrawalDTO } from './dto';
import { UtilsService } from '@app/utils';
import { RedisClientType } from 'redis';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { AccountDetails, FiatTransactionNotification } from './types';
import { IncomingHttpHeaders } from 'http';
import crypto, { randomUUID } from 'crypto';
import { FiatGateway } from './fiat.gateway';

@Controller()
export class FiatController {
  private readonly context: string = FiatController.name;

  constructor(
    private readonly fiatService: FiatService,
    private readonly utils: UtilsService,
    private readonly config: ConfigService,
    private readonly gateway: FiatGateway,
    @InjectQueue('fiat-queue') private readonly fiatQueue: Queue,
  ) {}

  @MessagePattern('deposit')
  async processDeposit(data: {
    user: User;
    dto: FiatAmountDTO;
  }): Promise<{ checkout: string }> {
    try {
      const { user, dto } = data;

      // Get the USD eqivalent of the naira deposit
      const depositAmount = await this.fiatService.fiatConversion(dto, 'USD');
      // Generate checkout link for deposit transaction
      const checkout = await this.fiatService.initializeTransaction(
        user.email,
        dto.amount * 100,
        {
          userId: user.id,
          amount: depositAmount,
          email: user.email,
        },
      );

      this.utils
        .logger()
        .info(`[${this.context}] ${user.email} initiated fiat deposit.\n`);

      return { checkout };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while processing fiat deposit. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  @MessagePattern('withdraw')
  async processWithdrawal(data: {
    user: User;
    dto: FiatWithdrawalDTO;
    idempotencyKey?: string;
  }): Promise<{ message: string }> {
    const redis: RedisClientType = await this.utils.connectToRedis(
      this.config.getOrThrow<string>('REDIS_URL'),
      'Idempotency Keys',
      this.config.getOrThrow<number>('IDEMPOTENCY_KEYS_STORE_INDEX'),
    );

    try {
      const { user, dto, idempotencyKey } = data;

      // Check if request contains a valid idempotency key
      if (!idempotencyKey) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: '"Idempotency-Key" header is required',
        });
      }

      // Check if user has attempted similar withdrawal in the last 20 mins
      const existingWithdrawal = await redis.get(idempotencyKey);
      if (existingWithdrawal) {
        this.utils
          .logger()
          .warn(
            `[${this.context}] Duplicate withdrawal attempts by ${user.email}\n`,
          );

        return { message: 'Your withdrawal is still being processed' };
      }

      // Check if withdrawal amount exceeds user balance
      if (user.balance < dto.amount) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: `Insufficient funds. $${user.balance} is available for withdrawal`,
        });
      }

      // Check if withdrawal amount is below the allowed minimum
      if (dto.amount < 5) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: 'Minimum withdrawal amount is $5',
        });
      }

      // Verify account details
      await this.fiatService.verifyAccountDetails({
        ...dto,
      });

      // Initiate processing of the withdrawal
      await this.fiatQueue.add('initiate-withdrawal', {
        dto,
        email: user.email,
        userId: user.id,
      });

      // Store idempotency key to prevent similar withdrawal attempts within the next 20 mins
      await redis.setEx(
        idempotencyKey,
        1200,
        JSON.stringify({ status: 'pending' }),
      );

      return { message: 'Your withdrawal is being processed' };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while processing fiat withdrawal. Error: ${error.message}\n`,
        );

      throw error;
    } finally {
      await redis.disconnect();
    }
  }

  @MessagePattern('recent-withdrawal-details')
  async getRecentWithdrawalDetails(data: {
    user: User;
  }): Promise<{ details: AccountDetails[] }> {
    const redis: RedisClientType = await this.utils.connectToRedis(
      this.config.getOrThrow<string>('REDIS_URL'),
      'Withdrawal Details',
      this.config.getOrThrow<number>('WITHDRAWAL_DETAILS_STORE_INDEX'),
    );

    try {
      const existingDetails = await redis.get(data.user.email);
      if (existingDetails)
        return { details: JSON.parse(existingDetails) as AccountDetails[] };

      return { details: [] };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while retrieving recent withdrawal details. Error: ${error.message}\n`,
        );

      throw error;
    } finally {
      await redis.disconnect();
    }
  }

  @MessagePattern('supported-banks')
  async getSupportedBanks(): Promise<{ banks: string[] }> {
    try {
      return { banks: await this.fiatService.getBankNames() };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while retrieving list of supported banks. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  @MessagePattern('convert')
  async fiatConversion(data: {
    dto: FiatAmountDTO;
    targetCurrency: string;
  }): Promise<{ amount: number }> {
    try {
      const { dto, targetCurrency } = data;
      return {
        amount: await this.fiatService.fiatConversion(dto, targetCurrency),
      };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while processing fiat conversion. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  @MessagePattern('paystack-webhook')
  async paystackWebhook(data: {
    body: Record<string, any>;
    headers: IncomingHttpHeaders;
  }) {
    try {
      const { body, headers } = data;

      const hash = crypto
        .createHmac(
          'sha512',
          this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY'),
        )
        .update(JSON.stringify(body))
        .digest('hex');

      const paystackEvent = body.event as string;
      const paystackTransaction = body.data as Record<string, any>;

      if (hash === headers['x-paystack-signature']) {
        // Listen for status of transactions while processing deposits
        if (paystackEvent.includes('charge')) {
          const amount = parseInt(
            paystackTransaction.metadata.amount as string,
          );

          // Notify client of transaction status
          const notification: FiatTransactionNotification = {
            id: randomUUID(),
            status: 'PENDING',
            type: 'DEPOSIT',
            amount,
          };
          this.gateway.sendTransactionStatus(
            paystackTransaction.metadata.email as string,
            notification,
          );

          await this.fiatQueue.add('deposit', {
            notificationId: notification.id,
            paystackEvent,
            userId: parseInt(paystackTransaction.metadata.userId as string),
            amount,
          });
        }

        // Listen for status of transfers while processing withdrawals
        if (paystackEvent.includes('transfer')) {
          const metadata = paystackTransaction.recipient.metadata as Record<
            string,
            any
          >;
          const amount = parseInt(metadata.amount as string);

          // Notify client of transaction status
          const notification: FiatTransactionNotification = {
            id: randomUUID(),
            status: 'PENDING',
            type: 'WITHDRAWAL',
            amount,
          };
          this.gateway.sendTransactionStatus(
            metadata.email as string,
            notification,
          );

          await this.fiatQueue.add('complete-withdrawal', {
            notificationId: '', // **notis id
            paystackEvent,
            userId: parseInt(metadata.userId as string),
            amount,
            date: body.data.updated_at as string,
          });
        }

        return; // Send a 200 OK response to the Paystack server if all checks are complete
      }
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while listening on webhook URL. Error: ${error.message}\n`,
        );

      throw error;
    }
  }
}
