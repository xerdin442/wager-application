import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { DbModule } from './db/db.module';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bull';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { Secrets } from './common/env';

@Module({
  imports: [
    AuthModule,
    UserModule,
    DbModule,
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      redis: {
        host: Secrets.REDIS_HOST,
        port: Secrets.REDIS_PORT,
        db: Secrets.QUEUE_STORE_INDEX,
        password: Secrets.REDIS_PASSWORD
      }
    }),
    PrometheusModule.register({
      global: true,
      defaultLabels: { app: Secrets.APP_NAME }
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
  ],

  providers: [{
    provide: APP_GUARD,
    useClass: ThrottlerGuard
  }]
})
export class AppModule { }
