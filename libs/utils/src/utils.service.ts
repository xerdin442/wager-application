import { Injectable } from '@nestjs/common';
import { createLogger, format, Logger, transports } from 'winston';
import * as cheerio from 'cheerio';
import { SerializedBuffer } from './types';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { Attachment, Resend } from 'resend';

@Injectable()
export class UtilsService {
  private readonly context: string = UtilsService.name;

  constructor(private readonly config: ConfigService) {}

  logger(): Logger {
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

    let logger: Logger = newLogger('DEFAULT');
    switch (NODE_ENV) {
      case 'production':
        logger = newLogger('PROD');
        break;
      case 'development':
        logger = newLogger('DEV');
        break;
      case 'test':
        logger = newLogger('TEST');
        break;

      default:
        break;
    }

    return logger;
  }

  async sendEmail(
    receiver: string,
    subject: string,
    content: string,
    attachments?: Attachment[],
  ): Promise<void> {
    // Generate HTML from email content
    const $ = cheerio.load(content);
    const htmlContent = $.html();

    // Initialize Resend client
    const resend = new Resend(
      this.config.getOrThrow<string>('RESEND_EMAIL_API_KEY'),
    );

    // Send email to receiver
    const response = await resend.emails.send({
      from: `${this.config.getOrThrow<string>('APP_NAME')} <${this.config.getOrThrow<string>('APP_EMAIL')}>`,
      subject,
      to: receiver,
      html: htmlContent,
      attachments,
    });

    if (response.data) {
      this.logger().info(
        `[${this.context}] "${subject}" email sent successfully to ${receiver}.\n`,
      );
      return;
    }
    if (response.error) {
      this.logger().error(
        `[${this.context}] An error occured while sending "${subject}" email to ${receiver}. Error: ${response.error.message}\n`,
      );
      return;
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

  async upload(file: Express.Multer.File, folder: string): Promise<string> {
    try {
      const key = `${folder}/${Date.now()}-${file.originalname}`;
      const bucketName = this.config.getOrThrow<string>('AWS_S3_BUCKET_NAME');
      const fileUrl = `https://${bucketName}.s3.amazonaws.com/${key}`;
      const buffer = Buffer.from(
        (file.buffer as unknown as SerializedBuffer).data,
      );

      // Initialize AWS S3 client
      const s3 = new S3Client({
        region: this.config.getOrThrow<string>('AWS_REGION'),
        credentials: {
          accessKeyId: this.config.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
          secretAccessKey: this.config.getOrThrow<string>(
            'AWS_SECRET_ACCESS_KEY',
          ),
        },
      });

      // Upload file to S3 bucket
      await s3.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: Readable.from(buffer),
          ContentLength: buffer.length,
        }),
      );

      this.logger().info(`[${this.context}] File uploaded successfully.\n`);

      return fileUrl;
    } catch (error) {
      this.logger().error(`[${this.context}] File upload unsuccessful.\n`);
      throw error;
    }
  }
}
