import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { AuthGuard } from '@nestjs/passport';
import { CryptoWithdrawalDto } from './dto';
import { GetUser } from '@src/custom/decorators';
import { User } from '@prisma/client';
import logger from '@src/common/logger';
import { MetricsService } from '@src/metrics/metrics.service';
import { initializeRedis } from '@src/common/config/redis-conf';
import { Secrets } from '@src/common/env';
import { RedisClientType } from 'redis';

@Controller('wallet/crypto')
@UseGuards(AuthGuard('jwt'))
export class CryptoController {
  private readonly context: string = CryptoController.name;

  constructor(
    private readonly cryptoService: CryptoService,
    private readonly metrics: MetricsService
  ) { };

  @Get('deposit/address')
  async getDepositAddress(
    @GetUser() user: User,
    @Query('chain') chain: string
  ): Promise<{ address: string }> {
    try {
      switch (chain) {
        case 'base':
          return { address: user.ethAddress };

        case 'solana':
          return { address: user.solAddress };

        default:
          throw new BadRequestException('Invalid value for chain query parameter. Expected "base" or "solana".');
      }
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while retrieving user's deposit address. Error: ${error.message}\n`);
      throw error;
    }
  }

  @Post('withdraw')
  @HttpCode(HttpStatus.OK)
  async processWithdrawal(
    @GetUser() user: User,
    @Query('chain') chain: string,
    @Body() dto: CryptoWithdrawalDto,
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
      let message: string;

      // Check if user has attempted similar withdrawal in the last 20 mins
      const existingWithdrawal = await redis.get(idempotencyKey);
      if (existingWithdrawal) {
        logger.warn(`[${this.context}] Duplicate withdrawal attempts by ${user.email}\n`);
        return { message: 'Your withdrawal is still being processed' }
      };

      // Check if withdrawal amount exceeds user balance
      if (user.balance < dto.amount) {
        throw new BadRequestException(`Insufficient funds. $${user.balance} is available for withdrawal`)
      };

      // Check if withdrawal amount is below the allowed minimum
      if (dto.amount < 5) {
        throw new BadRequestException('Minimum withdrawal amount is $5')
      };

      switch (chain) {
        case 'base':
          const hash = await this.cryptoService.processWithdrawalOnBase(user.id, dto);
          message = `Your withdrawal is complete. Verify this transaction with ${hash}`;
          break;

        case 'solana':
          const signature = await this.cryptoService.processWithdrawalOnSolana(user.id, dto);
          message = `Your withdrawal is complete. Verify this transaction with ${signature}`;
          break;

        default:
          throw new BadRequestException('Invalid value for chain query parameter. Expected "base" or "solana".');
      };

      // Store idempotency key to prevent similar withdrawal attempts within the next 20 mins
      await redis.setEx(idempotencyKey, 1200, JSON.stringify({ status: 'processing' }));

      return { message };
    } catch (error) {
      this.metrics.incrementCounter('unsuccessful_crypto_withdrawals');  // Update number of unsuccessful crypto withdrawals
      logger.error(`[${this.context}] An error occurred while processing crypto withdrawal. Error: ${error.message}\n`);

      throw error;
    } finally {
      await redis.disconnect();
    }
  }
}
