import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import * as fs from 'fs';
import { DbModule } from '@app/db';
import { MetricsModule } from '@app/metrics';
import { UtilsModule } from '@app/utils';
import { ConfigModule } from '@nestjs/config';
import { WalletGateway } from './wallet.gateway';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [
        () => {
          try {
            const keyPhrase = fs.readFileSync(
              'run/secrets/platform_wallet_keyphrase',
            );
            return { PLATFORM_WALLET_KEYPHRASE: keyPhrase.toString().trim() };
          } catch (error) {
            console.warn(
              `Platform wallet secret file not found. Error: ${error.message}`,
            );

            return { PLATFORM_WALLET_KEYPHRASE: null };
          }
        },
      ],
      isGlobal: true,
      envFilePath: ['./apps/wallet/.env', './env'],
    }),
    DbModule,
    UtilsModule,
    MetricsModule,
  ],
  controllers: [WalletController],
  providers: [WalletService, WalletGateway],
})
export class WalletModule {}
