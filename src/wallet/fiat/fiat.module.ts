import { Global, Module } from '@nestjs/common';
import { FiatService } from './fiat.service';
import { FiatController } from './fiat.controller';
import { BullModule } from '@nestjs/bull';
import { FiatProcessor } from '@src/common/workers/fiat.processor';

@Global()
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'fiat-queue'
    })
  ],
  providers: [
    FiatService,
    FiatProcessor
  ],
  exports: [FiatService],
  controllers: [FiatController]
})
export class FiatModule {}
