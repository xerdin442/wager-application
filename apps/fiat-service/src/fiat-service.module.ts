import { Module } from '@nestjs/common';
import { FiatServiceController } from './fiat-service.controller';
import { FiatServiceService } from './fiat-service.service';

@Module({
  imports: [],
  controllers: [FiatServiceController],
  providers: [FiatServiceService],
})
export class FiatServiceModule {}
