import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { Secrets } from '@src/common/env';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from '@src/common/strategy/jwt-strategy';

@Module({
  imports: [
    JwtModule.register({
      secret: Secrets.JWT_SECRET,
      signOptions: { expiresIn: '1h' }
    }),
  ],
  controllers: [AdminController],
  providers: [
    AdminService,
    JwtStrategy
  ]
})
export class AdminModule { }
