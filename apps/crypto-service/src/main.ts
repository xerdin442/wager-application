import { NestFactory } from '@nestjs/core';
import { CryptoServiceModule } from './crypto-service.module';

async function bootstrap() {
  const app = await NestFactory.create(CryptoServiceModule);
  await app.listen(process.env.port ?? 3003);
}
void bootstrap();
