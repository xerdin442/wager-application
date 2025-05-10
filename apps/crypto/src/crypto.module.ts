import { Module } from '@nestjs/common';
import { CryptoController } from './crypto.controller';
import { CryptoService } from './crypto.service';
import { DbModule } from '@app/db';
import { MetricsModule } from '@app/metrics';
import { UtilsModule } from '@app/utils';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CryptoGateway } from './crypto.gateway';
import { BullModule } from '@nestjs/bull';
import { CryptoProcessor } from './crypto.processor';
import * as fs from 'fs';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [
        () => {
          try {
            const keyPhrase = fs.readFileSync(
              'run/secrets/platform_wallet_keyphrase',
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
      envFilePath: ['./apps/crypto/.env', './env'],
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
      name: 'crypto-queue',
    }),
    DbModule,
    UtilsModule,
    MetricsModule,
  ],
  controllers: [CryptoController],
  providers: [CryptoService, CryptoGateway, CryptoProcessor],
})
export class CryptoModule {}
