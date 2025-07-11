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
import { HelperService } from './utils/helper';
import { MetricsService } from '@app/metrics';

@Controller()
export class WalletController {
  private readonly context: string = WalletController.name;

  constructor(
    private readonly utils: UtilsService,
    private readonly config: ConfigService,
    private readonly helper: HelperService,
    private readonly metrics: MetricsService,
    private readonly walletService: WalletService,
    @InjectQueue('wallet-queue') private readonly walletQueue: Queue,
  ) {}

  @MessagePattern('wallet-metrics')
  async getMetrics(): Promise<Record<string, any>> {
    return this.metrics.getMetrics();
  }

  @MessagePattern('deposit')
  async processDeposit(data: {
    dto: DepositDTO;
    user: User;
  }): Promise<{ transaction: Transaction }> {
    try {
      const { dto, user } = data;
      const { depositor, txIdentifier, chain } = dto;

      // Validate transaction identifier
      const validTxIdentifier: boolean = this.helper.validateTxIdentifier(
        chain,
        txIdentifier,
      );
      if (!validTxIdentifier) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: 'Invalid transaction identifier',
        });
      }

      // Validate depositor address
      const isValidAddress: boolean = this.helper.validateAddress(
        chain,
        depositor,
      );
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

      return { transaction };
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
  }): Promise<{ transaction?: Transaction; message?: string }> {
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

        const { status } = JSON.parse(existingWithdrawal) as { status: string };

        if (status === 'PROCESSING') {
          return {
            message: `Your withdrawal of ${amount} is being processed`,
          };
        } else {
          return { message: `Your withdrawal of ${amount} has been processed` };
        }
      }

      // Throw if the domain name is an ENS domain
      const isENSdomain = /(?<!\.base)\.eth$/;
      if (isENSdomain.test(address)) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: 'Only Basenames and SNS domains are supported at this time',
        });
      }

      // Resolve recipient's domain name if provided
      if (address.endsWith('.base.eth') || address.endsWith('.sol')) {
        const resolvedAddress = await this.walletService.resolveDomainName(
          chain,
          address,
        );

        if (!resolvedAddress) {
          let nameService: string = '';
          chain === 'BASE'
            ? (nameService = 'Basename')
            : (nameService = 'SNS domain');

          throw new RpcException({
            status: HttpStatus.BAD_REQUEST,
            message: `Invalid or unregistered ${nameService}`,
          });
        }

        dto.address = resolvedAddress;
      }

      // Validate recipient address
      const isValidAddress: boolean = this.helper.validateAddress(
        chain,
        dto.address,
      );
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

      // Initiate pending withdrawal transaction
      const transaction = await this.walletService.initiateTransaction(
        user.id,
        dto,
      );

      // Store idempotency key to prevent similar withdrawal attempts within the next 15 mins
      await redis.setEx(
        idempotencyKey,
        900,
        JSON.stringify({ status: 'PROCESSING' }),
      );

      // Complete processing of withdrawal
      await this.walletQueue.add('withdrawal', {
        dto,
        user,
        transactionId: transaction.id,
        idempotencyKey,
      });

      return { transaction };
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
