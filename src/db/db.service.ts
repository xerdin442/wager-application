import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import logger from '../common/logger';

@Injectable()
export class DbService extends PrismaClient {
  private context = DbService.name;

  constructor(config: ConfigService) {
    super({
      datasources: {
        db: { url: config.get<string>('DATABASE_URL') }
      }
    })
  }

  async cleanDb() {
    return this.$transaction([
      this.bookmark.deleteMany(),
      this.user.deleteMany()
    ])
    .then(() => logger.info(`[${this.context}] Database cleaned up for tests.\n`))
    .catch(error => logger.error(`[${this.context}] An error occurred while cleaning database. Error: ${error.message}.\n`));
  }
}
