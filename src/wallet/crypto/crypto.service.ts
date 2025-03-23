import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { selectRpcUrl, selectUSDCTokenAddress } from '@src/common/util/crypto';
import Web3, {
  Bytes,
  Contract,
  ContractAbi,
  Transaction
} from 'web3';
import { hdkey } from '@ethereumjs/wallet';
import { CryptoWithdrawalDto } from './dto';
import { Secrets } from '@src/common/env';
import { DbService } from '@src/db/db.service';
import { isAddress } from 'web3-validator';
import {
  AccountLayout,
  getAssociatedTokenAddress,
  transfer
} from '@solana/spl-token';
import { Chain } from '@src/common/types';
import logger from '@src/common/logger';
import { sendEmail } from '@src/common/config/mail';
import { TransactionType, User } from '@prisma/client';

@Injectable()
export class CryptoService implements OnModuleInit {
  private readonly context: string = CryptoService.name;

  private readonly web3 = new Web3(new Web3.providers.HttpProvider(selectRpcUrl('base', 'http')));
  private readonly connection = new Connection(selectRpcUrl('solana', 'http'), 'confirmed');
  private readonly USDC_CONTRACT_ABI: ContractAbi = [
    {
      name: 'transfer',
      type: 'function',
      constant: false,
      inputs: [
        { name: '_to', type: 'address' },
        { name: '_value', type: 'uint256' }
      ],
      outputs: [{ name: '', type: 'bool' }]
    }
  ];
  private readonly BASE_USDC_TOKEN_ADDRESS = selectUSDCTokenAddress('base');
  private readonly SOLANA_USDC_MINT_ADDRESS = selectUSDCTokenAddress('solana');

  constructor(private readonly prisma: DbService) { };

