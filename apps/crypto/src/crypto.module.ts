import { Module } from '@nestjs/common';
import { CryptoController } from './crypto.controller';
import { CryptoService } from './crypto.service';
import { DbModule } from '@app/db';
import { MetricsModule } from '@app/metrics';
import { UtilsModule } from '@app/utils';
import { ConfigModule } from '@nestjs/config';
import { CryptoGateway } from './crypto.gateway';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['./apps/crypto/.env', './env'],
    }),
    DbModule,
    UtilsModule,
    MetricsModule,
  ],
  controllers: [CryptoController],
  providers: [CryptoService, CryptoGateway],
})
export class CryptoModule {}
