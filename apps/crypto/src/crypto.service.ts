import { DbService } from '@app/db';
import { hdkey } from '@ethereumjs/wallet';
import { HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import { TransactionStatus, TransactionType, User } from '@prisma/client';
import {
  getAssociatedTokenAddress,
  transfer,
  AccountLayout,
} from '@solana/spl-token';
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  sendAndConfirmTransaction,
  Transaction as SolTransaction,
  TransactionMessage,
  TransactionInstruction,
} from '@solana/web3.js';
import axios from 'axios';
import Web3, {
  ContractAbi,
  Contract,
  Transaction as EthTransaction,
} from 'web3';
import { isAddress } from 'web3-validator';
import { CryptoWithdrawalDTO } from './dto';
import { Chain, CryptoTransactionNotification } from './types';
import { selectRpcUrl, selectUSDCTokenAddress } from './utils/helper';
import { UtilsService } from '@app/utils';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import { EthereumHDKey } from '@ethereumjs/wallet/dist/cjs/hdkey';
import { MetricsService } from '@app/metrics';
import { CryptoGateway } from './crypto.gateway';
import { randomUUID } from 'crypto';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { getDomainKeySync, NameRegistryState } from '@bonfida/spl-name-service';
import {
  Alchemy,
  AlchemySubscription,
  Network,
  TransactionResponse,
} from 'alchemy-sdk';
import { usdcContractAbi } from './utils/abi';

@Injectable()
export class CryptoService implements OnModuleInit {
  private readonly context: string = CryptoService.name;

  // Connect to RPC endpoints
  private readonly web3 = new Web3(
    new Web3.providers.HttpProvider(selectRpcUrl('base')),
  );
  private readonly connection = new Connection(
    selectRpcUrl('solana'),
    'confirmed',
  );

  private readonly BASE_USDC_TOKEN_ADDRESS: string =
    selectUSDCTokenAddress('base');
  private readonly SOLANA_USDC_MINT_ADDRESS: string =
    selectUSDCTokenAddress('solana');

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
    private readonly gateway: CryptoGateway,
    @InjectQueue('crypto-queue') private readonly cryptoQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      // Get all user wallets
      const wallets = await this.prisma.user.findMany({
        select: {
          id: true,
          ethAddress: true,
          solAddress: true,
        },
      });

      // Subscribe to wallet activity to monitor deposits
      if (wallets.length > 0) {
        for (const wallet of wallets) {
          const { id: userId, ethAddress, solAddress } = wallet;

          this.monitorDepositsOnBase(userId, ethAddress);
          await this.monitorDepositsOnSolana(userId, solAddress);
        }

        this.utils
          .logger()
          .info(
            `[${this.context}] Monitoring successfully activated for all user wallets to check for deposits\n`,
          );

        return;
      }
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while subscribing to activities on user wallets. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  createUserWallet(chain: Chain): { address: string; privateKey: string } {
    if (chain === 'base') {
      const account = this.web3.eth.accounts.create();
      return { ...account };
    }

    const keypair = Keypair.generate();
    return {
      address: keypair.publicKey.toBase58(),
      privateKey: keypair.secretKey.toString(),
    };
  }

