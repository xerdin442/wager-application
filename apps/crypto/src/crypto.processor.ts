import { Process, Processor } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Job } from 'bull';
import { Chain } from './types';
import { CryptoService } from './crypto.service';
import { UtilsService } from '@app/utils';
import { User } from '@prisma/client';

@Injectable()
@Processor('crypto-queue')
export class CryptoProcessor {
  private context = CryptoProcessor.name;

  constructor(
    private readonly cryptoService: CryptoService,
    private readonly utils: UtilsService,
  ) {}

  @Process('check-balance')
  async checkBalance(job: Job<Record<string, Chain>>): Promise<void> {
    try {
      await this.cryptoService.checkStablecoinBalance(job.data.chain);
    } catch (error) {
      throw error;
    }
  }

  @Process('withdrawal-mail')
  async notifyUser(job: Job<Record<string, any>>): Promise<void> {
    try {
      const { user, amount, status } = job.data;
      const date: string = new Date().toISOString();
      let subject: string = '';
      let content: string = '';

      if (status === 'success') {
        subject = 'Withdrawal Successful';
        content = `Your withdrawal of ${amount}USDC on ${date} was successful. Your balance is ${user.balance}USDC`;
      } else if (status === 'failed') {
        subject = 'Failed Withdrawal';
        content = `Your withdrawal of ${amount}USDC on ${date} was unsuccessful. Please try again later.`;
      }

      await this.utils.sendEmail(user as User, subject, content);
    } catch (error) {
      throw error;
    }
  }
}
