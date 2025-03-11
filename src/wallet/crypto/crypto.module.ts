import { Global, Module } from '@nestjs/common';
import { CryptoController } from './crypto.controller';
import { CryptoService } from './crypto.service';

@Global()
@Module({
  exports: [CryptoService],
  controllers: [CryptoController],
  providers: [CryptoService]
})
export class CryptoModule {}
