import { Module } from '@nestjs/common';
import { CryptoController } from './crypto.controller';

@Module({
  controllers: [CryptoController],
})
export class CryptoModule {}
