import { Module } from '@nestjs/common';
import { FiatController } from './fiat.controller';
import { FiatService } from './fiat.service';
import { DbModule } from '@app/db';
import { MetricsModule } from '@app/metrics';
import { UtilsModule } from '@app/utils';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FiatProcessor } from './fiat.processor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['./apps/fiat/.env', './env'],
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
      name: 'fiat-queue',
    }),
    DbModule,
    UtilsModule,
    MetricsModule,
  ],
  controllers: [FiatController],
  providers: [FiatService, FiatProcessor],
})
export class FiatModule {}
