import { Module } from '@nestjs/common';
import { FiatController } from './fiat.controller';
import { FiatService } from './fiat.service';

@Module({
  imports: [],
  controllers: [FiatController],
  providers: [FiatService],
})
export class FiatModule {}
