import { HttpStatus, Injectable } from '@nestjs/common';
import { WalletGateway } from './wallet.gateway';
import { DbService } from '@app/db';
import { MetricsService } from '@app/metrics';
import { UtilsService } from '@app/utils';
import { ConfigService } from '@nestjs/config';
import Web3 from 'web3';
import { selectRpcUrl, selectUSDCTokenAddress } from './utils/helper';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { RpcException } from '@nestjs/microservices';
import { Chain, Transaction, User } from '@prisma/client';
import { hdkey } from '@ethereumjs/wallet';
import { EthereumHDKey } from '@ethereumjs/wallet/dist/cjs/hdkey';
import { getDomainKeySync, NameRegistryState } from '@bonfida/spl-name-service';
import { getAssociatedTokenAddress } from '@solana/spl-token';

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

  async updateDbAfterTransaction(details: Transaction): Promise<User> {
    try {
      let user: User | undefined;
      const { status, type, userId, amount, txHash } = details;

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

      // Store new or update existing transaction records
      await this.prisma.transaction.upsert({
        where: { txHash },
        update: { status },
        create: { ...details },
      });

      return user as User;
    } catch (error) {
      throw error;
    }
  }
}
