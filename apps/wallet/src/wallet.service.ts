import { Inject, Injectable } from '@nestjs/common';
import { WalletGateway } from './wallet.gateway';
import { DbService } from '@app/db';
import { MetricsService } from '@app/metrics';
import { ConfigService } from '@nestjs/config';
import Web3, {
  Transaction as EthTransaction,
  TransactionError as EthTransactionErrror,
} from 'web3';
import { HelperService } from './utils/helper';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  TokenBalance,
  SendTransactionError as SolanaTransactionError,
} from '@solana/web3.js';
import { Chain, Transaction, TransactionStatus, User } from '@prisma/client';
import { hdkey } from '@ethereumjs/wallet';
import { EthereumHDKey } from '@ethereumjs/wallet/dist/cjs/hdkey';
import { getDomainKeySync, NameRegistryState } from '@bonfida/spl-name-service';
import { getAssociatedTokenAddress, transfer } from '@solana/spl-token';
import { DepositDTO, WithdrawalDTO } from './dto';
import { contractAbi } from './utils/constants';
import { UtilsService } from '@app/utils';
import axios from 'axios';
import { ETH_WEB3_PROVIDER_TOKEN, SOL_WEB3_PROVIDER_TOKEN } from './providers';

@Injectable()
export class WalletService {
  private readonly context: string = WalletService.name;

  private readonly BASE_USDC_TOKEN_ADDRESS: string;
  private readonly SOLANA_USDC_MINT_ADDRESS: string;

  // Minimum amount in USD for native assets and stablecoins
  private readonly PLATFORM_WALLET_MINIMUM_BALANCE: number = 1000;

  constructor(
    private readonly prisma: DbService,
    private readonly config: ConfigService,
    private readonly utils: UtilsService,
    private readonly metrics: MetricsService,
    private readonly gateway: WalletGateway,
    private readonly helper: HelperService,
    @Inject(ETH_WEB3_PROVIDER_TOKEN) private readonly web3: Web3,
    @Inject(SOL_WEB3_PROVIDER_TOKEN) private readonly connection: Connection,
  ) {
    // Fetch the official USDC token addresses
    this.BASE_USDC_TOKEN_ADDRESS = this.helper.selectUSDCTokenAddress('BASE');
    this.SOLANA_USDC_MINT_ADDRESS =
      this.helper.selectUSDCTokenAddress('SOLANA');
  }

  getPlatformWalletPrivateKey(chain: Chain): string | Keypair {
    let wallet: EthereumHDKey;
    let privateKey: Uint8Array;

    const keyPhrase: string = this.config.getOrThrow<string>(
      'PLATFORM_WALLET_KEYPHRASE',
    );

    switch (chain) {
      case 'BASE':
        wallet = hdkey.EthereumHDKey.fromMnemonic(keyPhrase);
        return wallet.getWallet().getPrivateKeyString();

      case 'SOLANA':
        privateKey = Uint8Array.from(keyPhrase);
        return Keypair.fromSecretKey(privateKey);
    }
  }

