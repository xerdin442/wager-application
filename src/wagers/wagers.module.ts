import { Module } from '@nestjs/common';
import { WagersController } from './wagers.controller';
import { WagersService } from './wagers.service';
import { BullModule } from '@nestjs/bull';
import { WagersProcessor } from '@src/common/workers/wager.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'wagers-queue'
    })
  ],
  controllers: [WagersController],
  providers: [
    WagersService,
    WagersProcessor
  ]
})
export class WagersModule { }
