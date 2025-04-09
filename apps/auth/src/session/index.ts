import { Injectable, OnModuleInit } from '@nestjs/common';
import { RedisClientType } from 'redis';
import { SessionData } from '../types';
import { UtilsService } from '@app/utils';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SessionService implements OnModuleInit {
  private readonly context = SessionService.name;
  private redis: RedisClientType;

  constructor(
    private readonly utils: UtilsService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    this.redis = await this.utils.connectToRedis(
      this.config.getOrThrow<string>('REDIS_URL'),
      this.context,
      this.config.getOrThrow<number>('SESSION_STORE_INDEX'),
    );
  }

  async set(key: string, value: SessionData): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value));
      this.utils
        .logger()
        .info(`[${this.context}] Session data updated by ${key}.\n`);
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while updating session data. Error: ${error.message}.\n`,
        );
      throw error;
    }
  }

  async get(key: string): Promise<SessionData> {
    try {
      const data = await this.redis.get(key);
      this.utils
        .logger()
        .info(`[${this.context}] User session retrieved by ${key}.\n`);

      const result = JSON.parse(data as string) as SessionData;
      return result;
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while retrieving session data. Error: ${error.message}.\n`,
        );
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      this.utils
        .logger()
        .info(`[${this.context}] User session deleted by ${key}.\n`);
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while deleting user session. Error: ${error.message}.\n`,
        );
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      await this.redis.flushAll();
      this.utils
        .logger()
        .info(`[${this.context}] Session store cleared for tests.\n`);
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while clearing session store. Error: ${error.message}.\n`,
        );
      throw error;
    }
  }
}
