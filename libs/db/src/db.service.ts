import { UtilsService } from '@app/utils';
import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class DbService extends PrismaClient {
  private context = DbService.name;

  constructor(private readonly utils: UtilsService) {
    super({
      datasources: {
        db: { url: process.env.DATABASE_URL as string },
      },
    });
  }

  async cleanDb() {
    try {
      await this.$transaction([
        this.message.deleteMany(),
        this.chat.deleteMany(),
        this.wager.deleteMany(),
        this.transaction.deleteMany(),
        this.admin.deleteMany(),
        this.user.deleteMany(),
      ]);

      const users = await this.user.findMany();
      console.log('All Users: ', users);

      this.utils
        .logger()
        .info(`[${this.context}] Database cleaned up for tests.\n`);
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while cleaning database. Error: ${error.message}.\n`,
        );
      throw error;
    }
  }
}
