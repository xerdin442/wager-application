import { Module } from '@nestjs/common';
import { FiatController } from './fiat.controller';

@Module({
  controllers: [FiatController],
})
export class FiatModule {}
