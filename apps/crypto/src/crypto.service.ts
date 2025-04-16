import { DbService } from '@app/db';
import { hdkey } from '@ethereumjs/wallet';
import { Injectable, OnModuleInit } from '@nestjs/common';
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
} from '@solana/web3.js';
import axios from 'axios';
import Web3, {
  ContractAbi,
  Contract,
  Bytes,
  Transaction as EthTransaction,
} from 'web3';
import { isAddress } from 'web3-validator';
import { CryptoWithdrawalDto } from './dto';
import { Chain, CryptoTransactionNotification } from './types';
import { selectRpcUrl, selectUSDCTokenAddress } from './utils';
import { UtilsService } from '@app/utils';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import { EthereumHDKey } from '@ethereumjs/wallet/dist/cjs/hdkey';
import { MetricsService } from '@app/metrics';
import { CryptoGateway } from './crypto.gateway';
import { randomUUID } from 'crypto';

@Injectable()
export class CryptoService implements OnModuleInit {
  private readonly context: string = CryptoService.name;

  private readonly web3 = new Web3(
    new Web3.providers.HttpProvider(selectRpcUrl('base', 'http')),
  );
  private readonly connection = new Connection(
    selectRpcUrl('solana', 'http'),
    'confirmed',
  );
  private readonly USDC_CONTRACT_ABI: ContractAbi = [
    {
      name: 'transfer',
      type: 'function',
      constant: false,
      inputs: [
        { name: '_to', type: 'address' },
        { name: '_value', type: 'uint256' },
      ],
      outputs: [{ name: '', type: 'bool' }],
    },
  ];
  private readonly BASE_USDC_TOKEN_ADDRESS = selectUSDCTokenAddress('base');
  private readonly SOLANA_USDC_MINT_ADDRESS = selectUSDCTokenAddress('solana');
  private readonly baseMetricLabels: string[] = ['base', 'crypto'];
  private readonly solanaMetricLabels: string[] = ['solana', 'crypto'];

  constructor(
    private readonly prisma: DbService,
    private readonly utils: UtilsService,
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
    private readonly gateway: CryptoGateway,
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
          this.config.getOrThrow<string>('PLATFORM_WALLET_RECOVERY_PHRASE'),
        );
        return wallet.getWallet().getPrivateKeyString();

      case 'solana':
        privateKey = Uint8Array.from(
          this.config.getOrThrow<string>('PLATFORM_WALLET_RECOVERY_PHRASE'),
        );
        return Keypair.fromSecretKey(privateKey);

