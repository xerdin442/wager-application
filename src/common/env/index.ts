import { ConfigService } from "@nestjs/config";

const config = new ConfigService();

export const Secrets = {
  NODE_ENV: process.env.NODE_ENV,
  PORT: config.getOrThrow<number>('PORT'),
  DATABASE_URL: config.getOrThrow<string>('DATABASE_URL'),
  JWT_SECRET: config.getOrThrow<string>('JWT_SECRET'),
  CLOUD_NAME: config.getOrThrow<string>('CLOUD_NAME'),
  CLOUD_API_SECRET: config.getOrThrow<string>('CLOUD_API_SECRET'),
  CLOUD_API_KEY: config.getOrThrow<string>('CLOUD_API_KEY'),
  DEFAULT_IMAGE: config.getOrThrow<string>('DEFAULT_IMAGE'),
  REDIS_PORT: config.getOrThrow<number>('REDIS_PORT'),
  REDIS_HOST: config.getOrThrow<string>('REDIS_HOST'),
  REDIS_PASSWORD: config.getOrThrow<string>('REDIS_PASSWORD'),
  REDIS_URL: config.getOrThrow<string>('REDIS_URL'),
  BREVO_API_KEY: config.getOrThrow<string>('BREVO_API_KEY'),
  APP_NAME: config.getOrThrow<string>('APP_NAME'),
  APP_EMAIL: config.getOrThrow<string>('APP_EMAIL'),
  RATE_LIMITING_PER_SECOND: config.getOrThrow<number>('RATE_LIMITING_PER_SECOND'),
  RATE_LIMITING_PER_MINUTE: config.getOrThrow<number>('RATE_LIMITING_PER_MINUTE'),
  PAYSTACK_SECRET_KEY: config.getOrThrow<string>('PAYSTACK_SECRET_KEY'),
  SESSION_STORE_INDEX: config.getOrThrow<number>('SESSION_STORE_INDEX'),
  QUEUE_STORE_INDEX: config.getOrThrow<number>('QUEUE_STORE_INDEX'),
  IDEMPOTENCY_KEYS_STORE_INDEX: config.getOrThrow<number>('IDEMPOTENCY_KEYS_STORE_INDEX'),
  WITHDRAWAL_DETAILS_STORE_INDEX: config.getOrThrow<number>('WITHDRAWAL_DETAILS_STORE_INDEX'),
  EXCHANGE_RATE_API_KEY: config.getOrThrow<string>('EXCHANGE_RATE_API_KEY'),
  COINGECKO_API_KEY: config.getOrThrow<string>('COINGECKO_API_KEY'),
  HELIUS_API_KEY: config.getOrThrow<string>('HELIUS_API_KEY'),
  ALCHEMY_API_KEY: config.getOrThrow<string>('ALCHEMY_API_KEY'),
  PLATFORM_WALLET_RECOVERY_PHRASE: config.getOrThrow<string>('PLATFORM_WALLET_RECOVERY_PHRASE'),
}