import { DbService } from '@app/db';
import { MetricsService } from '@app/metrics';
import { UtilsService } from '@app/utils';
import { Processor, Process } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { User, Wager } from '@prisma/client';
import { Job } from 'bull';
import { WagerGateway } from './wager.gateway';
import { calculatePlatformFee } from './utils';

@Injectable()
@Processor('wager-queue')
export class WagerProcessor {
  private readonly context: string = WagerProcessor.name;

  constructor(
    private readonly prisma: DbService,
    private readonly metrics: MetricsService,
    private readonly utils: UtilsService,
    private readonly gateway: WagerGateway,
  ) {}

  @Process('settle-wager')
  async settleWager(job: Job<Record<string, number>>) {
    try {
      const { wagerId, userId, opponentId } = job.data;

      // Update wager status
      const wager = await this.prisma.wager.update({
        where: { id: wagerId },
        data: { status: 'SETTLED' },
      });

      // Subtract platform fee and add winnings to the claimant's balance
      const claimant = await this.prisma.user.update({
        where: { id: userId },
        data: {
          balance: {
            increment: wager.amount - calculatePlatformFee(wager.amount),
          },
        },
      });

      const opponent = (await this.prisma.user.findUnique({
        where: { id: opponentId },
      })) as User;

      // Notify the claimant and opponent via email
      const subject = 'Wager Settled';

      const claimantContent = `The 24-hour window for @${opponent.username} to accept or contest your claim in ${wager.title} wager has elapsed, and the wager has been settled in your favour. More wins, champ!`;
      await this.utils.sendEmail(claimant.email, subject, claimantContent);

      const opponentContent = `The 24-hour window to accept or contest @${claimant.username}'s claim in ${wager.title} wager has elapsed, and the wager has been settled in favour of @${claimant.username}. Better luck next time!`;
      await this.utils.sendEmail(opponent.email, subject, opponentContent);
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while claiming wager prize. Error: ${error.message}.\n`,
        );

      throw error;
    }
  }

  @Process('contest-wager')
  async contestWagerClaim(job: Job<Record<string, number>>) {
    try {
      const wager = (await this.prisma.wager.findUnique({
        where: { id: job.data.wagerId },
      })) as Wager;

      // Assign the resolution chat to the admin in this category
      const admins = await this.prisma.admin.findMany({
        where: {
          category: wager.category,
          NOT: { id: 1 }, // Excluding the super admin
        },
      });
      // Find the admin with the least number of active disputes
      const sortedAdmins = admins.sort((a, b) => a.disputes - b.disputes);
      const selectedAdmin = sortedAdmins[0];
      await this.prisma.admin.update({
        where: { id: selectedAdmin.id },
        data: { disputes: { increment: 1 } },
      });

      // Create dispute resolution chat
      const chat = await this.prisma.chat.create({
        data: {
          adminId: selectedAdmin.id,
          wagerId: wager.id,
          messages: {
            create: {
              author: 'Bot',
              content: `The prize claim in this wager was contested and this dispute resolution chat has been created to settle the contest.
                  An admin will be assigned to this chat shortly. Please ensure to have photos, videos, screenshots,
                  and any other evidence to support your claim as the winner of this wager. Goodluck!`,
            },
          },
        },
      });

      // Add the admin and wager players to the dispute chat
      await this.gateway.joinDisputeChat(chat.id, [
        selectedAdmin.id,
        wager.playerOne,
        wager.playerTwo as number,
      ]);

      // Update wager dispute metrics
      this.metrics.incrementCounter('wager_disputes', [
        wager.category.toLowerCase(),
      ]);

      return;
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while contesting wager claim. Error: ${error.message}.\n`,
        );

      throw error;
    }
  }
}
