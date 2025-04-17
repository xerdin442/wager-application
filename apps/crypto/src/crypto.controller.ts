import { Controller } from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { UtilsService } from '@app/utils';
import { ConfigService } from '@nestjs/config';
import { MessagePattern, RpcException } from '@nestjs/microservices';
import { User } from '@prisma/client';
import { Chain, CryptoTransactionNotification } from './types';
import { CryptoWithdrawalDto } from './dto';
import { RedisClientType } from 'redis';
import { CryptoGateway } from './crypto.gateway';
import { randomUUID } from 'crypto';
import { selectChainExplorer } from './utils';

@Controller()
export class CryptoController {
  private readonly context: string = CryptoController.name;

  constructor(
    private readonly utils: UtilsService,
    private readonly config: ConfigService,
    private readonly cryptoService: CryptoService,
    private readonly gateway: CryptoGateway,
  ) {}

  @MessagePattern('deposit')
  getDepositAddress(data: { chain: Chain; user: User }): { address: string } {
    try {
      const { chain, user } = data;

      switch (chain) {
        case 'base':
          return { address: user.ethAddress };

        case 'solana':
          return { address: user.solAddress };

        default:
          throw new RpcException({
            status: 400,
            message:
              'Invalid value for chain query parameter. Expected "base" or "solana".',
          });
      }
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while retrieving user's deposit address. Error: ${error.message}\n`,
        );
      throw error;
    }
  }

  @MessagePattern('withdraw')
  async processWithdrawal(data: {
    chain: Chain;
    user: User;
    dto: CryptoWithdrawalDto;
    idempotencyKey?: string;
  }): Promise<{ message: string }> {
    const redis: RedisClientType = await this.utils.connectToRedis(
      this.config.getOrThrow<string>('REDIS_URL'),
      this.context,
      this.config.getOrThrow<number>('IDEMPOTENCY_KEYS_STORE_INDEX'),
    );

    try {
      const { chain, user, dto, idempotencyKey } = data;

      // Check if request contains a valid idempotency key
      if (!idempotencyKey) {
        throw new RpcException({
          status: 400,
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
          status: 400,
          message: `Insufficient funds. $${user.balance} is available for withdrawal`,
        });
      }

      // Check if withdrawal amount is below the allowed minimum
      if (dto.amount < 5) {
        throw new RpcException({
          status: 400,
          message: 'Minimum withdrawal amount is $5',
        });
      }

      // Notify client of transactions status
      const notification: CryptoTransactionNotification = {
        id: randomUUID(),
        amount: dto.amount,
        chain,
        status: 'PENDING',
        type: 'WITHDRAWAL',
      };
      this.gateway.sendTransactionStatus(user.email, notification);

      let hash: string = '';
      let signature: string = '';
      let message: string = '';
      switch (chain) {
        case 'base':
          hash = await this.cryptoService.processWithdrawalOnBase(
            user.id,
            dto,
            notification.id,
          );

          message = `Your withdrawal is complete. Verify this transaction on ${selectChainExplorer(chain, hash)}`;
          break;

        case 'solana':
          signature = await this.cryptoService.processWithdrawalOnSolana(
            user.id,
            dto,
            notification.id,
          );

          message = `Your withdrawal is complete. Verify this transaction on ${selectChainExplorer(chain, signature)}`;
          break;

        default:
          throw new RpcException({
            status: 400,
            message:
              'Invalid value for chain query parameter. Expected "base" or "solana".',
          });
      }

      // Store idempotency key to prevent similar withdrawal attempts within the next 20 mins
      await redis.setEx(
        idempotencyKey,
        1200,
        JSON.stringify({ status: 'pending' }),
      );

      return { message };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while processing withdrawal on ${data.chain}. Error: ${error.message}\n`,
        );

      throw error;
    } finally {
      await redis.disconnect();
    }
  }

  @MessagePattern('prefill')
  async prefillUserWallet(data: { chain: Chain; user: User }): Promise<void> {
    try {
      const { chain, user } = data;
      await this.cryptoService.prefillUserWallet(user, chain);

      this.utils
        .logger()
        .info(
          `[${this.context}] Wallet prefill successful. Email: ${user.email}\n`,
        );

      return;
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while prefilling user wallets with gas fees. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  @MessagePattern('monitor-deposit')
  async monitorDeposits(data: { chain: Chain; user: User }): Promise<void> {
    try {
      const { chain, user } = data;

      switch (chain) {
        case 'base':
          this.cryptoService.monitorDepositsOnBase(user.id, user.ethAddress);
          break;

        case 'solana':
          await this.cryptoService.monitorDepositsOnSolana(
            user.id,
            user.solAddress,
          );
          break;

        default:
          break;
      }
    } catch (error) {
      throw error;
    }
  }

  @MessagePattern('create-wallet')
  createUserWallet(data: { chain: Chain }): {
    address: string;
    privateKey: string;
  } {
    try {
      return this.cryptoService.createUserWallet(data.chain);
    } catch (error) {
      throw error;
    }
  }
}
