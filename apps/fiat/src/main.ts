import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { natsOptions } from '@app/utils';
import { FiatModule } from './fiat.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    FiatModule,
    natsOptions as MicroserviceOptions,
  );

  await app.listen();
}

void bootstrap();
