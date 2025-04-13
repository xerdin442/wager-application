import { NestFactory } from '@nestjs/core';
import { WagerModule } from './wager.module';
import { MicroserviceOptions, RpcException } from '@nestjs/microservices';
import { natsOptions } from '@app/utils';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    WagerModule,
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
