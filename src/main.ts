import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import logger from './common/logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.enableCors();
  app.use(helmet());
  app.setGlobalPrefix('/api');
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true
  }));
  
  await app.listen(process.env.PORT ?? 3000);

  logger.info(`Nest application is running on port ${process.env.PORT ?? 3000}`)
}
bootstrap();
