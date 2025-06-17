// import { UtilsService } from '@app/utils';
// import { WalletGateway } from '../src/wallet.gateway';
import { WalletService } from '../src/wallet.service';
// import { DbService } from '@app/db';
// import { MetricsService } from '@app/metrics';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { ConfigService } from '@nestjs/config';
import { TestingModule, Test } from '@nestjs/testing';
import { hdkey } from '@ethereumjs/wallet';
import { HelperService } from '../src/utils/helper';
import { Chain } from '@prisma/client';
import { ChainRPC, USDCTokenAddress } from '../src/utils/constants';
import { Keypair } from '@solana/web3.js';

describe('Wallet Service', () => {
  let walletService: WalletService;
  // let gateway: DeepMocked<WalletGateway>;
  let config: DeepMocked<ConfigService>;
  let helper: DeepMocked<HelperService>;
  // let utils: DeepMocked<UtilsService>;
  // let prisma: DeepMocked<DbService>;
  // let metrics: DeepMocked<MetricsService>;

  beforeAll(async () => {
    config = createMock<ConfigService>();
    helper = createMock<HelperService>();

    // Mock all required environment variables
    config.getOrThrow.mockImplementation((key: string) => {
      if (key === 'PLATFORM_WALLET_KEYPHRASE')
        return 'platform-wallet-keyphrase';
      if (key === 'NODE_ENV') return 'test';
      if (key === 'ALCHEMY_API_KEY') return 'alchemy-api-key';
      if (key === 'HELIUS_API_KEY') return 'helius-api-key';
      if (key === 'COINGECKO_API_KEY') return 'coingecko-api-key';
      if (key === 'SUPER_ADMIN_EMAIL') return 'super-admin-email';
      if (key === 'PLATFORM_SOLANA_WALLET') return 'platform-solana-wallet';
      if (key === 'PLATFORM_ETHEREUM_WALLET') return 'platform-ethereum-wallet';

      return undefined;
    });

    // Mock the helper function calls in the service constructor
    helper.selectRpcUrl.mockImplementation((chain: Chain) => {
      if (chain === 'BASE') {
        return ChainRPC.BASE_SEPOLIA;
      } else {
        return ChainRPC.SOLANA_DEVNET;
      }
    });
    helper.selectUSDCTokenAddress.mockImplementation((chain: Chain) => {
      if (chain === 'BASE') {
        return USDCTokenAddress.BASE_SEPOLIA;
      } else {
        return USDCTokenAddress.SOLANA_DEVNET;
      }
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [WalletService],
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
    // prisma = module.get(DbService);
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
      const keypair = {
        secretKey: new Uint8Array([1, 2, 3]),
      };

      jest
        .spyOn(Keypair, 'fromSecretKey')
        .mockReturnValue(keypair as unknown as Keypair);

      const response = walletService.getPlatformWalletPrivateKey('SOLANA');
      expect(response).toEqual(keypair);
    });
  });
});