  async resolveDomainName(
    chain: Chain,
    domain: string,
  ): Promise<string | null> {
    try {
      if (chain === 'BASE') {
        const bytes = await this.web3.eth.ens.getAddress(domain);
        const address = bytes.toString();

        if (address === '0x0000000000000000000000000000000000000000')
          return null;

        return address;
      }

      const { pubkey } = getDomainKeySync(domain);
      const { registry } = await NameRegistryState.retrieve(
        this.connection,
        pubkey,
      );

      return registry.owner.toBase58();
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while resolving domain name: ${domain}. Error: ${error.message}\n`,
        );

      return null;
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

      return { user: updatedTx.user, updatedTx };
    } catch (error) {
      throw error;
    }
  }

  async processDepositOnBase(
    dto: DepositDTO,
    transaction: Transaction,
  ): Promise<TransactionStatus> {
    const { amount, txIdentifier, chain, depositor } = dto;
    const metricLabels: string[] = [chain.toLowerCase()];

    try {
      // Get receipt of the deposit transaction
      const receipt = await this.web3.eth.getTransactionReceipt(txIdentifier);

      // If transaction is not confirmed, return deposit status based on number of retries
      if (!receipt) {
        if (transaction.retries < 2) {
          const updatedTx = await this.prisma.transaction.update({
            where: { id: transaction.id },
            data: { retries: { increment: 1 } },
          });

          this.utils
            .logger()
            .warn(
              `[${this.context}] Deposit transaction (Tx: ${dto.txIdentifier}) is pending confirmation and a retry has been scheduled. Attempt: ${updatedTx.retries}\n`,
            );

          return 'PENDING';
        } else {
          // Store failed transaction details
          const { user, updatedTx } = await this.updateDbAfterTransaction(
            transaction,
            txIdentifier,
            'FAILED',
          );

          // Notify client of transaction status
          this.gateway.sendTransactionStatus(user.email, updatedTx);

          // Update deposit metrics
          this.metrics.incrementCounter('failed_deposits', metricLabels);

          return 'FAILED';
        }
      }

      // Get transaction details
      const tx = await this.web3.eth.getTransaction(txIdentifier);

      let recipientAddress: string = '';
      let amountTransferred: number = 0;

      // Get the ABI signature of the transfer function
      const transferSignatureHash = this.web3.eth.abi.encodeFunctionSignature(
        'transfer(address,uint256)',
      );

      const inputData = tx.data as string;
      if (inputData.startsWith(transferSignatureHash)) {
        // Strip the function signature from the data and decode the parameters
        const encodedParameters = '0x' + inputData.slice(10);
        const decodedData = this.web3.eth.abi.decodeParameters(
          ['address', 'uint256'],
          encodedParameters,
        );

        recipientAddress = decodedData[0] as string;

        // Confirm that the transferred token is USDC
        const tokenCheck = tx.to && tx.to === this.BASE_USDC_TOKEN_ADDRESS;

        if (tokenCheck) {
          // Convert transfer amount to smallest unit of USDC
          const txAmount = this.web3.utils.fromWei(
            decodedData[1] as bigint,
            'mwei',
          );
          amountTransferred = parseFloat(txAmount);
        }
      }

      // Confirm the transferred amount
      const amountCheck = amount === parseFloat(amountTransferred.toFixed(2));
      // Confirm that the recipient address is the platform wallet address
      const walletCheck =
        recipientAddress.toLowerCase() ===
        this.config
          .getOrThrow<string>('PLATFORM_ETHEREUM_WALLET')
          .toLowerCase();
      // Confirm that the sender address is the depositor's address
      const senderCheck = tx.from === depositor;

      if (amountCheck && walletCheck && senderCheck) {
        // Update user balance and transaction details
        const { user, updatedTx } = await this.updateDbAfterTransaction(
          transaction,
          txIdentifier,
          'SUCCESS',
        );

        // Notify client of transaction status
        this.gateway.sendTransactionStatus(user.email, updatedTx);

        // Update deposit metrics
        this.metrics.incrementCounter('successful_deposits', metricLabels);
        this.metrics.incrementCounter('deposit_volume', metricLabels, amount);

        return 'SUCCESS';
      } else {
        // Store failed transaction details
        const { user, updatedTx } = await this.updateDbAfterTransaction(
          transaction,
          txIdentifier,
          'FAILED',
        );

        // Notify client of transaction status
        this.gateway.sendTransactionStatus(user.email, updatedTx);

        // Update deposit metrics
        this.metrics.incrementCounter('failed_deposits', metricLabels);

        return 'FAILED';
      }
    } catch (error) {
      throw error;
    }
  }

  async processDepositOnSolana(
    dto: DepositDTO,
    transaction: Transaction,
  ): Promise<TransactionStatus> {
    const { amount, txIdentifier, chain, depositor } = dto;
    const metricLabels: string[] = [chain.toLowerCase()];

    try {
      // Get transaction details
      const response = await axios.post(
        this.helper.selectRpcUrl('SOLANA'),
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [
            txIdentifier,
            { commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
          ],
        },
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );

      // If transaction is not confirmed, return deposit status based on number of retries
      if (response.status === 200 && response.data.result === null) {
        if (transaction.retries < 2) {
          const updatedTx = await this.prisma.transaction.update({
            where: { id: transaction.id },
            data: { retries: { increment: 1 } },
          });

          this.utils
            .logger()
            .warn(
              `[${this.context}] Deposit transaction (Tx: ${dto.txIdentifier}) is pending confirmation and a retry has been scheduled. Attempt: ${updatedTx.retries}\n`,
            );

          return 'PENDING';
        } else {
          // Store failed transaction details
          const { user, updatedTx } = await this.updateDbAfterTransaction(
            transaction,
            txIdentifier,
            'FAILED',
          );

          // Notify client of transaction status
          this.gateway.sendTransactionStatus(user.email, updatedTx);

          // Update deposit metrics
          this.metrics.incrementCounter('failed_deposits', metricLabels);

          return 'FAILED';
        }
      }

      let recipientAddress: string = '';
      let senderAddress: string = '';
      let amountTransferred: number = 0;

      // Get the token balances from the transaction details
      const meta = response.data.result.meta as Record<string, any>;
      const preTokenBalances = meta.preTokenBalances as TokenBalance[];
      const postTokenBalances = meta.postTokenBalances as TokenBalance[];

      // Check for changes in the USDC token balances to get the sender and recipient addresses
      for (const postBalance of postTokenBalances) {
        if (postBalance.mint === this.SOLANA_USDC_MINT_ADDRESS) {
          const owner = postBalance.owner as string;
          const preBalance = preTokenBalances.find(
            (balance) =>
              balance.mint === this.SOLANA_USDC_MINT_ADDRESS &&
              balance.owner === owner,
          );

          const preAmount = preBalance?.uiTokenAmount.uiAmount as number;
          const postAmount = postBalance.uiTokenAmount.uiAmount as number;

          if (preAmount < postAmount) {
            recipientAddress = owner;
            amountTransferred = postAmount - preAmount;
          } else if (preAmount > postAmount) {
            senderAddress = owner;
            amountTransferred = preAmount - postAmount;
          }
        }
      }

      // Confirm the transferred amount
      const amountCheck = amount === parseFloat(amountTransferred.toFixed(2));
      // Confirm that the recipient address is the platform wallet address
      const walletCheck =
        recipientAddress ===
        this.config.getOrThrow<string>('PLATFORM_SOLANA_WALLET');
      // Confirm that the sender address is the depositor's address
      const senderCheck = senderAddress === depositor;

      if (amountCheck && walletCheck && senderCheck) {
        // Update user balance and transaction details
        const { user, updatedTx } = await this.updateDbAfterTransaction(
          transaction,
          txIdentifier,
          'SUCCESS',
        );

        // Notify client of transaction status
        this.gateway.sendTransactionStatus(user.email, updatedTx);

        // Update deposit metrics
        this.metrics.incrementCounter('successful_deposits', metricLabels);
        this.metrics.incrementCounter('deposit_volume', metricLabels, amount);

        return 'SUCCESS';
      } else {
        // Store failed transaction details
        const { user, updatedTx } = await this.updateDbAfterTransaction(
          transaction,
          txIdentifier,
          'FAILED',
        );

        // Notify client of transaction status
        this.gateway.sendTransactionStatus(user.email, updatedTx);

        // Update deposit metrics
        this.metrics.incrementCounter('failed_deposits', metricLabels);

        return 'FAILED';
      }
    } catch (error) {
      throw error;
    }
  }

  async processWithdrawalOnBase(
    dto: WithdrawalDTO,
    transaction: Transaction,
  ): Promise<void> {
    let txHash: string = '';
    const metricLabels: string[] = [dto.chain.toLowerCase()];

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
      const receipt = await this.web3.eth.sendSignedTransaction(
        signedTx.rawTransaction,
      );
      txHash = receipt.transactionHash.toString();

      // Update user balance and transaction details
      const { user, updatedTx } = await this.updateDbAfterTransaction(
        transaction,
        txHash,
        'SUCCESS',
      );

      // Update withdrawal metrics
      this.metrics.incrementCounter('successful_withdrawals', metricLabels);
      this.metrics.incrementCounter(
        'withdrawal_volume',
        metricLabels,
        dto.amount,
      );

      // Notify client of transaction status
      this.gateway.sendTransactionStatus(user.email, updatedTx);

      // Notify user of successful withdrawal
      const date: string = updatedTx.createdAt.toISOString();
      const content = `Your withdrawal of $${dto.amount} on ${date} was successful. Your balance is $${user.balance}`;
      await this.utils.sendEmail(user.email, 'Withdrawal Successful', content);

      return;
    } catch (error) {
      if (error instanceof EthTransactionErrror) {
        // Store failed transaction details
        const { user, updatedTx } = await this.updateDbAfterTransaction(
          transaction,
          txHash,
          'FAILED',
        );

        // Update withdrawal metrics
        this.metrics.incrementCounter('failed_withdrawals', metricLabels);

        // Notify client of transaction status
        this.gateway.sendTransactionStatus(user.email, updatedTx);

        // Notify user of failed withdrawal
        const date: string = updatedTx.createdAt.toISOString();
        const content = `Your withdrawal of $${dto.amount} on ${date} was unsuccessful. Please try again later.`;
        await this.utils.sendEmail(user.email, 'Failed Withdrawal', content);
      }

      throw error;
    }
  }

  async processWithdrawalOnSolana(
    dto: WithdrawalDTO,
    transaction: Transaction,
  ): Promise<void> {
    let signature: string = '';
    const metricLabels: string[] = [dto.chain.toLowerCase()];

    try {
      const sender = this.getPlatformWalletPrivateKey('SOLANA') as Keypair;
      const recipient = new PublicKey(dto.address);

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
      this.metrics.incrementCounter('successful_withdrawals', metricLabels);
      this.metrics.incrementCounter(
        'withdrawal_volume',
        metricLabels,
        dto.amount,
      );

      // Notify client of transaction status
      this.gateway.sendTransactionStatus(user.email, updatedTx);

      // Notify user of successful withdrawal
      const date: string = updatedTx.createdAt.toISOString();
      const content = `Your withdrawal of $${dto.amount} on ${date} was successful. Your balance is $${user.balance}`;
      await this.utils.sendEmail(user.email, 'Withdrawal Successful', content);

      return;
    } catch (error) {
      if (error instanceof SolanaTransactionError) {
        // Store failed transaction details
        const { user, updatedTx } = await this.updateDbAfterTransaction(
          transaction,
          signature,
          'FAILED',
        );

        // Update withdrawal metrics
        this.metrics.incrementCounter('failed_withdrawals', metricLabels);

        // Notify client of transaction status
        this.gateway.sendTransactionStatus(user.email, updatedTx);

        // Notify user of failed withdrawal
        const date: string = updatedTx.createdAt.toISOString();
        const content = `Your withdrawal of $${dto.amount} on ${date} was unsuccessful. Please try again later.`;
        await this.utils.sendEmail(user.email, 'Failed Withdrawal', content);
      }

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
