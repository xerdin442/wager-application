import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { AuthProcessor } from './auth.processor';
import { SessionService } from './session';
import { JwtModule } from '@nestjs/jwt';
import { DbModule } from '@app/db';
import { MetricsModule } from '@app/metrics';
import { NatsModule, UtilsModule } from '@app/utils';

const config = new ConfigService();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['./apps/auth/.env', './env'],
    }),
    BullModule.forRoot({
      redis: {
        family: 0,
        host: config.getOrThrow<string>('REDIS_HOST'),
        port: config.getOrThrow<number>('REDIS_PORT'),
        db: config.getOrThrow<number>('QUEUE_STORE_INDEX'),
        password: config.getOrThrow<string>('REDIS_PASSWORD'),
      },
    }),
    BullModule.registerQueue({
      name: 'auth-queue',
    }),
    JwtModule.register({
      secret: config.getOrThrow<string>('JWT_SECRET'),
      signOptions: { expiresIn: '1h' },
    }),
    DbModule,
    NatsModule,
    UtilsModule,
    MetricsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthProcessor, SessionService],
})
export class AuthModule {}
