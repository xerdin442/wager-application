import { BadRequestException, Injectable } from '@nestjs/common';
import { Wager } from '@prisma/client';
import { DbService } from '@src/db/db.service';
import { CreateWagerDto } from './dto';
import { randomUUID } from 'crypto';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { sendEmail } from '@src/common/config/mail';

@Injectable()
export class WagersService {
  constructor(
    private readonly prisma: DbService,
    @InjectQueue('wagers-queue') private readonly wagersQueue: Queue
  ) { };

  async createWager(userId: number, dto: CreateWagerDto): Promise<Wager> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId }
      });

      // Check if user has sufficient funds to stake in the wager
      if (dto.stake > user.balance) {
        throw new BadRequestException('Insufficient balance')
      };

      // Create new wager
      const wager = await this.prisma.wager.create({
        data: {
          ...dto,
          amount: dto.stake * 2,
          inviteCode: randomUUID().split('-')[3],
          playerOne: userId
        }
      });

      // Update user balance
      await this.prisma.user.update({
        where: { id: userId },
        data: { balance: { decrement: dto.stake } }
      });

      return wager;
    } catch (error) {
      throw error;
    }
  }

  async findWagerByInviteCode(inviteCode: string): Promise<Wager> {
    try {
      return this.prisma.wager.findUnique({
        where: { inviteCode }
      });
    } catch (error) {
      throw error;
    }
  }

  async joinWager(userId: number, wagerId: number): Promise<string> {
    try {
      const wager = await this.prisma.wager.findUnique({
        where: { id: wagerId }
      });
      if (wager.playerOne === userId) {
        throw new BadRequestException('The creator of a wager cannot join the wager. Please invite another user')
      };
      if (wager.playerOne && wager.playerTwo) {
        throw new BadRequestException('This wager cannot have more than two players')
      };

      const user = await this.prisma.user.findUnique({
        where: { id: userId }
      });
      const stake = wager.amount / 2
      // Check if user has sufficient funds to stake and join the wager
      if (stake > user.balance) {
        throw new BadRequestException('Insufficient balance')
      };

      // Update wager status
      await this.prisma.wager.update({
        where: { id: wagerId },
        data: {
          playerTwo: userId,
          status: 'ACTIVE'
        }
      });

      // Update user balance after joining wager
      await this.prisma.user.update({
        where: { id: userId },
        data: { balance: { decrement: stake } }
      });

      return wager.title;
    } catch (error) {
      throw error;
    }
  }

  async getWagerDetails(wagerId: number): Promise<Wager> {
    try {
      return this.prisma.wager.findUnique({
        where: { id: wagerId }
      });
    } catch (error) {
      throw error;
    }
  }

  async claimWager(userId: number, wagerId: number): Promise<void> {
    try {
      const wager = await this.prisma.wager.findUnique({
        where: { id: wagerId }
      });
      if (wager.status === 'SETTLED') {
        throw new BadRequestException('This wager has already been settled!')
      };
      if (wager.playerOne !== userId || wager.playerTwo !== userId) {
        throw new BadRequestException('A prize claim can only be made by any of the two players in this wager')
      };

      const claimant = await this.prisma.user.findUnique({
        where: { id: userId }
      });

      let opponentId: number;
      wager.playerOne === userId ? opponentId = wager.playerTwo : opponentId = wager.playerOne;
      const opponent = await this.prisma.user.findUnique({
        where: { id: opponentId }
      });

      // Store the claimant as the winner temporarily until the opponent takes action within 24 hours
      await this.prisma.wager.update({
        where: { id: wagerId },
        data: { winner: userId }
      });

      // Notify the opponent via email
      const subject = 'Accept or Contest Claim';
      const content = `-username- has claimed the prize in the ${wager.title} wager. Accepting the claim means that you accept defeat and forfeit the prize. Contesting the claim means that you disagree and the claim will be settled through dispute resolution.`;
      await sendEmail(opponent, subject, content);

      // Automatically settle the wager after 24 hours if the opponent takes no action
      await this.wagersQueue.add(
        'claim-wager',
        { wagerId, userId, opponentId },
        {
          jobId: `wager-${wagerId}`,
          delay: 24 * 60 * 60 * 1000
        }
      );

      return;
    } catch (error) {
      throw error;
    }
  }

  async acceptWagerClaim(wagerId: number): Promise<void> {
    try {
      const wager = await this.prisma.wager.findUnique({
        where: { id: wagerId }
      });
      if (wager.status === 'SETTLED') {
        throw new BadRequestException('This wager has already been settled!')
      };
      await this.wagersQueue.removeJobs(`wager-${wagerId}`);
      
      await this.prisma.wager.update({
        where: { id: wagerId },
        data: { status: 'SETTLED' }
      });

      // Update winner's balance
      await this.prisma.user.update({
        where: { id: wager.winner },
        data: { balance: { increment: wager.amount } }
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async contestWagerClaim(userId: number, wagerId: number): Promise<void> {
    try {
    } catch (error) {
      throw error;
    }
  }

  async deleteWager(wagerId: number): Promise<void> {
    try {
    } catch (error) {
      throw error;
    }
  }
}
