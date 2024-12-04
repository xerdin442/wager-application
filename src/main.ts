import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import logger from './common/logger';
import { RedisStore } from 'connect-redis';
import * as redis from 'redis'
import * as session from 'express-session';

async function bootstrap() {
  // Create Nest application instance
  const app = await NestFactory.create(AppModule);
  
  app.enableCors();
  app.use(helmet());
  app.setGlobalPrefix('/api');
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true
  }));
  
  // Configure and connect to Redis database
  const redisClient = redis.createClient({
    url: `${process.env.REDIS_URL}`,
    database: 1
  });
  redisClient.on('connect', () => logger.info('Application is connected to Redis'));
  redisClient.on('error', err => logger.error(`Redis error: ${err.message}`));
  await redisClient.connect();

  // Session configuration
  app.use(session({
    store: new RedisStore({ client: redisClient, prefix: 'sessions' }),
    secret: process.env.SESSION_SECRET,
    cookie: { maxAge: 60 * 60 * 1000, secure: false },
    resave: false,
    saveUninitialized: false
  }))

  await app.listen(process.env.PORT ?? 3000);
  logger.info(`Application is running on port ${process.env.PORT ?? 3000}`)
}
bootstrap();
