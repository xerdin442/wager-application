import { Injectable } from '@nestjs/common';
import { createLogger, format, Logger, transports } from 'winston';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { EmailAttachment } from './types';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class UtilsService {
  private readonly context: string = UtilsService.name;

  constructor(private readonly config: ConfigService) {}

  logger(): Logger {
    let logger: Logger;
    const NODE_ENV = this.config.getOrThrow<string>('NODE_ENV');
    const { combine, timestamp, label, printf } = format;

    const myFormat = printf(({ level, message, timestamp, label }) => {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      return `${timestamp} ${label} ${level} ${message}`;
    });

    const newLogger = (env: string): Logger => {
      return createLogger({
        level: 'debug',
        format: combine(
          format.colorize(),
          label({ label: env }),
          timestamp(),
          myFormat,
        ),
        transports: [
          new transports.File({
            filename: 'error.log',
            level: 'error',
            dirname: './logs',
          }),
          new transports.File({ filename: 'combined.log', dirname: './logs' }),
          new transports.Console(),
        ],
      });
    };

    if (NODE_ENV === 'production') {
      logger = newLogger('PROD');
    } else if (NODE_ENV === 'development') {
      logger = newLogger('DEV');
    } else if (NODE_ENV === 'test') {
      logger = newLogger('TEST');
    } else {
      logger = newLogger('DEFAULT');
    }

    return logger;
  }

  async sendEmail(
    receiver: Record<string, any>,
    subject: string,
    content: string,
    attachment?: EmailAttachment[],
  ): Promise<void> {
    try {
      // Generate HTML from email content
      const $ = cheerio.load(content);
      const htmlContent = $.html();

      const data = {
        sender: {
          name: this.config.getOrThrow<string>('APP_NAME'),
          email: this.config.getOrThrow<string>('APP_EMAIL'),
        },
        to: [
          {
            email: `${receiver.email}`,
            name: `${receiver?.firstName ?? receiver?.name}`,
          },
        ],
        subject,
        htmlContent,
        attachment,
      };

      const url = 'https://api.brevo.com/v3/smtp/email';
      await axios.post(url, data, {
        headers: {
          accept: 'application/json',
          'api-key': this.config.getOrThrow<string>('BREVO_API_KEY'),
          'content-type': 'application/json',
        },
      });

      this.logger().info(
        `[${this.context}] "${subject}" email sent successfully to ${receiver.email}.\n`,
      );
    } catch (error) {
      this.logger().error(
        `[${this.context}] An error occured while sending "${subject}" email to ${receiver.email}. Error: ${error.message}\n`,
      );
      throw error;
    }
  }

  async connectToRedis(
    url: string,
    context: string,
    index: number,
  ): Promise<RedisClientType> {
    const redis: RedisClientType = createClient({
      url,
      database: index,
    });

    try {
      await redis.connect();
      this.logger().info(`[${context}] Successfully connected to Redis\n`);

      return redis;
    } catch (error) {
      this.logger().error(
        `[${context}] Redis connection error: ${error.message}\n`,
      );
      throw error;
    }
  }

  async upload() {}
}
