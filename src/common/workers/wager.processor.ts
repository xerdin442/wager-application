import { Process, Processor } from "@nestjs/bull";
import { Injectable } from "@nestjs/common";
import { DbService } from "@src/db/db.service";
import { Job } from "bull";
import { sendEmail } from "../config/mail";

@Injectable()
@Processor('wagers-queue')
export class WagersProcessor {
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
      const claimantContent = `The 24-hour deadline for -username- to accept or contest your claim in ${wager.title} wager has elapsed, and the wager has been settled in your favour. More wins, champ!`;
      await sendEmail(claimant, claimantSubject, claimantContent);

      // Notify the opponent via email
      const opponentSubject = 'Wager Settled';
      const opponentContent = `The 24-hour deadline to accept or contest -username- claim in ${wager.title} wager has elapsed, and the wager has been settled in favour of -username-. Better luck next time!`;
      await sendEmail(opponent, opponentSubject, opponentContent);
    } catch (error) {
      throw error;
    }
  }
}