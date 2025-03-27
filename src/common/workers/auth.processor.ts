import { Injectable } from "@nestjs/common";
import { Process, Processor } from "@nestjs/bull";
import { Job } from "bull";
import { sendEmail } from "../config/mail";
import logger from "../logger";
import { CryptoService } from "@src/wallet/crypto/crypto.service";

@Injectable()
@Processor('auth-queue')
export class AuthProcessor {
  private context = AuthProcessor.name

  constructor(private readonly cryptoService: CryptoService) { };

  @Process('signup')
  async signup(job: Job) {
    try {
      const receiver = job.data
      const subject = 'Welcome Onboard!'
      const content = 'Thanks for signing up'

      await sendEmail(receiver, subject, content);
    } catch (error) {
      logger.error(`[${this.context}] An error occured while processing onboarding email. Error: ${error.message}\n`);
      throw error;
    }
  }

  @Process('otp')
  async passwordReset(job: Job) {
    try {
      const receiver = job.data
      const subject = 'Password Reset'
      const content = `This is your OTP: ${receiver.otp}. It is valid for one hour.`

      await sendEmail(receiver, subject, content);
    } catch (error) {
      logger.error(`[${this.context}] An error occured while processing otp email. Error: ${error.message}\n`);
      throw error;
    }
  }

  @Process('wallet-setup')
  async cryptoSetup(job: Job) {
    try {
      const { user } = job.data;

      // Subscribe to wallet activity to check for deposits
      await this.cryptoService.monitorDepositsOnBase(user.id, user.ethAddress);
      await this.cryptoService.monitorDepositsOnSolana(user.id, user.solAddress);

      // Prefill wallets with gas fees
      await this.cryptoService.prefillUserWallet(user.id, user.ethAddress, 'base');
      await this.cryptoService.prefillUserWallet(user.id, user.solAddress, 'solana');

      return;
    } catch (error) {
      logger.error(`[${this.context}] An error occured while processing setup of user wallet. Error: ${error.message}\n`);
      throw error;
    }
  }
}
