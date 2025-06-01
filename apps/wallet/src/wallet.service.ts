import { HttpStatus, Injectable } from '@nestjs/common';
import { WalletGateway } from './wallet.gateway';
import { DbService } from '@app/db';
import { MetricsService } from '@app/metrics';
import { UtilsService } from '@app/utils';
import { ConfigService } from '@nestjs/config';
import Web3, { Transaction as EthTransaction } from 'web3';
import { selectRpcUrl, selectUSDCTokenAddress } from './utils/helper';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { RpcException } from '@nestjs/microservices';
import {
  Chain,
  Transaction,
  TransactionStatus,
  TransactionType,
  User,
} from '@prisma/client';
import { hdkey } from '@ethereumjs/wallet';
import { EthereumHDKey } from '@ethereumjs/wallet/dist/cjs/hdkey';
import { getDomainKeySync, NameRegistryState } from '@bonfida/spl-name-service';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { isAddress } from 'web3-validator';
import { DepositDTO, WithdrawalDTO } from './dto';
import { contractAbi } from './utils/abi';

@Injectable()
export class WalletService {
  private readonly context: string = WalletService.name;

  // Connect to RPC endpoints
  private readonly web3 = new Web3(
    new Web3.providers.HttpProvider(selectRpcUrl('BASE')),
  );
  private readonly connection = new Connection(
    selectRpcUrl('SOLANA'),
    'confirmed',
  );

  private readonly BASE_USDC_TOKEN_ADDRESS: string =
    selectUSDCTokenAddress('BASE');
  private readonly SOLANA_USDC_MINT_ADDRESS: string =
    selectUSDCTokenAddress('SOLANA');

  // Minimum amount in USD for native assets and stablecoins
  private readonly PLATFORM_WALLET_MINIMUM_BALANCE: number = 1000;

  // Chain-specific metric labels
  private readonly baseMetricLabels: string[] = ['base', 'crypto'];
  private readonly solanaMetricLabels: string[] = ['solana', 'crypto'];

  constructor(
    private readonly prisma: DbService,
    private readonly utils: UtilsService,
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
    private readonly gateway: WalletGateway,
  ) {}

  getPlatformWalletPrivateKey(chain: Chain): string | Keypair {
    let wallet: EthereumHDKey;
    let privateKey: Uint8Array;

    switch (chain) {
      case 'BASE':
        wallet = hdkey.EthereumHDKey.fromMnemonic(
          this.config.getOrThrow<string>('PLATFORM_WALLET_KEYPHRASE'),
        );
        return wallet.getWallet().getPrivateKeyString();

      case 'SOLANA':
        privateKey = Uint8Array.from(
          this.config.getOrThrow<string>('PLATFORM_WALLET_KEYPHRASE'),
        );
        return Keypair.fromSecretKey(privateKey);

      default:
        throw new Error('Invalid chain parameter');
    }
  }

