import { NestFactory } from '@nestjs/core';
import { WagerModule } from './wager.module';
import { MicroserviceOptions } from '@nestjs/microservices';
import { natsOptions } from '@app/utils';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    WagerModule,
    natsOptions as MicroserviceOptions,
  );

  await app.listen();
}

void bootstrap();
