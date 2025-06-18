// import { UtilsService } from '@app/utils';
// import { WalletGateway } from '../src/wallet.gateway';
import { WalletService } from '../src/wallet.service';
import { DbService } from '@app/db';
// import { MetricsService } from '@app/metrics';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { ConfigService } from '@nestjs/config';
import { TestingModule, Test } from '@nestjs/testing';
import { hdkey } from '@ethereumjs/wallet';
import { HelperService } from '../src/utils/helper';
import { Chain, Transaction, User } from '@prisma/client';
import { USDCTokenAddress } from '../src/utils/constants';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import Web3, { Bytes } from 'web3';
import {
  ETH_WEB3_PROVIDER_TOKEN,
  SOL_WEB3_PROVIDER_TOKEN,
} from '../src/providers';
import { NameRegistryState } from '@bonfida/spl-name-service';
import { DepositDTO, WithdrawalDTO } from '../src/dto';

describe('Wallet Service', () => {
  let walletService: WalletService;
  // let gateway: DeepMocked<WalletGateway>;
  let config: DeepMocked<ConfigService>;
  let helper: DeepMocked<HelperService>;
  let web3: DeepMocked<Web3>;
  let connection: DeepMocked<Connection>;
  // let utils: DeepMocked<UtilsService>;
  let prisma: DeepMocked<DbService>;
  // let metrics: DeepMocked<MetricsService>;

  const user: User = {
    id: 1,
    email: 'user@example.com',
    firstName: 'Cristiano',
    lastName: 'Ronaldo',
    password: 'Password',
    username: 'goat_cr7',
    createdAt: new Date(),
    updatedAt: new Date(),
    profileImage: 'default-image-url',
    twoFASecret: null,
    twoFAEnabled: false,
    balance: 0,
  };

  const associatedTokenAddress: PublicKey = new PublicKey(
    USDCTokenAddress.SOLANA_DEVNET,
  );

  const keypair = {
    secretKey: new Uint8Array([1, 2, 3]),
  } as unknown as Keypair;

  const depositDto: DepositDTO = {
    amount: 150,
    chain: 'BASE',
    depositor: 'user-wallet-address',
    txIdentifier: 'signature-or-hash',
  };

  const withdrawalDto: WithdrawalDTO = {
    ...depositDto,
    address: 'user-wallet-address',
  };

  const transaction: Transaction = {
    id: 1,
    amount: 150,
    chain: 'BASE',
    retries: 0,
    status: 'PENDING',
    txIdentifier: null,
    type: 'WITHDRAWAL',
    userId: user.id,
    createdAt: new Date(),
  };

  beforeAll(async () => {
    config = createMock<ConfigService>();
    helper = createMock<HelperService>();
    web3 = createMock<Web3>();
    connection = createMock<Connection>();

    // Mock all required environment variables
    config.getOrThrow.mockImplementation((key: string) => {
      if (key === 'PLATFORM_WALLET_KEYPHRASE')
        return 'platform-wallet-keyphrase';
      if (key === 'NODE_ENV') return 'test';
      if (key === 'COINGECKO_API_KEY') return 'coingecko-api-key';
      if (key === 'SUPER_ADMIN_EMAIL') return 'super-admin-email';
      if (key === 'PLATFORM_SOLANA_WALLET') return 'platform-solana-wallet';
      if (key === 'PLATFORM_ETHEREUM_WALLET') return 'platform-ethereum-wallet';

      return undefined;
    });

    // Mock the helper service methods
    helper.selectUSDCTokenAddress.mockImplementation((chain: Chain) => {
      if (chain === 'BASE') {
        return USDCTokenAddress.BASE_SEPOLIA;
      } else {
        return USDCTokenAddress.SOLANA_DEVNET;
      }
    });
    helper.getTokenAccountAddress.mockResolvedValue(associatedTokenAddress);
    helper.transferTokensOnSolana.mockResolvedValue('confirmed-tx-signature');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: ETH_WEB3_PROVIDER_TOKEN,
          useValue: web3,
        },
        {
          provide: SOL_WEB3_PROVIDER_TOKEN,
          useValue: connection,
        },
      ],
    })
      .useMocker((token) => {
        if (token === ConfigService) return config;
        if (token === HelperService) return helper;

        return createMock(token);
      })
      .compile();

    walletService = module.get<WalletService>(WalletService);
    // gateway = module.get(WalletGateway);
    // utils = module.get(UtilsService);
    config = module.get(ConfigService);
    prisma = module.get(DbService);
    // metrics = module.get(MetricsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Platform Wallet Private Key', () => {
    it('should return the private key of the platform ethereum wallet', () => {
      jest.spyOn(hdkey.EthereumHDKey, 'fromMnemonic').mockReturnValue({
        getWallet: jest.fn().mockReturnValue({
          getPrivateKeyString: jest
            .fn()
            .mockReturnValue('ethereum-private-key'),
        }),
      } as unknown as hdkey.EthereumHDKey);

      const response = walletService.getPlatformWalletPrivateKey('BASE');
      expect(response).toEqual('ethereum-private-key');
    });

    it('should return the keypair of the platform solana wallet', () => {
      jest.spyOn(Keypair, 'fromSecretKey').mockReturnValue(keypair);

      const response = walletService.getPlatformWalletPrivateKey('SOLANA');
      expect(response).toEqual(keypair);
    });
  });

  describe('Resolve Domain', () => {
    it('should return null if ENS domain is invalid or unregistered', async () => {
      (web3.eth.ens.getAddress as jest.Mock).mockRejectedValue(
        new Error('Invalid or unregistered ENS domain'),
      );

      const response = walletService.resolveDomainName('BASE', 'invalid.eth');
      await expect(response).resolves.toBeNull();
    });

    it('should return null if resolved ethereum address is a zero address', async () => {
      const bytes = {
        toString: jest
          .fn()
          .mockReturnValue('0x0000000000000000000000000000000000000000'),
      } as unknown as Bytes;

      (web3.eth.ens.getAddress as jest.Mock).mockResolvedValue(bytes);

      const response = walletService.resolveDomainName('BASE', 'zero.eth');
      await expect(response).resolves.toBeNull();
    });

    it('should resolve a valid or registered ENS domain', async () => {
      const bytes = {
        toString: jest
          .fn()
          .mockReturnValue('0x742d35Cc6634C0539F35Df2dFc2A53f4c7fEeD57'),
      } as unknown as Bytes;

      (web3.eth.ens.getAddress as jest.Mock).mockResolvedValue(bytes);

      const response = walletService.resolveDomainName('BASE', 'xerdin.eth');
      await expect(response).resolves.toEqual(bytes.toString());
    });

    it('should return null if the SNS domain is invalid or unregistered', async () => {
      jest
        .spyOn(NameRegistryState, 'retrieve')
        .mockRejectedValue(new Error('Invalid or unregistered SNS domain'));

      const response = walletService.resolveDomainName('SOLANA', 'invalid.sol');
      await expect(response).resolves.toBeNull();
    });

    it('should resolve a valid or registered SNS domain', async () => {
      const registry = {
        owner: new PublicKey('11111111111111111111111111111111'),
      } as unknown as NameRegistryState;

      jest.spyOn(NameRegistryState, 'retrieve').mockResolvedValue({
        registry,
        nftOwner: null,
      });

      const response = walletService.resolveDomainName('SOLANA', 'xerdin.sol');
      await expect(response).resolves.toEqual(registry.owner.toBase58());
    });
  });

  describe('Initiate Transaction', () => {
    it('should initiate a deposit transasction', async () => {
      const tx: Transaction = {
        ...transaction,
        type: 'DEPOSIT',
        txIdentifier: depositDto.txIdentifier,
      };

      (prisma.transaction.create as jest.Mock).mockResolvedValue(tx);

      const response = walletService.initiateTransaction(user.id, depositDto);
      await expect(response).resolves.toEqual(tx);
    });

    it('should initiate a withdrawal transasction', async () => {
      (prisma.transaction.create as jest.Mock).mockResolvedValue(transaction);

      const response = walletService.initiateTransaction(
        user.id,
        withdrawalDto,
      );
      await expect(response).resolves.toEqual(transaction);
    });
  });
});
