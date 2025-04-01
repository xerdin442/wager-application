import { DbService } from '@app/db';
import { MetricsService } from '@app/metrics';
import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Queue } from 'bull';
import { SessionService } from './session';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: DbService,
    private readonly jwt: JwtService,
    private readonly sessionService: SessionService,
    private readonly metrics: MetricsService,
    @InjectQueue('auth-queue') private readonly authQueue: Queue,
  ) {}
}
