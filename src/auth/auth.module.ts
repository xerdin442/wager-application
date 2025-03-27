import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from '@src/common/strategy/jwt-strategy';
import { BullModule } from '@nestjs/bull';
import { AuthProcessor } from '@src/common/workers/auth.processor';
import { SessionService } from '@src/common/session';
import { Secrets } from '@src/common/env';

@Module({
  imports: [
    JwtModule.register({
      secret: Secrets.JWT_SECRET,
      signOptions: { expiresIn: '1h' }
    }),
    BullModule.registerQueue({
      name: 'auth-queue'
    })
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    AuthProcessor,
    SessionService
  ]
})
export class AuthModule {}
