import { Module } from '@nestjs/common';
import { CryptoServiceController } from './crypto-service.controller';
import { CryptoServiceService } from './crypto-service.service';

@Module({
  imports: [],
  controllers: [CryptoServiceController],
  providers: [CryptoServiceService],
})
export class CryptoServiceModule {}
