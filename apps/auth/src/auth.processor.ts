import { Injectable } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { UtilsService } from '@app/utils';

@Injectable()
@Processor('auth-queue')
export class AuthProcessor {
  private context = AuthProcessor.name;

  constructor(private readonly utils: UtilsService) {}

  @Process('signup')
  async signup(job: Job<Record<string, string>>): Promise<void> {
    try {
      const { email } = job.data;
      const subject = 'Welcome Onboard!';
      const content = 'Thanks for signing up';

      await this.utils.sendEmail(email, subject, content);
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
  async passwordReset(job: Job<{ email: string; otp: string }>): Promise<void> {
    try {
      const { email, otp } = job.data;
      const subject = 'Password Reset';
      const content = `This is your OTP: ${otp}. It is valid for one hour.`;

      await this.utils.sendEmail(email, subject, content);
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occured while processing otp email. Error: ${error.message}\n`,
        );
      throw error;
    }
  }
}
