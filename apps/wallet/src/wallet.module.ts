import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import * as fs from 'fs';
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
      load: [
        () => {
          try {
            const keyPhrase = fs.readFileSync(
              '/run/secrets/platform_wallet_keyphrase',
            );
            return { PLATFORM_WALLET_KEYPHRASE: keyPhrase.toString().trim() };
          } catch (error) {
            console.warn(
              `Platform wallet secret file not found. Error: ${error.message}`,
            );

            return { PLATFORM_WALLET_KEYPHRASE: null };
          }
        },
      ],
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
