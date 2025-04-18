import { Process, Processor } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Job } from 'bull';
import { Chain } from './types';
import { CryptoService } from './crypto.service';

@Injectable()
@Processor('crypto-queue')
export class CryptoProcessor {
  private context = CryptoProcessor.name;

  constructor(private readonly cryptoService: CryptoService) {}

  @Process('check-balance')
  async checkBalance(job: Job<Record<string, Chain>>): Promise<void> {
    await this.cryptoService.checkStablecoinBalance(job.data.chain);
  }
}
