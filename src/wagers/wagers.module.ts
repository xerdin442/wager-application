import { Module } from '@nestjs/common';
import { WagersController } from './wagers.controller';
import { WagersService } from './wagers.service';

@Module({
  controllers: [WagersController],
  providers: [WagersService]
})
export class WagersModule {}
