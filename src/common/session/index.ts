import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, RedisClientType } from "redis";
import logger from "../logger";

export type SessionData = {
  email?: string
  otp?: string
  otpExpiration?: number
}

@Injectable()
export class SessionService {
  private readonly redis: RedisClientType;
  private readonly context = SessionService.name;

  constructor(config: ConfigService) {
    this.redis = createClient({
      url: config.get<string>('REDIS_URL'),
      database: 1
    });

    this.redis.connect()
      .then(() => logger.info('Application is connected to Redis\n'))
      .catch(error => {
        logger.error(`[${this.context}] Redis connection error: ${error.message}\n`);
        throw error;
      })
  }

  async set(key: string, value: SessionData): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value));
      logger.info(`[${this.context}] Session data updated by ${key}.\n`);
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while updating session data. Error: ${error.message}.\n`);
      throw error;
    }
  }

  async get(key: string): Promise<any> {
    try {
      const data = await this.redis.get(key);
      logger.info(`[${this.context}] User session retrieved by ${key}.\n`);

      return JSON.parse(data);
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while retrieving session data. Error: ${error.message}.\n`);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      logger.info(`[${this.context}] User session deleted by ${key}.\n`);
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while deleting user session. Error: ${error.message}.\n`);
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      await this.redis.flushAll();
      logger.info(`[${this.context}] Session store cleared for tests.\n`);
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while clearing session store. Error: ${error.message}.\n`);
      throw error;
    }
  }
}