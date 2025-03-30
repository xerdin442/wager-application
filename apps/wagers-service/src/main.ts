import { NestFactory } from '@nestjs/core';
import { WagersServiceModule } from './wagers-service.module';

async function bootstrap() {
  const app = await NestFactory.create(WagersServiceModule);
  await app.listen(process.env.port ?? 3001);
}
void bootstrap();
