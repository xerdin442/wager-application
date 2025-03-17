import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { DbModule } from './db/db.module';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bull';
import { Secrets } from './common/env';
import { MetricsModule } from './metrics/metrics.module';
import { WagersModule } from './wagers/wagers.module';
import { CryptoModule } from './wallet/crypto/crypto.module';
import { FiatModule } from './wallet/fiat/fiat.module';
import { AdminModule } from './admin/admin.module';
import { WalletModule } from './wallet/wallet.module';

@Module({
  imports: [
    AuthModule,
    UserModule,
    DbModule,
    MetricsModule,
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      redis: {
        host: Secrets.REDIS_HOST,
        port: Secrets.REDIS_PORT,
        db: Secrets.QUEUE_STORE_INDEX,
        password: Secrets.REDIS_PASSWORD,
        family: 0
      }
    }),
    ThrottlerModule.forRoot([{
      name: 'Seconds',
      ttl: 1000,
      limit: Secrets.RATE_LIMITING_PER_SECOND
    }, {
      name: 'Minutes',
      ttl: 60000,
      limit: Secrets.RATE_LIMITING_PER_MINUTE
    }]),
    WagersModule,
    CryptoModule,
    FiatModule,
    AdminModule,
    WalletModule,
  ],

  providers: [{
    provide: APP_GUARD,
    useClass: ThrottlerGuard
  }]
})
export class AppModule { }
