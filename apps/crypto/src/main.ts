import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { natsOptions } from '@app/utils';
import { CryptoModule } from './crypto.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    CryptoModule,
    natsOptions as MicroserviceOptions,
  );

  await app.listen();
}

void bootstrap();
