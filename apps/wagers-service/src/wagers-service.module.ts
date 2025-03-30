import { Module } from '@nestjs/common';
import { WagersServiceController } from './wagers-service.controller';
import { WagersServiceService } from './wagers-service.service';

@Module({
  imports: [],
  controllers: [WagersServiceController],
  providers: [WagersServiceService],
})
export class WagersServiceModule {}
