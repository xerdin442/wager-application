import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, RpcException } from '@nestjs/microservices';
import { natsOptions } from '@app/utils';
import { ValidationPipe } from '@nestjs/common';
import { UserModule } from './user.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    UserModule,
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
