import { Inject, Injectable } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { UtilsService } from '@app/utils';
import { ClientProxy } from '@nestjs/microservices';
import { User } from '@prisma/client';

@Injectable()
@Processor('auth-queue')
export class AuthProcessor {
  private context = AuthProcessor.name;

  constructor(
    private readonly utils: UtilsService,
    @Inject('CRYPTO_SERVICE') private readonly natsClient: ClientProxy,
  ) {}

  @Process('signup')
  async signup(job: Job<Record<string, User>>): Promise<void> {
    try {
      const { user } = job.data;
      const subject = 'Welcome Onboard!';
      const content = 'Thanks for signing up';

      await this.utils.sendEmail(user, subject, content);
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occured while processing onboarding email. Error: ${error.message}\n`,
        );
      throw error;
    }
  }

  @Process('otp')
  async passwordReset(job: Job<{ user: User; otp: string }>): Promise<void> {
    try {
      const { user, otp } = job.data;
      const subject = 'Password Reset';
      const content = `This is your OTP: ${otp}. It is valid for one hour.`;

      await this.utils.sendEmail(user, subject, content);
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occured while processing otp email. Error: ${error.message}\n`,
        );
      throw error;
    }
  }

  @Process('setup-wallet')
  setupWallet(job: Job<Record<string, User>>): void {
    try {
      const { user } = job.data;

      // Subscribe to wallet activity to check for deposits
      this.natsClient.send('monitor-deposit', { user, chain: 'base' });
      this.natsClient.send('monitor-deposit', { user, chain: 'solana' });

      // Prefill user wallets with gas fees for transactions
      this.natsClient.send('prefill', { user, chain: 'base' });
      this.natsClient.send('prefill', { user, chain: 'solana' });

      return;
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occured while processing setup of user wallet. Error: ${error.message}\n`,
        );

      throw error;
    }
  }
}
