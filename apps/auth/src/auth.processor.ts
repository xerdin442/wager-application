import { Inject, Injectable } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { UtilsService } from '@app/utils';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
@Processor('auth-queue')
export class AuthProcessor {
  private context = AuthProcessor.name;

  constructor(
    private readonly utils: UtilsService,
    @Inject('CRYPTO_SERVICE') private readonly natsClient: ClientProxy,
  ) {}

  @Process('signup')
  async signup(job: Job<Record<string, any>>): Promise<void> {
    try {
      const receiver = job.data;
      const subject = 'Welcome Onboard!';
      const content = 'Thanks for signing up';

      await this.utils.sendEmail(receiver, subject, content);
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
  async passwordReset(job: Job<Record<string, any>>): Promise<void> {
    try {
      const receiver = job.data;
      const subject = 'Password Reset';
      const content = `This is your OTP: ${receiver.otp}. It is valid for one hour.`;

      await this.utils.sendEmail(receiver, subject, content);
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occured while processing otp email. Error: ${error.message}\n`,
        );
      throw error;
    }
  }

  // @Process('wallet-setup')
  // async walletSetup(job: Job<Record<string, any>>): Promise<void> {
  //   try {
  //     const { user } = job.data;
  //     return;
  //   } catch (error) {
  //     this.utils
  //       .logger()
  //       .error(
  //         `[${this.context}] An error occured while processing setup of user wallet. Error: ${error.message}\n`,
  //       );

  //     throw error;
  //   }
  // }
}
