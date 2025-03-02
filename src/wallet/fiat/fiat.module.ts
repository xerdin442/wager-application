import { Module } from '@nestjs/common';
import { FiatService } from './fiat.service';
import { FiatController } from './fiat.controller';

@Module({
  providers: [FiatService],
  controllers: [FiatController]
})
export class FiatModule {}
