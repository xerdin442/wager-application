import { Process, Processor } from "@nestjs/bull";
import { Job } from "bull";
import { sendEmail } from "../config/mail";
import logger from "../logger";

@Processor('mail-queue')
export class MailProcessor {
  private context = MailProcessor.name

  @Process('signup')
  async signupEmail(job: Job) {
    try {
      const subject = 'Welcome Onboard!'
      const content = 'Thanks for signing up'
      const receiver = job.data
  
      await sendEmail(receiver, subject, content)
    } catch (error) {
      logger.error(`[${this.context}] An error occured while processing ${job.name}, Job ID: ${job.id}.
        \n\t Error: ${error.message}`)

      throw error;
    }
  }
}
