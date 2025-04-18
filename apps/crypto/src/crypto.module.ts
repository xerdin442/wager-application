import { Module } from '@nestjs/common';
import { CryptoController } from './crypto.controller';
import { CryptoService } from './crypto.service';
import { DbModule } from '@app/db';
import { MetricsModule } from '@app/metrics';
import { UtilsModule } from '@app/utils';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CryptoGateway } from './crypto.gateway';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    ConfigModule.forRoot({
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
  providers: [CryptoService, CryptoGateway],
})
export class CryptoModule {}
