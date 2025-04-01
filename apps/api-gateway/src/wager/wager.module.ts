import { Module } from '@nestjs/common';
import { WagerController } from './wager.controller';

@Module({
  controllers: [WagerController],
})
export class WagerModule {}
