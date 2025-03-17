import { Global, Module } from '@nestjs/common';
import { WalletGateway } from './wallet.gateway';

@Global()
@Module({
  providers: [WalletGateway],
  exports: [WalletGateway]
})
export class WalletModule {}
