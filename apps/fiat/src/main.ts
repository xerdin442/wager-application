import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, RpcException } from '@nestjs/microservices';
import { natsOptions } from '@app/utils';
import { FiatModule } from './fiat.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    FiatModule,
    natsOptions as MicroserviceOptions,
  );

  app.useGlobalPipes(
    new ValidationPipe({
      exceptionFactory: (errors) => new RpcException(errors),
    }),
  );

  await app.listen();
}

void bootstrap();