  async resolveDomainName(chain: Chain, domain: string): Promise<string> {
    try {
      if (chain === 'BASE') {
        const address = await this.web3.eth.ens.getAddress(domain);

        if (
          !address ||
          address === '0x0000000000000000000000000000000000000000'
        ) {
          throw new RpcException({
            status: HttpStatus.BAD_REQUEST,
            message: 'Invalid or unregistered ENS domain',
          });
        }

        return address.toString();
      }

      const { pubkey } = getDomainKeySync(domain);
      const { registry } = await NameRegistryState.retrieve(
        this.connection,
        pubkey,
      );

      if (!registry.owner) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: 'Invalid or unregistered SNS domain',
        });
      }

      return registry.owner.toBase58();
    } catch (error) {
      throw error;
    }
  }

  async getTokenAccountAddress(owner: PublicKey): Promise<PublicKey> {
    try {
      return getAssociatedTokenAddress(
        new PublicKey(this.SOLANA_USDC_MINT_ADDRESS),
        owner,
        true,
      );
    } catch (error) {
      throw error;
    }
  }

  async initiateTransaction(
    userId: number,
    dto: DepositDTO | WithdrawalDTO,
  ): Promise<Transaction> {
    try {
      if (dto instanceof DepositDTO) {
        return this.prisma.transaction.create({
          data: {
            userId,
            ...dto,
            status: 'PENDING',
            type: 'DEPOSIT',
          },
        });
      }

      return this.prisma.transaction.create({
        data: {
          userId,
          ...dto,
          status: 'PENDING',
          type: 'WITHDRAWAL',
        },
      });
    } catch (error) {
      throw error;
    }
  }

  async updateDbAfterTransaction(
    tx: Transaction,
    txIdentifier: string,
    status: TransactionStatus,
  ): Promise<{ user: User; updatedTx: Transaction }> {
    try {
      let user: User | undefined;
      const { id: txId, type, userId, amount } = tx;

      // Update user balance
      if (status === 'SUCCESS') {
        if (type === 'WITHDRAWAL') {
          user = await this.prisma.user.update({
            where: { id: userId },
            data: { balance: { decrement: amount } },
          });
        } else {
          user = await this.prisma.user.update({
            where: { id: userId },
            data: { balance: { increment: amount } },
          });
        }
      }

      // Update transaction details
      const updatedTx = await this.prisma.transaction.update({
        where: { id: txId },
        data: { status, txIdentifier },
      });

      return { user: user as User, updatedTx };
    } catch (error) {
      throw error;
    }
  }

  async sendTxStatusEmail(
    status: TransactionStatus,
    type: TransactionType,
    user: User,
    amount: number,
  ): Promise<void> {
    const date: string = new Date().toISOString();
    let subject: string = '';
    let content: string = '';

    if (type === 'WITHDRAWAL') {
      if (status === 'SUCCESS') {
        subject = 'Withdrawal Successful';
        content = `Your withdrawal of $${amount} on ${date} was successful. Your balance is $${user.balance}`;
      } else if (status === 'FAILED') {
        subject = 'Failed Withdrawal';
        content = `Your withdrawal of $${amount} on ${date} was unsuccessful. Please try again later.`;
      }
    }

    await this.utils.sendEmail(user.email, subject, content);
  }

  async processWithdrawalOnBase(
    userId: number,
    dto: WithdrawalDTO,
    transactionId: number,
  ): Promise<void> {
    let txHash: string = '';

    const transaction = (await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    })) as Transaction;

    try {
      const platformPrivateKey = this.getPlatformWalletPrivateKey(
        'BASE',
      ) as string;
      const account =
        this.web3.eth.accounts.privateKeyToAccount(platformPrivateKey);
      const contract = new this.web3.eth.Contract(
        contractAbi,
        this.BASE_USDC_TOKEN_ADDRESS,
      );

      // Resolve recipient's domain name if provided
      if (dto.address.endsWith('.eth')) {
        const resolvedAddress = await this.resolveDomainName(
          'BASE',
          dto.address,
        );

        dto.address = resolvedAddress;
      }
      // Verify recipient address
      if (!isAddress(dto.address)) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: 'Invalid recipient address',
        });
      }

      // Convert transfer amount to smallest unit of USDC
      const amountInUSDC = this.web3.utils.toBigInt(dto.amount * 1e6);
      // Encode the transaction for the transfer function using the ABI
      const data = contract.methods
        .transfer(dto.address, amountInUSDC.toString())
        .encodeABI();
      // Get gas price estimate based on recent transactions on the network
      const gasPrice = await this.web3.eth.getGasPrice();
      // Get the current nonce
      const nonce = await this.web3.eth.getTransactionCount(
        account.address,
        'pending',
      );

      // Configure transaction details
      const tx: EthTransaction = {
        from: account.address,
        to: this.BASE_USDC_TOKEN_ADDRESS,
        gasPrice,
        gas: 60000,
        data,
        nonce,
      };

      // Sign and broadcast the transaction to the network
      const signedTx = await this.web3.eth.accounts.signTransaction(
        tx,
        platformPrivateKey,
      );
      const rawTxHash = await this.web3.eth.sendSignedTransaction(
        signedTx.rawTransaction,
      );
      txHash = rawTxHash.transactionHash.toString();

      // Update user balance and transaction details
      const { user, updatedTx } = await this.updateDbAfterTransaction(
        transaction,
        txHash,
        'SUCCESS',
      );

      // Update withdrawal metrics
      this.metrics.incrementCounter(
        'successful_withdrawals',
        this.baseMetricLabels,
      );
      this.metrics.incrementCounter(
        'withdrawal_volume',
        this.baseMetricLabels,
        dto.amount,
      );

      // Notify client of transaction status
      this.gateway.sendTransactionStatus(user.email, updatedTx);

      return;
    } catch (error) {
      // Store failed transaction details
      const { user, updatedTx } = await this.updateDbAfterTransaction(
        transaction,
        txHash,
        'FAILED',
      );

      // Update withdrawal metrics
      this.metrics.incrementCounter(
        'failed_withdrawals',
        this.baseMetricLabels,
      );

      // Notify client of transaction status
      this.gateway.sendTransactionStatus(user.email, updatedTx);

      // Network congestion error check
      const msg = error.message as string;
      if (msg.includes('transaction underpriced')) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message:
            'The network is congested at the moment. Please try again later',
        });
      }

      throw error;
    }
  }
}
