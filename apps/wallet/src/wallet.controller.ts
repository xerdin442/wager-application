import { Controller, HttpStatus } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { UtilsService } from '@app/utils';
import { MessagePattern, RpcException } from '@nestjs/microservices';
import { Transaction, User } from '@prisma/client';
import { DepositDTO, WithdrawalDTO } from './dto';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { RedisClientType } from 'redis';
import { PublicKey } from '@solana/web3.js';
import { isAddress, isHexStrict } from 'web3-validator';

@Controller()
export class WalletController {
  private readonly context: string = WalletController.name;

  constructor(
    private readonly utils: UtilsService,
    private readonly config: ConfigService,
    private readonly walletService: WalletService,
    @InjectQueue('wallet-queue') private readonly walletQueue: Queue,
  ) {}

  @MessagePattern('deposit')
  async processDeposit(data: {
    dto: DepositDTO;
    user: User;
  }): Promise<Transaction | undefined> {
    try {
      const { dto, user } = data;
      const { depositor, txIdentifier, chain } = dto;

      // Validate transaction hash
      const validTxHash =
        isHexStrict(txIdentifier) && txIdentifier.length === 66;

      if (!validTxHash) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: 'Invalid transaction hash',
        });
      }

      // Validate depositor address
      let isValidAddress: boolean;
      chain === 'BASE'
        ? (isValidAddress = isAddress(depositor))
        : (isValidAddress = PublicKey.isOnCurve(new PublicKey(depositor)));

      if (!isValidAddress) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: 'Invalid depositor address',
        });
      }

      // Initiate a pending transaction and process confirmation of deposit
      const transaction = await this.walletService.initiateTransaction(
        user.id,
        dto,
      );
      await this.walletQueue.add('deposit', {
        dto,
        user,
        transactionId: transaction.id,
      });

      return transaction;
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while processing user deposit. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  @MessagePattern('withdrawal')
  async processWithdrawal(data: {
    user: User;
    dto: WithdrawalDTO;
    idempotencyKey?: string;
  }): Promise<Transaction | { message: string } | undefined> {
    // Initialize Redis connection
    const redis: RedisClientType = await this.utils.connectToRedis(
      this.config.getOrThrow<string>('REDIS_URL'),
      'Idempotency Keys',
      this.config.getOrThrow<number>('IDEMPOTENCY_KEYS_STORE_INDEX'),
    );

    try {
      const { user, dto, idempotencyKey } = data;
      const { address, chain, amount } = dto;

      // Check if request contains a valid idempotency key
      if (!idempotencyKey) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: '"Idempotency-Key" header is required',
        });
      }

      // Check if user has attempted similar withdrawal within the last 15 mins
      const existingWithdrawal = await redis.get(idempotencyKey);
      if (existingWithdrawal) {
        this.utils
          .logger()
          .warn(
            `[${this.context}] Duplicate withdrawal attempts by ${user.email}\n`,
          );

        return { message: 'Your withdrawal is still being processed' };
      }

      // Resolve recipient's domain name if provided
      if (address.endsWith('.eth') || address.endsWith('.sol')) {
        const resolvedAddress = await this.walletService.resolveDomainName(
          chain,
          address,
        );

        if (!resolvedAddress) {
          let nameService: string = '';
          chain === 'BASE' ? (nameService = 'ENS') : (nameService = 'SNS');

          throw new RpcException({
            status: HttpStatus.BAD_REQUEST,
            message: `Invalid or unregistered ${nameService} domain`,
          });
        }

        dto.address = resolvedAddress;
      }

      // Validate recipient address
      let isValidAddress: boolean;
      chain === 'BASE'
        ? (isValidAddress = isAddress(dto.address))
        : (isValidAddress = PublicKey.isOnCurve(new PublicKey(dto.address)));

      if (!isValidAddress) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: 'Invalid recipient address',
        });
      }

      // Check if withdrawal amount exceeds user balance
      if (user.balance < amount) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: `Insufficient funds. Your balance is $${user.balance}`,
        });
      }

      // Check if withdrawal amount is below the allowed minimum
      if (amount < 5) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: 'Minimum withdrawal amount is $5',
        });
      }

      // Initiate a pending transaction and complete processing of withdrawal
      const transaction = await this.walletService.initiateTransaction(
        user.id,
        dto,
      );
      await this.walletQueue.add('withdrawal', {
        dto,
        user,
        transactionId: transaction.id,
      });

      // Store idempotency key to prevent similar withdrawal attempts within the next 15 mins
      await redis.setEx(
        idempotencyKey,
        900,
        JSON.stringify({ status: 'processing' }),
      );

      return transaction;
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while processing user withdrawal. Error: ${error.message}\n`,
        );

      throw error;
    }
  }
}
