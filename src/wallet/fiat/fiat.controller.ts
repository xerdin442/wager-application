import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '@src/custom/decorators';
import { NairaConversionDto, FiatDepositDto, FiatWithdrawalDto } from './dto';
import { User } from '@prisma/client';
import { initializeRedis } from '@src/common/config/redis-conf';
import { Secrets } from '@src/common/env';
import { RedisClientType } from 'redis';
import { FiatService } from './fiat.service';
import logger from '@src/common/logger';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import crypto from 'crypto';
import { Request } from 'express';
import { AccountDetails } from '@src/common/types';

@Controller('wallet/fiat')
export class FiatController {
  private readonly context: string = FiatController.name;

  constructor(
    private readonly fiatService: FiatService,
    @InjectQueue('fiat-queue') private readonly fiatQueue: Queue
  ) { };

  @Post('deposit')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  async processDeposit(
    @GetUser() user: User,
    @Body() dto: FiatDepositDto
  ): Promise<{ checkout: string }> {
    try {
      const checkout = await this.fiatService.initializeTransaction(
        user.email,
        dto.amount * 100,
        {
          userId: user.id,
          amount: dto.amount
        }
      );

      logger.info(`[${this.context}] ${user.email} initiated funds deposit.\n`);
      return { checkout };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while processing funds deposit. Error: ${error.message}\n`);
      throw error;
    }
  }

  @Post('withdraw')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  async processWithdrawal(
    @GetUser() user: User,
    @Body() dto: FiatWithdrawalDto,
    @Headers('Idempotency-Key') idempotencyKey: string
  ): Promise<{ message: string }> {
    // Check if request contains a valid idempotency key
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    };

    const redis: RedisClientType = await initializeRedis(
      Secrets.REDIS_URL,
      'Idempotency Keys',
      Secrets.IDEMPOTENCY_KEYS_STORE_INDEX
    );

    try {
      // Check if user has attempted similar withdrawal in the last 20 mins
      const existingWithdrawal = await redis.get(idempotencyKey);
      if (existingWithdrawal) {
        logger.info(`[${this.context}] Duplicate withdrawal attempts by ${user.email}\n`);
        return { message: 'Your withdrawal is still being processed' }
      };

      // Check if withdrawal amount exceeds user balance
      if (user.balance < dto.amount) {
        throw new BadRequestException(`Insufficient funds. $${user.balance} is available for withdrawal`)
      };

      await this.fiatQueue.add('withdrawal', {
        dto,
        email: user.email,
        userId: user.id
      });

      // Store idempotency key to prevent similar withdrawal attempts within the next 20 mins
      await redis.setEx(idempotencyKey, 1200, JSON.stringify({ status: 'processing' }));

      return { message: 'Your withdrawal is being processed' };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while processing funds withdrawal. Error: ${error.message}\n`);
      throw error;
    } finally {
      await redis.disconnect();
    }
  }

  @Get('withdraw/recent')
  @UseGuards(AuthGuard('jwt'))
  async getRecentWithdrawalDetails(@GetUser() user: User)
    : Promise<{ message: string } | { details: AccountDetails[] }> {
    const redis: RedisClientType = await initializeRedis(
      Secrets.REDIS_URL,
      'Withdrawal Details',
      Secrets.WITHDRAWAL_DETAILS_STORE_INDEX,
    );

    try {
      const existingDetails = await redis.get(user.email);
      if (existingDetails) return { details: JSON.parse(existingDetails) };

      return { message: 'No recent withdrawals' };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while retrieving recent withdrawal details. Error: ${error.message}\n`);
      throw error;
    } finally {
      await redis.disconnect();
    }
  }

  @Get('withdraw/banks')
  @UseGuards(AuthGuard('jwt'))
  async getSupportedBanks(): Promise<{ banks: string[] }> {
    try {
      return { banks: await this.fiatService.getBankNames() };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while retrieving list of supported banks. Error: ${error.message}\n`);
      throw error;
    }
  }

  @Post('convert')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  async convertToNaira(
    @GetUser() user: User,
    @Body() dto: NairaConversionDto
  ) {
    try {
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while converting user balance to naira. Error: ${error.message}\n`);
      throw error;
    }
  }

  @Post('callback')
  @HttpCode(HttpStatus.OK)
  async paystackCallback(@Req() req: Request) {
    try {
      const hash = crypto.createHmac('sha512', Secrets.PAYSTACK_SECRET_KEY)
        .update(JSON.stringify(req.body)).digest('hex');

      const { event, data } = req.body;

      if (hash === req.headers['x-paystack-signature']) {
        // Listen for status of transactions while processing deposits
        if (event.includes('charge')) {
          await this.fiatQueue.add('deposit', {
            event,
            userId: data.metadata.userId,
            amount: data.metadata.amount
          });
        };

        // Listen for status of transfers while processing withdrawals
        if (event.includes('transfer')) {
          await this.fiatQueue.add('transfer', {
            event,
            transferCode: data.transfer_code,
            metadata: data.recipient.metadata,
            recipientCode: data.recipient.recipient_code,
            amount: data.amount,
            date: data.updated_at
          });
        };

        return; // Send a 200 OK response to the Paystack server if all checks are complete
      };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while listening on webhook URL. Error: ${error.message}\n`);
      throw error;
    }
  }
}
