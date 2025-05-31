import { NestFactory } from '@nestjs/core';
import { WalletModule } from './wallet.module';
import { natsOptions } from '@app/utils';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, RpcException } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    WalletModule,
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