      default:
        throw new Error('Invalid chain parameter');
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
    dto: CryptoWithdrawalDto,
    notificationId: string,
  ): Promise<string> {
    let email: string = '';
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
        this.USDC_CONTRACT_ABI,
        this.BASE_USDC_TOKEN_ADDRESS,
      );

      // Verify recipient address
      if (!isAddress(dto.address)) {
        throw new RpcException({
          status: 400,
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
      email = user.email;

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
      this.gateway.sendTransactionStatus(email, notification);

      return hash;
    } catch (error) {
      // Store failed transaction details
      await this.updateDbAfterTransaction(
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
      this.gateway.sendTransactionStatus(email, {
        ...notification,
        status: 'FAILED',
      });

      // Network congestion error check
      const msg = error.message as string;
      if (msg.includes('transaction underpriced')) {
        throw new RpcException({
          status: 400,
          message:
            'The network is congested at the moment. Please try again later',
        });
      }

      throw error;
    }
  }

  async processWithdrawalOnSolana(
    userId: number,
    dto: CryptoWithdrawalDto,
    notificationId: string,
  ): Promise<string> {
    let email: string = '';
    const notification: CryptoTransactionNotification = {
      id: notificationId,
      amount: dto.amount,
      chain: 'solana',
      status: 'SUCCESS',
      type: 'WITHDRAWAL',
    };

    try {
      const sender = this.getPlatformPrivateKey('solana') as Keypair;
      const recipient = new PublicKey(dto.address);

      // Verify recipient address
      if (!PublicKey.isOnCurve(recipient)) {
        throw new RpcException({
          status: 400,
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
      email = user.email;

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
      this.gateway.sendTransactionStatus(email, notification);

      return signature;
    } catch (error) {
      // Store failed transaction details
      await this.updateDbAfterTransaction(
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
      this.gateway.sendTransactionStatus(email, {
        ...notification,
        status: 'FAILED',
      });

      throw error;
    }
  }

  monitorDepositsOnBase(userId: number, address: string): void {
    let email: string = '';

    const web3 = new Web3(
      new Web3.providers.WebsocketProvider(selectRpcUrl('base', 'websocket')),
    );

    void web3.eth.subscribe('pendingTransactions', async (txHash: Bytes) => {
      try {
        const tx: EthTransaction = await web3.eth.getTransaction(txHash);

        if (
          tx &&
          tx.to?.toLowerCase() === this.BASE_USDC_TOKEN_ADDRESS.toLowerCase()
        ) {
          // Get recipient address and amount deposited
          const input = tx.input as Bytes;
          const decodedData = web3.eth.abi.decodeParameters(
            ['address', 'uint256'],
            input.slice(10) as string,
          );
          const recipient = decodedData[0] as string;
          const receivedAmount = web3.utils.fromWei(
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
            email = user.email;

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
            this.gateway.sendTransactionStatus(email, {
              id: randomUUID(),
              amount: amount,
              chain: 'base',
              status: 'SUCCESS',
              type: 'DEPOSIT',
            });

            // Notify user of successful deposit
            const content = `${amount} has been deposited in your wallet. Your balance is ${user.balance}`;
            await this.utils.sendEmail(user, 'Deposit Complete', content);

            this.utils
              .logger()
              .info(
                `[${this.context}] Crypto deposit by ${user.email} was successful. Amount: ${amount}\n`,
              );

            // Initiate auto-clearing of tokens to platform wallet
            const platformPrivateKey = this.getPlatformPrivateKey(
              'base',
            ) as string;
            const account =
              web3.eth.accounts.privateKeyToAccount(platformPrivateKey);
            const contract = new web3.eth.Contract(
              this.USDC_CONTRACT_ABI,
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
            const minimumBalance = await this.convertToCrypto(0.2, 'base');
            const currentBalanceInWei = await web3.eth.getBalance(address);
            const currentBalanceInEther = web3.utils.fromWei(
              currentBalanceInWei,
              'ether',
            );
            if (parseFloat(currentBalanceInEther) < minimumBalance) {
              await this.prefillUserWallet(user, 'base');
            }

            return;
          }
        }
      } catch (error) {
        this.utils
          .logger()
          .error(
            `[${this.context}] An error occurred while monitoring deposits on ethereum wallet: ${address}. Error: ${error.message}\n`,
          );
        throw error;
      }
    });
  }

  async monitorDepositsOnSolana(
    userId: number,
    address: string,
  ): Promise<void> {
    let email: string = '';

    const connection = new Connection(
      selectRpcUrl('solana', 'websocket'),
      'confirmed',
    );
    // Get USDC token account address of the user's wallet
    const tokenAddress = await this.getTokenAccountAddress(
      new PublicKey(address),
    );

    connection.onAccountChange(tokenAddress, (accountInfo) => {
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
          email = user.email;

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
          this.gateway.sendTransactionStatus(email, {
            id: randomUUID(),
            amount: amount,
            chain: 'solana',
            status: 'SUCCESS',
            type: 'DEPOSIT',
          });

          // Notify user of successful deposit
          const content = `${amount} has been deposited in your wallet. Your balance is ${user.balance}`;
          await this.utils.sendEmail(user, 'Deposit Complete', content);

          this.utils
            .logger()
            .info(
              `[${this.context}] Deposit on solana by ${email} was successful. Amount: ${amount}\n`,
            );

          // Initiate auto-clearing of tokens to platform wallet
          const sender = Keypair.fromSecretKey(
            Uint8Array.from(user.solPrivateKey),
          );
          const recipient = this.getPlatformPrivateKey('solana') as Keypair;
          await this.transferTokensOnSolana(
            connection,
            sender,
            recipient.publicKey,
            amount,
          );

          // Top up user wallet if gas fees are low
          const minimumBalance = await this.convertToCrypto(0.2, 'solana');
          const currentBalance = await connection.getBalance(
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
      let coinId: string;
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
      if (chain === 'solana') {
        const amount = await this.convertToCrypto(3, 'solana');
        const platformWallet = this.getPlatformPrivateKey('solana') as Keypair;
        const recipient = new PublicKey(user.solAddress);

        // Configure and add transaction instruction to System Program
        const tx = new SolTransaction().add(
          SystemProgram.transfer({
            fromPubkey: platformWallet.publicKey,
            toPubkey: recipient,
            lamports: amount * LAMPORTS_PER_SOL,
          }),
        );

        // Sign, send and confirm the transaction on the network
        await sendAndConfirmTransaction(this.connection, tx, [platformWallet]);
      } else if (chain === 'base') {
        const amount = await this.convertToCrypto(3, 'base');
        const platformPrivateKey = this.getPlatformPrivateKey('base') as string;
        const account =
          this.web3.eth.accounts.privateKeyToAccount(platformPrivateKey);

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
          to: user.ethAddress,
          value: this.web3.utils.toWei(amount, 'ether'),
          gasPrice,
          gas: 60000,
          nonce,
        };

        // Sign and broadcast the transaction to the network
        const signedTx = await this.web3.eth.accounts.signTransaction(
          tx,
          platformPrivateKey,
        );
        await this.web3.eth.sendSignedTransaction(signedTx.rawTransaction);
      }

      return;
    } catch (error) {
      throw error;
    }
  }

  // async clearUserWallet(address: string, chain: Chain): Promise<void> {}
  // async checkPlatformWalletBalance(chain: Chain): Promise<void> {}
}
