import { ConfigService } from "@nestjs/config";

export const Secrets = {
  NODE_ENV: process.env.NODE_ENV,
  PORT: new ConfigService().getOrThrow<number>('PORT'),
  DATABASE_PASSWORD: new ConfigService().getOrThrow<string>('DATABASE_PASSWORD'),
  DATABASE_NAME: new ConfigService().getOrThrow<string>('DATABASE_NAME'),
  DATABASE_URL: new ConfigService().getOrThrow<string>('DATABASE_URL'),
  JWT_SECRET: new ConfigService().getOrThrow<string>('JWT_SECRET'),
  CLOUD_NAME: new ConfigService().getOrThrow<string>('CLOUD_NAME'),
  CLOUD_API_SECRET: new ConfigService().getOrThrow<string>('CLOUD_API_SECRET'),
  CLOUD_API_KEY: new ConfigService().getOrThrow<string>('CLOUD_API_KEY'),
  DEFAULT_IMAGE: new ConfigService().getOrThrow<string>('DEFAULT_IMAGE'),
  REDIS_PORT: new ConfigService().getOrThrow<number>('REDIS_PORT'),
  REDIS_HOST: new ConfigService().getOrThrow<string>('REDIS_HOST'),
  REDIS_PASSWORD: new ConfigService().getOrThrow<string>('REDIS_PASSWORD'),
  REDIS_URL: new ConfigService().getOrThrow<string>('REDIS_URL'),
  BREVO_API_KEY: new ConfigService().getOrThrow<string>('BREVO_API_KEY'),
  APP_NAME: new ConfigService().getOrThrow<string>('APP_NAME'),
  APP_EMAIL: new ConfigService().getOrThrow<string>('APP_EMAIL'),
  SESSION_SECRET: new ConfigService().getOrThrow<string>('SESSION_SECRET'),
  RATE_LIMITING_PER_SECOND: new ConfigService().getOrThrow<number>('RATE_LIMITING_PER_SECOND'),
  RATE_LIMITING_PER_MINUTE: new ConfigService().getOrThrow<number>('RATE_LIMITING_PER_MINUTE'),
  SESSION_STORE_INDEX: new ConfigService().getOrThrow<number>('SESSION_STORE_INDEX'),
  QUEUE_STORE_INDEX: new ConfigService().getOrThrow<number>('QUEUE_STORE_INDEX')
}