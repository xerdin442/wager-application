import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import logger from './common/logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.enableCors();
  app.use(helmet());
  app.use("trust proxy")
  app.setGlobalPrefix('/api');
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true
  }));
  
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0', () => console.log('Nginx works!'));
  logger.info(`Application is running on port ${process.env.PORT ?? 3000}\n`)
}
bootstrap();
