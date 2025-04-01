import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { natsOptions } from '@app/utils';
import { AuthModule } from './auth.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AuthModule,
    natsOptions as MicroserviceOptions,
  );

  await app.listen();
}

void bootstrap();
