import { Process, Processor } from "@nestjs/bull";
import { Injectable } from "@nestjs/common";
import { DbService } from "@src/db/db.service";
import { Job } from "bull";
import { sendEmail } from "../config/mail";
import logger from "../logger";

@Injectable()
@Processor('wagers-queue')
export class WagersProcessor {
  private readonly context: string = WagersProcessor.name;

  constructor(private readonly prisma: DbService) {};

  @Process('claim-wager')
  async claimWager(job: Job) {
    try {
      const { wagerId, userId, opponentId } = job.data;

      // Update wager status
      const wager = await this.prisma.wager.update({
        where: { id: wagerId },
        data: { status: 'SETTLED' }
      });

      // Add wager prize amount to claimant balance
      const claimant = await this.prisma.user.update({
        where: { id: userId },
        data: { balance: { increment: wager.amount } }
      });
      const opponent = await this.prisma.user.findUnique({
        where: { id: opponentId }
      });

      // Notify the claimant via email
      const claimantSubject = 'Wager Settled';
      const claimantContent = `The 24-hour deadline for @${opponent.username} to accept or contest your claim in ${wager.title} wager has elapsed, and the wager has been settled in your favour. More wins, champ!`;
      await sendEmail(claimant, claimantSubject, claimantContent);

      // Notify the opponent via email
      const opponentSubject = 'Wager Settled';
      const opponentContent = `The 24-hour deadline to accept or contest @${claimant.username}'s claim in ${wager.title} wager has elapsed, and the wager has been settled in favour of @${claimant.username}. Better luck next time!`;
      await sendEmail(opponent, opponentSubject, opponentContent);
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while claiming wager prize. Error: ${error.message}.\n`);
      throw error;
    }
  }

  @Process('contest-wager')
  async contestWagerClaim(job: Job) {
    try {
      const wager = await this.prisma.wager.findUnique({
        where: { id: job.data.wagerId }
      });

      // Assign the resolution chat to the admin in this category with the least number of active disputes
      const admins = await this.prisma.admin.findMany({
        where: { category: wager.category },
      });
      const sortedAdminsList = admins.sort((a, b) => a.disputes - b.disputes);
      const selectedAdmin = sortedAdminsList[0];
      await this.prisma.admin.update({
        where: { id: selectedAdmin.id },
        data: { disputes: { increment: 1 } }
      });

      // Create dispute resolution chat
      await this.prisma.chat.create({
        data: {
          adminId: selectedAdmin.id,
          wagerId: wager.id,
          messages: {
            create: {
              author: 'Bot',
              content: 'The prize claim in this wager was contested and a dispute resolution chat has been created to settle the contest. An admin will be assigned to this chat shortly. Please ensure to have photos, videos, screenshots, and any other evidence to support your claim as the winner of this wager. Goodluck!'
            }
          }
        }
      });
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while contesting wager claim. Error: ${error.message}.\n`);
      throw error;
    }
  }
}