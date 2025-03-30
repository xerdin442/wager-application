import { NestFactory } from '@nestjs/core';
import { FiatServiceModule } from './fiat-service.module';

async function bootstrap() {
  const app = await NestFactory.create(FiatServiceModule);
  await app.listen(process.env.port ?? 3002);
}
void bootstrap();
