import { Injectable } from '@nestjs/common';
import { Connection, Keypair } from '@solana/web3.js';
import { selectRpcUrl } from '@src/common/util/crypto';
import Web3, { ContractAbi, Transaction } from 'web3';
import { hdkey } from '@ethereumjs/wallet';
import { CryptoWithdrawalDto } from './dto';
import { Secrets } from '@src/common/env';
import { DbService } from '@src/db/db.service';

@Injectable()
export class CryptoService {
  private readonly web3 = new Web3(selectRpcUrl('ethereum'));
  private readonly connection = new Connection(selectRpcUrl('solana'), 'confirmed');
  private readonly USDT_ABI: ContractAbi = [
    {
      name: 'transfer',
      type: 'function',
      constant: false,
      inputs: [
        { name: '_to', type: 'address' },
        { name: '_value', type: 'unit256' }
      ],
      outputs: [{ name: '', type: 'bool' }]
    }
  ];
  private readonly USDT_CONTRACT_ADDRESS = '';
  private readonly USDC_MINT_ADDRESS = '';

  constructor(private readonly prisma: DbService) { };

  createEthereumWallet(): { address: string, privateKey: string } {
    const accounts = this.web3.eth.accounts.wallet.create(1);
    return { ...accounts[0] };
  }

  createSolanaWallet(): string {
    return Keypair.generate().publicKey.toBase58();
  }

  getETHPrivateKeyFromMnemonic(mnemonic: string): string {
    const wallet = hdkey.EthereumHDKey.fromMnemonic(mnemonic);
    return wallet.getWallet().getPrivateKeyString();
  }

  async processUSDTWithdrawal(userId: number, dto: CryptoWithdrawalDto): Promise<string> {
    try {
      const platformPrivateKey = this.getETHPrivateKeyFromMnemonic(Secrets.PLATFORM_WALLET_RECOVERY_PHRASE);
      const account = this.web3.eth.accounts.privateKeyToAccount(platformPrivateKey);
      const contract = new this.web3.eth.Contract(this.USDT_ABI, this.USDT_CONTRACT_ADDRESS);

      // Verify recipient address

      // Get gas price estimate based on recent transactions on the network
      const gasPrice = await this.web3.eth.getGasPrice();
      // Convert USD amount to smallest unit of USDT
      const amount = this.web3.utils.toBigInt(dto.amount * 1e6) - gasPrice;
      // Encode the transaction for the transfer function using the ABI
      const data = contract.methods.transfer(dto.address, amount.toString()).encodeABI();
      // Configure transaction details
      const tx: Transaction = {
        from: account.address,
        to: this.USDT_CONTRACT_ADDRESS,
        gasPrice,
        gasLimit: 60000,
        data
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

      throw error;
    }
  }
}
