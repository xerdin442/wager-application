import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { natsOptions } from '@app/utils';
import { AdminModule } from './admin.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AdminModule,
    natsOptions as MicroserviceOptions,
  );

  await app.listen();
}

void bootstrap();
