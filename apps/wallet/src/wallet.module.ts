import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { DbModule } from '@app/db';
import { MetricsModule } from '@app/metrics';
import { UtilsModule } from '@app/utils';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WalletGateway } from './wallet.gateway';
import { BullModule } from '@nestjs/bull';
import { WalletProcessor } from './wallet.processor';
import { EthWeb3Provider, SolanaWeb3Provider } from './providers';
import { HelperService } from './utils/helper';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['./apps/wallet/.env', './env'],
    }),
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        redis: {
          family: 0,
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
          db: config.getOrThrow<number>('QUEUE_STORE_INDEX'),
          password: config.getOrThrow<string>('REDIS_PASSWORD'),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'wallet-queue',
    }),
    DbModule,
    UtilsModule,
    MetricsModule,
  ],
  controllers: [WalletController],
  providers: [
    WalletService,
    WalletGateway,
    WalletProcessor,
    EthWeb3Provider,
    SolanaWeb3Provider,
    HelperService,
  ],
})
export class WalletModule {}
