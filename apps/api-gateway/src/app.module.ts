import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DbModule } from '@app/db';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { NatsModule, UtilsModule } from '@app/utils';
import { WagerModule } from './wager/wager.module';
import { WalletModule } from './wallet/wallet.module';
import { MetricsModule } from '@app/metrics';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'Minutes',
            ttl: 60_000,
            limit: config.getOrThrow<number>('RATE_LIMIT_PER_MINUTE'),
          },
          {
            name: 'Seconds',
            ttl: 1000,
            limit: config.getOrThrow<number>('RATE_LIMIT_PER_SECOND'),
          },
        ],
      }),
      inject: [ConfigService],
    }),
    DbModule,
    NatsModule,
    UtilsModule,
    MetricsModule,
    WagerModule,
    WalletModule,
    AuthModule,
    AdminModule,
    UserModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  controllers: [AppController],
})
export class AppModule {}
