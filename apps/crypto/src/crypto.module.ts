import { Module } from '@nestjs/common';
import { CryptoController } from './crypto.controller';
import { CryptoService } from './crypto.service';

@Module({
  imports: [],
  controllers: [CryptoController],
  providers: [CryptoService],
})
export class CryptoModule {}
