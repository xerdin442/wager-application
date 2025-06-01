import { HttpStatus, Injectable } from '@nestjs/common';
import { WalletGateway } from './wallet.gateway';
import { DbService } from '@app/db';
import { MetricsService } from '@app/metrics';
import { ConfigService } from '@nestjs/config';
import Web3, { Transaction as EthTransaction } from 'web3';
import { selectRpcUrl, selectUSDCTokenAddress } from './utils/helper';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from '@solana/web3.js';
import { RpcException } from '@nestjs/microservices';
import { Chain, Transaction, TransactionStatus, User } from '@prisma/client';
import { hdkey } from '@ethereumjs/wallet';
import { EthereumHDKey } from '@ethereumjs/wallet/dist/cjs/hdkey';
import { getDomainKeySync, NameRegistryState } from '@bonfida/spl-name-service';
import { getAssociatedTokenAddress, transfer } from '@solana/spl-token';
import { isAddress } from 'web3-validator';
import { DepositDTO, WithdrawalDTO } from './dto';
import { contractAbi } from './utils/abi';
import { UtilsService } from '@app/utils';
import axios from 'axios';

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
    private readonly config: ConfigService,
    private readonly utils: UtilsService,
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
      const { id: txId, type, userId, amount } = tx;

      // Update user balance
      if (status === 'SUCCESS') {
        if (type === 'WITHDRAWAL') {
          await this.prisma.user.update({
            where: { id: userId },
            data: { balance: { decrement: amount } },
          });
        } else {
          await this.prisma.user.update({
            where: { id: userId },
            data: { balance: { increment: amount } },
          });
        }
      }

      // Update transaction details
      const updatedTx = await this.prisma.transaction.update({
        where: { id: txId },
        data: { status, txIdentifier },
        include: { user: true },
      });
      const user = updatedTx.user as User;

      return { user, updatedTx };
    } catch (error) {
      throw error;
    }
  }

  async processDepositOnBase(
    dto: DepositDTO,
    transaction: Transaction,
  ): Promise<void> {}

  async processDepositOnSolana(
    dto: DepositDTO,
    transaction: Transaction,
  ): Promise<void> {}

  async processWithdrawalOnBase(
    dto: WithdrawalDTO,
    transaction: Transaction,
  ): Promise<void> {
    let txHash: string = '';

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

  async processWithdrawalOnSolana(
    dto: WithdrawalDTO,
    transaction: Transaction,
  ): Promise<void> {
    let signature: string = '';

    try {
      const sender = this.getPlatformWalletPrivateKey('SOLANA') as Keypair;

      // Resolve recipient's domain name if provided
      if (dto.address.endsWith('.sol')) {
        const resolvedAddress = await this.resolveDomainName(
          'SOLANA',
          dto.address,
        );

        dto.address = resolvedAddress;
      }

      // Verify recipient address
      const recipient = new PublicKey(dto.address);
      if (!PublicKey.isOnCurve(recipient)) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: 'Invalid recipient address',
        });
      }

      // Get the token account addresses of platform wallet and recipient address
      const senderTokenAddress = await this.getTokenAccountAddress(
        sender.publicKey,
      );
      const recipientTokenAddress =
        await this.getTokenAccountAddress(recipient);

      // Initiate transfer of USDC tokens from platform wallet
      signature = await transfer(
        this.connection,
        sender,
        senderTokenAddress,
        recipientTokenAddress,
        sender.publicKey,
        dto.amount * 1e6,
      );

      // Update user balance and store transaction details
      const { user, updatedTx } = await this.updateDbAfterTransaction(
        transaction,
        signature,
        'SUCCESS',
      );

      // Update withdrawal metrics
      this.metrics.incrementCounter(
        'successful_withdrawals',
        this.solanaMetricLabels,
      );
      this.metrics.incrementCounter(
        'withdrawal_volume',
        this.solanaMetricLabels,
        dto.amount,
      );

      // Notify client of transaction status
      this.gateway.sendTransactionStatus(user.email, updatedTx);

      return;
    } catch (error) {
      // Store failed transaction details
      const { user, updatedTx } = await this.updateDbAfterTransaction(
        transaction,
        signature,
        'FAILED',
      );

      // Update withdrawal metrics
      this.metrics.incrementCounter(
        'failed_withdrawals',
        this.solanaMetricLabels,
      );

      // Notify client of transaction status
      this.gateway.sendTransactionStatus(user.email, updatedTx);

      throw error;
    }
  }

  async convertAmountToCrypto(amount: number, chain: Chain): Promise<number> {
    try {
      let coinId: string = '';
      chain === 'BASE' ? (coinId = 'ethereum') : (coinId = 'solana');

      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
        {
          headers: {
            Accept: 'application/json',
            'x-cg-demo-api-key':
              this.config.getOrThrow<string>('COINGECKO_API_KEY'),
          },
        },
      );

      let usdPrice: number = 0;
      chain === 'BASE'
        ? (usdPrice = response.data.ethereum.usd as number)
        : (usdPrice = response.data.solana.usd as number);

      return amount / usdPrice;
    } catch (error) {
      throw error;
    }
  }

  async checkNativeAssetBalance(chain: Chain): Promise<void> {
    try {
      let lowBalanceCheck: boolean = false;
      let currentBalance: number = 0;

      let symbol: string = '';
      chain === 'BASE' ? (symbol = 'ETH') : (symbol = 'SOL');

      // Convert allowed minimum amount to crypto equivalent
      const minimumBalance = await this.convertAmountToCrypto(
        this.PLATFORM_WALLET_MINIMUM_BALANCE / 4,
        chain,
      );

      if (chain === 'BASE') {
        const platformPrivateKey = this.getPlatformWalletPrivateKey(
          chain,
        ) as string;
        const account =
          this.web3.eth.accounts.privateKeyToAccount(platformPrivateKey);

        // Get ETH balance
        const currentBalanceInWei = await this.web3.eth.getBalance(
          account.address,
        );
        const currentBalanceInEther = this.web3.utils.fromWei(
          currentBalanceInWei,
          'ether',
        );
        currentBalance = parseFloat(currentBalanceInEther);

        // Check if balance is below allowed minimum
        if (currentBalance < minimumBalance) lowBalanceCheck = true;
      }

      if (chain === 'SOLANA') {
        const platformPrivateKey = this.getPlatformWalletPrivateKey(
          chain,
        ) as Keypair;

        // Get SOL balance
        const currentBalanceInLamports = await this.connection.getBalance(
          platformPrivateKey.publicKey,
        );
        currentBalance = currentBalanceInLamports / LAMPORTS_PER_SOL;

        // Check if balance is below allowed minimum
        if (currentBalance < minimumBalance) lowBalanceCheck = true;
      }

      // Notify admin if native asset balance is low
      if (lowBalanceCheck) {
        const content = `The platform wallet on ${chain} has a native asset balance of ${currentBalance}${symbol}`;
        await this.utils.sendEmail(
          this.config.getOrThrow<string>('SUPER_ADMIN_EMAIL'),
          'Low Balance Alert',
          content,
        );

        this.utils
          .logger()
          .warn(
            `[${this.context}] The platform wallet on ${chain} has a low native asset balance. Balance: ${currentBalance}${symbol}\n`,
          );
      }
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occured while checking native asset balance of platform wallet on ${chain}\n`,
        );

      throw error;
    }
  }

  async checkStablecoinBalance(chain: Chain): Promise<void> {
    try {
      let lowBalanceCheck: boolean = false;
      let currentBalance: number = 0;

      if (chain === 'BASE') {
        const platformPrivateKey = this.getPlatformWalletPrivateKey(
          chain,
        ) as string;
        const account =
          this.web3.eth.accounts.privateKeyToAccount(platformPrivateKey);
        const contract = new this.web3.eth.Contract(
          contractAbi,
          this.BASE_USDC_TOKEN_ADDRESS,
        );

        // Get stablecoin balance
        const balanceInWei: string = await contract.methods
          .balanceOf(account.address)
          .call();
        const balanceInUSDC = this.web3.utils.fromWei(balanceInWei, 'mwei');
        currentBalance = parseFloat(balanceInUSDC);

        // Check if balance is below allowed minimum
        if (currentBalance < this.PLATFORM_WALLET_MINIMUM_BALANCE)
          lowBalanceCheck = true;
      }

      if (chain === 'SOLANA') {
        const platformPrivateKey = this.getPlatformWalletPrivateKey(
          chain,
        ) as Keypair;
        const platformTokenAddress = await this.getTokenAccountAddress(
          platformPrivateKey.publicKey,
        );

        // Get stablecoin balance
        const balance =
          await this.connection.getTokenAccountBalance(platformTokenAddress);
        currentBalance = balance.value.uiAmount as number;

        // Check if balance is below allowed minimum
        if (currentBalance < this.PLATFORM_WALLET_MINIMUM_BALANCE)
          lowBalanceCheck = true;
      }

      // Notify admin if balance is low
      if (lowBalanceCheck) {
        const content = `The platform wallet on ${chain.toLowerCase()} has a stablecoin balance of ${currentBalance}USDC.`;
        await this.utils.sendEmail(
          this.config.getOrThrow<string>('SUPER_ADMIN_EMAIL'),
          'Low Balance Alert',
          content,
        );

        this.utils
          .logger()
          .warn(
            `[${this.context}] The platform wallet on ${chain} has a low stablecoin balance. Balance: ${currentBalance}USDC.\n`,
          );
      }
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occured while checking stablecoin balance of platform wallet on ${chain}\n`,
        );

      throw error;
    }
  }
}