  async onModuleInit() {
    try {
      // Get all user wallets
      const wallets = await this.prisma.user.findMany({
        select: {
          id: true,
          ethAddress: true,
          solAddress: true
        }
      });

      // Subscribe to wallet activity to monitor deposits
      for (let wallet of wallets) {
        const { id: userId, ethAddress, solAddress } = wallet;

        await this.monitorDepositsOnBase(userId, ethAddress);
        await this.monitorDepositsOnSolana(userId, solAddress);
      };

      logger.info(`[${this.context}] Monitoring successfully activated for all user wallets to check for deposits\n`);
      return;
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while resubscribing to activities on user wallets. Error: ${error.message}\n`);
      throw error;
    }
  }

  createEthereumWallet(): { address: string, privateKey: string } {
    const account = this.web3.eth.accounts.create();
    return { ...account };
  }

  createSolanaWallet(): string {
    return Keypair.generate().publicKey.toBase58();
  }

  getPlatformPrivateKey(chain: Chain): string | Keypair {
    switch (chain) {
      case 'base':
        const wallet = hdkey.EthereumHDKey.fromMnemonic(Secrets.PLATFORM_WALLET_RECOVERY_PHRASE);
        return wallet.getWallet().getPrivateKeyString();

      case 'solana':
        const privateKey = Uint8Array.from(Secrets.PLATFORM_WALLET_RECOVERY_PHRASE);
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
        true
      );
    } catch (error) {
      throw error;
    }
  }

  async updateDbAfterTransaction(userId: number, amount: number, type: TransactionType): Promise<User> {
    let user: User;

    // Update user balance
    if (type === 'WITHDRAWAL') {
      user = await this.prisma.user.update({
        where: { id: userId },
        data: { balance: { decrement: amount } }
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: userId },
        data: { balance: { increment: amount } }
      });
    };

    // Store transaction details
    await this.prisma.transaction.create({
      data: {
        amount: amount,
        method: 'CRYPTO',
        type,
        status: 'SUCCESS',
        userId
      }
    });

    return user;
  }

  async transferTokensOnBase(
    source: string,
    destination: string,
    transferAmount: number,
    contract: Contract<ContractAbi>,
    privateKey: string
  ): Promise<string> {
    try {
      // Get gas price estimate based on recent transactions on the network
      const gasPrice = await this.web3.eth.getGasPrice();
      // Convert USD amount to smallest unit of USDC
      const amount = this.web3.utils.toBigInt(transferAmount * 1e6) - gasPrice;
      // Encode the transaction for the transfer function using the ABI
      const data = contract.methods.transfer(destination, amount.toString()).encodeABI();
      // Get the current nonce
      const nonce = await this.web3.eth.getTransactionCount(source, 'pending');

      // Configure transaction details
      const tx: Transaction = {
        from: source,
        to: this.BASE_USDC_TOKEN_ADDRESS,
        gasPrice,
        gas: 60000,
        data,
        nonce
      }

      // Sign and broadcast the transaction to the network
      const signedTx = await this.web3.eth.accounts.signTransaction(tx, privateKey);
      const receipt = await this.web3.eth.sendSignedTransaction(signedTx.rawTransaction);

      return receipt.transactionHash.toString();
    } catch (error) {
      throw error;
    }
  }

  async transferTokensOnSolana(
    connection: Connection,
    sender: Keypair,
    recipient: PublicKey,
    amount: number
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
        amount * 1e6
      );

      return signature;
    } catch (error) {
      throw error;
    }
  }

  async processWithdrawalOnBase(userId: number, dto: CryptoWithdrawalDto): Promise<string> {
    try {
      const platformPrivateKey = this.getPlatformPrivateKey('base') as string;
      const account = this.web3.eth.accounts.privateKeyToAccount(platformPrivateKey);
      const contract = new this.web3.eth.Contract(this.USDC_CONTRACT_ABI, this.BASE_USDC_TOKEN_ADDRESS);

      // Verify recipient address
      if (!isAddress(dto.address)) {
        throw new BadRequestException('Invalid recipient address')
      };

      // Initiate withdrawal from platform wallet
      const hash = await this.transferTokensOnBase(
        account.address,
        dto.address,
        dto.amount,
        contract,
        platformPrivateKey
      );

      // Update user balance and store transaction details
      await this.updateDbAfterTransaction(userId, dto.amount, 'WITHDRAWAL');

      return hash;
    } catch (error) {
      // Network congestion error check
      if (error.message.includes('transaction underpriced')) {
        throw new BadRequestException('The network is congested at the moment. Please try again later')
      };

      throw error;
    }
  }

  async processWithdrawalOnSolana(userId: number, dto: CryptoWithdrawalDto): Promise<string> {
    try {
      const sender = this.getPlatformPrivateKey('solana') as Keypair;
      const recipient = new PublicKey(dto.address);

      // Verify recipient address
      if (!PublicKey.isOnCurve(recipient)) {
        throw new BadRequestException('Invalid recipient address')
      };

      // Initiate withdrawal from platform wallet
      const signature = await this.transferTokensOnSolana(
        this.connection,
        sender,
        recipient,
        dto.amount
      );

      // Update user balance and store transaction details
      await this.updateDbAfterTransaction(userId, dto.amount, 'WITHDRAWAL');

      return signature;
    } catch (error) {
      throw error;
    }
  }

  async monitorDepositsOnBase(userId: number, address: string): Promise<void> {
    const web3 = new Web3(new Web3.providers.WebsocketProvider(selectRpcUrl('base', 'websocket')));

    web3.eth.subscribe('pendingTransactions', async (txHash: Bytes) => {
      try {
        const tx: Transaction = await web3.eth.getTransaction(txHash);

        if (tx && tx.to?.toLowerCase() === this.BASE_USDC_TOKEN_ADDRESS.toLowerCase()) {
          // Get recipient address and amount deposited
          const decodedData = web3.eth.abi.decodeParameters(['address', 'uint256'], tx.input.slice(10) as string);
          const recipient = decodedData[0] as string;
          const amount = web3.utils.fromWei(decodedData[1] as bigint, 'mwei');

          if (recipient.toLowerCase() === address.toLowerCase()) {
            // Update user balance and store transaction details
            const user = await this.updateDbAfterTransaction(userId, parseInt(amount), 'DEPOSIT');

            // Notify user of successful deposit
            const content = `${amount} has been deposited in your wallet. Your balance is ${user.balance}`
            await sendEmail(user, 'Deposit Complete', content);

            logger.info(`[${this.context}] Crypto deposit by ${user.email} was successful. Amount: ${amount}\n`);

            // Initiate transfer of tokens from user wallet to platform wallet
            const platformPrivateKey = this.getPlatformPrivateKey('base') as string;
            const account = web3.eth.accounts.privateKeyToAccount(platformPrivateKey);
            const contract = new web3.eth.Contract(this.USDC_CONTRACT_ABI, this.BASE_USDC_TOKEN_ADDRESS);            
            await this.transferTokensOnBase(
              address,
              account.address,
              parseInt(amount),
              contract,
              user.ethPrivateKey
            );

            return;
          }
        };
      } catch (error) {
        logger.error(`[${this.context}] An error occurred while monitoring deposits on ethereum wallet: ${address}. Error: ${error.message}\n`);
        throw error;
      }
    });
  }

  async monitorDepositsOnSolana(userId: number, address: string): Promise<void> {
    const connection = new Connection(selectRpcUrl('solana', 'websocket'), 'confirmed');
    // Get USDC token account address of the user's wallet
    const tokenAddress = await this.getTokenAccountAddress(new PublicKey(address));

    connection.onAccountChange(tokenAddress, async (accountInfo) => {
      try {
        const account = AccountLayout.decode(accountInfo.data);
        const amount = Number(account.amount) / 1e6;

        // Update user balance and store transaction details
        const user = await this.updateDbAfterTransaction(userId, amount, 'DEPOSIT');

        // Notify user of successful deposit
        const content = `${amount} has been deposited in your wallet. Your balance is ${user.balance}`
        await sendEmail(user, 'Deposit Complete', content);

        logger.info(`[${this.context}] Crypto deposit by ${user.email} was successful. Amount: ${amount}\n`);

        // Initiate transfer of tokens from user wallet to platform wallet

        return;
      } catch (error) {
        logger.error(`[${this.context}] An error occurred while monitoring deposits on solana wallet: ${address}. Error: ${error.message}\n`);
        throw error;
      }
    });
  }
}
