import { UtilsService } from '@app/utils';
import { WalletGateway } from '../src/wallet.gateway';
import { WalletService } from '../src/wallet.service';
import { DbService } from '@app/db';
import { MetricsService } from '@app/metrics';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { ConfigService } from '@nestjs/config';
import { TestingModule, Test } from '@nestjs/testing';

describe('Wallet Service', () => {
  let walletService: WalletService;
  let gateway: DeepMocked<WalletGateway>;
  let config: DeepMocked<ConfigService>;
  let utils: DeepMocked<UtilsService>;
  let prisma: DeepMocked<DbService>;
  let metrics: DeepMocked<MetricsService>;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WalletService],
    })
      .useMocker(createMock)
      .compile();

    walletService = module.get<WalletService>(WalletService);
    gateway = module.get(WalletGateway);
    utils = module.get(UtilsService);
    config = module.get(ConfigService);
    prisma = module.get(DbService);
    metrics = module.get(MetricsService);
  });
});