  getPlatformPrivateKey(chain: Chain): string | Keypair {
    let wallet: EthereumHDKey;
    let privateKey: Uint8Array;

    switch (chain) {
      case 'base':
        wallet = hdkey.EthereumHDKey.fromMnemonic(
          this.config.getOrThrow<string>('PLATFORM_WALLET_KEYPHRASE'),
        );
        return wallet.getWallet().getPrivateKeyString();

      case 'solana':
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
      if (chain === 'base') {
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

  async updateDbAfterTransaction(
    userId: number,
    amount: number,
    status: TransactionStatus,
    type: TransactionType,
  ): Promise<User> {
    try {
      let user: User | undefined;

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

      // Store transaction details
      await this.prisma.transaction.create({
        data: {
          amount: amount,
          method: 'CRYPTO',
          type,
          status,
          userId,
        },
      });

      return user as User;
    } catch (error) {
      throw error;
    }
  }

  async transferTokensOnBase(
    source: string,
    destination: string,
    transferAmount: number,
    contract: Contract<ContractAbi>,
    privateKey: string,
  ): Promise<string> {
    try {
      // Convert transfer amount to smallest unit of USDC
      const amount = this.web3.utils.toBigInt(transferAmount * 1e6);
      // Encode the transaction for the transfer function using the ABI
      const data = contract.methods
        .transfer(destination, amount.toString())
        .encodeABI();
      // Get gas price estimate based on recent transactions on the network
      const gasPrice = await this.web3.eth.getGasPrice();
      // Get the current nonce
      const nonce = await this.web3.eth.getTransactionCount(source, 'pending');

      // Configure transaction details
      const tx: EthTransaction = {
        from: source,
        to: this.BASE_USDC_TOKEN_ADDRESS,
        gasPrice,
        gas: 60000,
        data,
        nonce,
      };

      // Sign and broadcast the transaction to the network
      const signedTx = await this.web3.eth.accounts.signTransaction(
        tx,
        privateKey,
      );
      const receipt = await this.web3.eth.sendSignedTransaction(
        signedTx.rawTransaction,
      );

      return receipt.transactionHash.toString();
    } catch (error) {
      throw error;
    }
  }

  async transferTokensOnSolana(
    connection: Connection,
    sender: Keypair,
    recipient: PublicKey,
    amount: number,
  ): Promise<string> {
    try {
      // Get token account addresses of the platform wallet and recipient address
      const senderAddress = await this.getTokenAccountAddress(sender.publicKey);
      const receiverAddress = await this.getTokenAccountAddress(recipient);

      // Initiate transfer of tokens from sender's wallet
      const signature = await transfer(
        connection,
        sender,
        senderAddress,
        receiverAddress,
        sender.publicKey,
        amount * 1e6,
      );

      return signature;
    } catch (error) {
      throw error;
    }
  }

  async processWithdrawalOnBase(
    userId: number,
    dto: CryptoWithdrawalDTO,
    notificationId: string,
  ): Promise<string> {
    const notification: CryptoTransactionNotification = {
      id: notificationId,
      amount: dto.amount,
      chain: 'base',
      status: 'SUCCESS',
      type: 'WITHDRAWAL',
    };

    try {
      const platformPrivateKey = this.getPlatformPrivateKey('base') as string;
      const account =
        this.web3.eth.accounts.privateKeyToAccount(platformPrivateKey);
      const contract = new this.web3.eth.Contract(
        usdcContractAbi,
        this.BASE_USDC_TOKEN_ADDRESS,
      );

      // Resolve recipient's domain name if provided
      if (dto.address.endsWith('.eth')) {
        const resolvedAddress = await this.resolveDomainName(
          'base',
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

      // Initiate withdrawal from platform wallet
      const amount = dto.amount - 1; // $1 transaction fee
      const hash = await this.transferTokensOnBase(
        account.address,
        dto.address,
        amount,
        contract,
        platformPrivateKey,
      );

      // Update user balance and store transaction details
      const user = await this.updateDbAfterTransaction(
        userId,
        dto.amount,
        'SUCCESS',
        'WITHDRAWAL',
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
      this.gateway.sendTransactionStatus(user.email, notification);

      // Notify user of successful withdrawal
      await this.cryptoQueue.add('withdrawal-mail', {
        user,
        amount: dto.amount,
        status: 'success',
      });
      // Check platform wallet balance
      await this.cryptoQueue.add('check-balance', { chain: 'base' });

      return hash;
    } catch (error) {
      // Store failed transaction details
      const user = await this.updateDbAfterTransaction(
        userId,
        dto.amount,
        'FAILED',
        'WITHDRAWAL',
      );

      // Update withdrawal metrics
      this.metrics.incrementCounter(
        'failed_withdrawals',
        this.baseMetricLabels,
      );

      // Notify client of transaction status
      this.gateway.sendTransactionStatus(user.email, {
        ...notification,
        status: 'FAILED',
      });

      // Notify user of failed withdrawal
      await this.cryptoQueue.add('withdrawal-mail', {
        user,
        amount: dto.amount,
        status: 'failed',
      });

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
    userId: number,
    dto: CryptoWithdrawalDTO,
    notificationId: string,
  ): Promise<string> {
    const notification: CryptoTransactionNotification = {
      id: notificationId,
      amount: dto.amount,
      chain: 'solana',
      status: 'SUCCESS',
      type: 'WITHDRAWAL',
    };

    try {
      const sender = this.getPlatformPrivateKey('solana') as Keypair;

      // Resolve recipient's domain name if provided
      if (dto.address.endsWith('.sol')) {
        const resolvedAddress = await this.resolveDomainName(
          'solana',
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

      // Initiate withdrawal from platform wallet
      const amount = dto.amount - 1; // $1 transaction fee
      const signature = await this.transferTokensOnSolana(
        this.connection,
        sender,
        recipient,
        amount,
      );

      // Update user balance and store transaction details
      const user = await this.updateDbAfterTransaction(
        userId,
        dto.amount,
        'SUCCESS',
        'WITHDRAWAL',
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
      this.gateway.sendTransactionStatus(user.email, notification);

      // Notify user of successful withdrawal
      await this.cryptoQueue.add('withdrawal-mail', {
        user,
        amount: dto.amount,
        status: 'success',
      });
      // Check platform wallet balance
      await this.cryptoQueue.add('check-balance', { chain: 'solana' });

      return signature;
    } catch (error) {
      // Store failed transaction details
      const user = await this.updateDbAfterTransaction(
        userId,
        dto.amount,
        'FAILED',
        'WITHDRAWAL',
      );

      // Update withdrawal metrics
      this.metrics.incrementCounter(
        'failed_withdrawals',
        this.solanaMetricLabels,
      );

      // Notify client of transaction status
      this.gateway.sendTransactionStatus(user.email, {
        ...notification,
        status: 'FAILED',
      });

      // Notify user of failed withdrawal
      await this.cryptoQueue.add('withdrawal-mail', {
        user,
        amount: dto.amount,
        status: 'failed',
      });

      throw error;
    }
  }

  monitorDepositsOnBase(userId: number, address: string): void {
    const alchemy = new Alchemy({
      apiKey: this.config.getOrThrow<string>('ALCHEMY_API_KEY'),
      network:
        this.config.getOrThrow<string>('NODE_ENV') === 'production'
          ? Network.ETH_MAINNET
          : Network.ETH_SEPOLIA,
    });

    const handlePendingTransactions = async (
      tx: TransactionResponse,
    ): Promise<void> => {
      const inputData = tx.data;
      const transferSignatureHash = this.web3.eth.abi.encodeFunctionSignature(
        'transfer(address,uint256)',
      );

      if (inputData.startsWith(transferSignatureHash)) {
        // Strip the function signature from the data and decode the parameters
        const encodedParameters = '0x' + inputData.slice(10);
        const decodedData = this.web3.eth.abi.decodeParameters(
          ['address', 'uint256'],
          encodedParameters,
        );

        const recipient = decodedData[0] as string;
        const receivedAmount = this.web3.utils.fromWei(
          decodedData[1] as bigint,
          'mwei',
        );
        const amount = parseFloat(receivedAmount);

        if (recipient.toLowerCase() === address.toLowerCase()) {
          // Update user balance and store transaction details
          const user = await this.updateDbAfterTransaction(
            userId,
            amount,
            'SUCCESS',
            'DEPOSIT',
          );

          // Update deposit metrics
          this.metrics.incrementCounter(
            'successful_deposits',
            this.baseMetricLabels,
          );
          this.metrics.incrementCounter(
            'deposit_volume',
            this.baseMetricLabels,
            amount,
          );

          // Notify client of transaction status
          this.gateway.sendTransactionStatus(user.email, {
            id: randomUUID(),
            amount: amount,
            chain: 'base',
            status: 'SUCCESS',
            type: 'DEPOSIT',
          });

          // Notify user of successful deposit
          const content = `$${amount} has been deposited in your wallet. Your balance is $${user.balance}`;
          await this.utils.sendEmail(user.email, 'Deposit Complete', content);

          this.utils
            .logger()
            .info(
              `[${this.context}] Stablecoin deposit on base by ${user.email} was successful. Amount: $${amount}\n`,
            );

          // Initiate auto-clearing of tokens to platform wallet
          const platformPrivateKey = this.getPlatformPrivateKey(
            'base',
          ) as string;
          const account =
            this.web3.eth.accounts.privateKeyToAccount(platformPrivateKey);
          const contract = new this.web3.eth.Contract(
            usdcContractAbi,
            this.BASE_USDC_TOKEN_ADDRESS,
          );
          await this.transferTokensOnBase(
            address,
            account.address,
            amount,
            contract,
            user.ethPrivateKey,
          );

          // Top up user wallet if gas fees are low
          const minimumBalance = await this.convertToCrypto(0.35, 'base');
          const currentBalanceInWei = await this.web3.eth.getBalance(address);
          const currentBalanceInEther = this.web3.utils.fromWei(
            currentBalanceInWei,
            'ether',
          );
          if (parseFloat(currentBalanceInEther) < minimumBalance) {
            await this.prefillUserWallet(user, 'base');
          }

          return;
        }
      }
    };

    alchemy.ws.on(
      {
        method: AlchemySubscription.PENDING_TRANSACTIONS,
        toAddress: address,
        hashesOnly: false,
      },
      (tx: TransactionResponse) => {
        handlePendingTransactions(tx).catch((error) => {
          this.utils
            .logger()
            .error(
              `[${this.context}] An error occurred while monitoring deposits on ethereum wallet: ${address}. Error: ${error.message}\n`,
            );

          throw error;
        });
      },
    );
  }

  async monitorDepositsOnSolana(
    userId: number,
    address: string,
  ): Promise<void> {
    // Get USDC token account address of the user's wallet
    const tokenAddress = await this.getTokenAccountAddress(
      new PublicKey(address),
    );

    this.connection.onAccountChange(tokenAddress, (accountInfo) => {
      void (async () => {
        try {
          const account = AccountLayout.decode(accountInfo.data);
          const amount = Number(account.amount) / 1e6;

          // Update user balance and store transaction details
          const user = await this.updateDbAfterTransaction(
            userId,
            amount,
            'SUCCESS',
            'DEPOSIT',
          );

          // Update deposit metrics
          this.metrics.incrementCounter(
            'successful_deposits',
            this.solanaMetricLabels,
          );
          this.metrics.incrementCounter(
            'deposit_volume',
            this.solanaMetricLabels,
            amount,
          );

          // Notify client of transaction status
          this.gateway.sendTransactionStatus(user.email, {
            id: randomUUID(),
            amount: amount,
            chain: 'solana',
            status: 'SUCCESS',
            type: 'DEPOSIT',
          });

          // Notify user of successful deposit
          const content = `$${amount} has been deposited in your wallet. Your balance is $${user.balance}`;
          await this.utils.sendEmail(user.email, 'Deposit Complete', content);

          this.utils
            .logger()
            .info(
              `[${this.context}] Stablecoin deposit on solana by ${user.email} was successful. Amount: $${amount}\n`,
            );

          // Initiate auto-clearing of tokens to platform wallet
          const sender = Keypair.fromSecretKey(
            Uint8Array.from(user.solPrivateKey),
          );
          const recipient = this.getPlatformPrivateKey('solana') as Keypair;
          await this.transferTokensOnSolana(
            this.connection,
            sender,
            recipient.publicKey,
            amount,
          );

          // Top up user wallet if gas fees are low
          const minimumBalance = await this.convertToCrypto(0.35, 'solana');
          const currentBalance = await this.connection.getBalance(
            new PublicKey(address),
          );
          if (currentBalance / LAMPORTS_PER_SOL < minimumBalance) {
            await this.prefillUserWallet(user, 'solana');
          }
        } catch (error) {
          this.utils
            .logger()
            .error(
              `[${this.context}] An error occurred while monitoring deposits on solana wallet: ${address}. Error: ${error.message}\n`,
            );
        }
      })();
    });
  }

  async convertToCrypto(amount: number, chain: Chain): Promise<number> {
    try {
      let coinId: string = '';
      chain === 'base' ? (coinId = 'ethereum') : (coinId = 'solana');

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
      chain === 'base'
        ? (usdPrice = response.data.ethereum.usd as number)
        : (usdPrice = response.data.solana.usd as number);

      return amount / usdPrice;
    } catch (error) {
      throw error;
    }
  }

  async prefillUserWallet(user: User, chain: Chain): Promise<void> {
    try {
      const amount = await this.convertToCrypto(3, chain);

      if (chain === 'solana') {
        const platformWallet = this.getPlatformPrivateKey(chain) as Keypair;
        const userWallet = new PublicKey(user.solAddress);

        // Configure and add transaction instruction
        const tx = new SolTransaction().add(
          SystemProgram.transfer({
            fromPubkey: platformWallet.publicKey,
            toPubkey: userWallet,
            lamports: amount * LAMPORTS_PER_SOL,
          }),
        );

        // Sign, send and confirm the transaction on the network
        await sendAndConfirmTransaction(this.connection, tx, [platformWallet]);
      }

      if (chain === 'base') {
        const platformPrivateKey = this.getPlatformPrivateKey(chain) as string;
        const platformAccount =
          this.web3.eth.accounts.privateKeyToAccount(platformPrivateKey);

        // Get gas price estimate based on recent transactions on the network
        const gasPrice = await this.web3.eth.getGasPrice();
        // Get the current nonce
        const nonce = await this.web3.eth.getTransactionCount(
          platformAccount.address,
          'pending',
        );

        // Configure transaction details
        const tx: EthTransaction = {
          from: platformAccount.address,
          to: user.ethAddress,
          value: this.web3.utils.toWei(amount, 'ether'),
          gasPrice,
          gas: 21000,
          nonce,
        };

        // Sign and broadcast the transaction to the network
        const signedTx = await this.web3.eth.accounts.signTransaction(
          tx,
          platformPrivateKey,
        );
        await this.web3.eth.sendSignedTransaction(signedTx.rawTransaction);
      }

      // Check platform wallet balance after prefill
      await this.checkNativeAssetBalance(chain);

      return;
    } catch (error) {
      throw error;
    }
  }

  async checkNativeAssetBalance(chain: Chain): Promise<void> {
    try {
      let lowBalanceCheck: boolean = false;
      let currentBalance: number = 0;

      let symbol: string = '';
      chain === 'base' ? (symbol = 'ETH') : (symbol = 'SOL');

      // Convert allowed minimum amount to crypto equivalent
      const minimumBalance = await this.convertToCrypto(
        this.PLATFORM_WALLET_MINIMUM_BALANCE,
        chain,
      );

      if (chain === 'base') {
        const platformPrivateKey = this.getPlatformPrivateKey(chain) as string;
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

      if (chain === 'solana') {
        const platformPrivateKey = this.getPlatformPrivateKey(chain) as Keypair;
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

      if (chain === 'base') {
        const platformPrivateKey = this.getPlatformPrivateKey(chain) as string;
        const account =
          this.web3.eth.accounts.privateKeyToAccount(platformPrivateKey);
        const contract = new this.web3.eth.Contract(
          usdcContractAbi,
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

      if (chain === 'solana') {
        const platformPrivateKey = this.getPlatformPrivateKey(chain) as Keypair;
        const tokenAddress = await this.getTokenAccountAddress(
          platformPrivateKey.publicKey,
        );

        // Get stablecoin balance
        const balance =
          await this.connection.getTokenAccountBalance(tokenAddress);
        currentBalance = balance.value.uiAmount as number;

        // Check if balance is below allowed minimum
        if (currentBalance < this.PLATFORM_WALLET_MINIMUM_BALANCE)
          lowBalanceCheck = true;
      }

      // Notify admin if balance is low
      if (lowBalanceCheck) {
        const content = `The platform wallet on ${chain} has a stablecoin balance of ${currentBalance}USDC.`;
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

  async clearUserWallets(user: User): Promise<void> {
    try {
      // -- CLEAR SOLANA WALLET --
      const userSolWallet = Keypair.fromSecretKey(
        Uint8Array.from(user.solPrivateKey),
      );
      const platformSolWallet = this.getPlatformPrivateKey('solana') as Keypair;

      // Get the user wallet balance
      const balanceInLamports = await this.connection.getBalance(
        userSolWallet.publicKey,
      );
      // Fetch the recent blockhash and block height
      const { blockhash, lastValidBlockHeight } =
        await this.connection.getLatestBlockhash();

      // Build the preliminary transaction instruction for use in the transaction message
      const preliminaryInstruction = new TransactionInstruction(
        SystemProgram.transfer({
          fromPubkey: userSolWallet.publicKey,
          toPubkey: platformSolWallet.publicKey,
          lamports: balanceInLamports,
        }),
      );

      // Compile transaction message for fee estimation
      const txMessage = new TransactionMessage({
        recentBlockhash: blockhash,
        payerKey: userSolWallet.publicKey,
        instructions: [preliminaryInstruction],
      }).compileToV0Message();

      // Get the estimated gas fees in lamports for the transaction message
      const feeResult = await this.connection.getFeeForMessage(txMessage);
      // Ensure the balance is sufficient for the transfer
      const totalFee = feeResult.value as number;
      const amountToTransfer =
        balanceInLamports > totalFee ? balanceInLamports - totalFee : 0;

      // Configure final transaction instruction for transfer
      const solTx = new SolTransaction().add(
        SystemProgram.transfer({
          fromPubkey: userSolWallet.publicKey,
          toPubkey: platformSolWallet.publicKey,
          lamports: amountToTransfer,
        }),
      );
      solTx.lastValidBlockHeight = lastValidBlockHeight;

      // Sign, send and confirm the transaction on the solana network
      await sendAndConfirmTransaction(this.connection, solTx, [userSolWallet]);

      // -- CLEAR ETHEREUM WALLET --
      const platformEthPrivateKey = this.getPlatformPrivateKey(
        'base',
      ) as string;
      const platformEthAccount = this.web3.eth.accounts.privateKeyToAccount(
        platformEthPrivateKey,
      );

      // Get user wallet balance
      const balanceInWei = await this.web3.eth.getBalance(user.ethAddress);
      // Determine gas limit for the transfer
      const gasLimit = 21000;
      // Estimate the gas price based on recent transactions
      const gasPrice = await this.web3.eth.getGasPrice();
      // Calculate the total transaction fees
      const totalFeeInWei = BigInt(gasLimit) * BigInt(gasPrice);

      // Ensure the balance is sufficient for the transfer
      const amountToSendInWei =
        BigInt(balanceInWei) > totalFeeInWei
          ? BigInt(balanceInWei) - totalFeeInWei
          : BigInt(0);

      // Get the current nonce
      const nonce = await this.web3.eth.getTransactionCount(
        user.ethAddress,
        'pending',
      );

      // Configure transaction details
      const ethTx: EthTransaction = {
        from: user.ethAddress,
        to: platformEthAccount.address,
        value: amountToSendInWei,
        gasPrice,
        gas: gasLimit,
        nonce,
      };

      // Sign and broadcast the transaction to the ethereum network
      const signedTx = await this.web3.eth.accounts.signTransaction(
        ethTx,
        user.ethPrivateKey,
      );
      await this.web3.eth.sendSignedTransaction(signedTx.rawTransaction);

      return;
    } catch (error) {
      throw error;
    }
  }
}
