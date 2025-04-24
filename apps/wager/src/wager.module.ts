import { Module } from '@nestjs/common';
import { WagerController } from './wager.controller';
import { WagerService } from './wager.service';
import { DbModule } from '@app/db';
import { MetricsModule } from '@app/metrics';
import { UtilsModule } from '@app/utils';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WagerProcessor } from './wager.processor';
import { WagerGateway } from './wager.gateway';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['./apps/wager/.env', './env'],
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
      name: 'wager-queue',
    }),
    DbModule,
    UtilsModule,
    MetricsModule,
  ],
  controllers: [WagerController],
  providers: [WagerService, WagerProcessor, WagerGateway],
})
export class WagerModule {}
