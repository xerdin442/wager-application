import { BadRequestException, Injectable } from '@nestjs/common';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { selectRpcUrl, selectUSDCTokenAddress } from '@src/common/util/crypto';
import Web3, { ContractAbi, Transaction } from 'web3';
import { hdkey } from '@ethereumjs/wallet';
import { CryptoWithdrawalDto } from './dto';
import { Secrets } from '@src/common/env';
import { DbService } from '@src/db/db.service';
import { isAddress } from 'web3-validator';
import { getOrCreateAssociatedTokenAccount, transfer } from '@solana/spl-token';

@Injectable()
export class CryptoService {
  private readonly web3 = new Web3(selectRpcUrl('base'));
  private readonly connection = new Connection(selectRpcUrl('solana'), 'confirmed');
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
  private readonly SOLANA_USDC_TOKEN_ADDRESS = selectUSDCTokenAddress('solana');

  constructor(private readonly prisma: DbService) { };

  createEthereumWallet(): { address: string, privateKey: string } {
    const account = this.web3.eth.accounts.create();
    return { ...account };
  }

  createSolanaWallet(): string {
    return Keypair.generate().publicKey.toBase58();
  }

  getPlatformPrivateKey(chain: 'base' | 'solana'): string | Keypair {
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
      const payer = this.getPlatformPrivateKey('solana') as Keypair;
      const account = await getOrCreateAssociatedTokenAccount(
        this.connection,
        payer,
        new PublicKey(this.SOLANA_USDC_TOKEN_ADDRESS),
        owner,
        true
      );

      return account.address;
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

      // Get gas price estimate based on recent transactions on the network
      const gasPrice = await this.web3.eth.getGasPrice();
      // Convert USD amount to smallest unit of USDC
      const amount = this.web3.utils.toBigInt(dto.amount * 1e6) - gasPrice;
      // Encode the transaction for the transfer function using the ABI
      const data = contract.methods.transfer(dto.address, amount.toString()).encodeABI();
      // Get the current nonce
      const nonce = await this.web3.eth.getTransactionCount(account.address, 'pending');

      // Configure transaction details
      const tx: Transaction = {
        from: account.address,
        to: this.BASE_USDC_TOKEN_ADDRESS,
        gasPrice,
        gas: 60000,
        data,
        nonce
      }

      // Sign and broadcast the transaction to the network
      const signedTx = await this.web3.eth.accounts.signTransaction(tx, platformPrivateKey);
      const receipt = await this.web3.eth.sendSignedTransaction(signedTx.rawTransaction);

      // Update user balance
      await this.prisma.user.update({
        where: { id: userId },
        data: { balance: { decrement: dto.amount } }
      });

      // Store transaction details
      await this.prisma.transaction.create({
        data: {
          amount: dto.amount,
          method: 'CRYPTO',
          type: 'WITHDRAWAL',
          status: 'SUCCESS',
          userId
        }
      });

      return receipt.transactionHash.toString();
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

      // Get token accounts of the platform wallet and recipient address
      const senderAddress = await this.getTokenAccountAddress(sender.publicKey);
      const receiverAddress = await this.getTokenAccountAddress(new PublicKey(dto.address));

      const signature = await transfer(
        this.connection,
        sender,
        senderAddress,
        receiverAddress,
        sender.publicKey,
        dto.amount * 1e6
      );

      // Update user balance
      await this.prisma.user.update({
        where: { id: userId },
        data: { balance: { decrement: dto.amount } }
      });

      // Store transaction details
      await this.prisma.transaction.create({
        data: {
          amount: dto.amount,
          method: 'CRYPTO',
          type: 'WITHDRAWAL',
          status: 'SUCCESS',
          userId
        }
      });      

      return signature;
    } catch (error) {
      throw error;
    }
  }
}
