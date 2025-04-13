import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, RpcException } from '@nestjs/microservices';
import { natsOptions } from '@app/utils';
import { CryptoModule } from './crypto.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    CryptoModule,
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
