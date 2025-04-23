import { DbService } from '@app/db';
import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Wager, Message, User } from '@prisma/client';
import { Queue } from 'bull';
import { randomUUID } from 'crypto';
import { CreateWagerDto, UpdateWagerDto, WagerInviteDto } from './dto';
import { RpcException } from '@nestjs/microservices';
import { UtilsService } from '@app/utils';

@Injectable()
export class WagerService {
  constructor(
    private readonly prisma: DbService,
    private readonly utils: UtilsService,
    @InjectQueue('wager-queue') private readonly wagersQueue: Queue,
  ) {}

  async createWager(userId: number, dto: CreateWagerDto): Promise<Wager> {
    try {
      const user = (await this.prisma.user.findUnique({
        where: { id: userId },
      })) as User;

      // Check if stake is less than the mininmum
      if (dto.stake < 1) {
        throw new RpcException({
          status: 400,
          message: 'Minimum stake is $1',
        });
      }
      // Check if user has sufficient funds to stake in the wager
      if (dto.stake > user.balance) {
        throw new RpcException({
          status: 400,
          message: 'Insufficient balance',
        });
      }

      // Create new wager
      const wager = await this.prisma.wager.create({
        data: {
          ...dto,
          amount: dto.stake * 2,
          inviteCode: randomUUID().split('-')[3],
          playerOne: userId,
        },
      });

      // Update user balance
      await this.prisma.user.update({
        where: { id: userId },
        data: { balance: { decrement: dto.stake } },
      });

      return wager;
    } catch (error) {
      throw error;
    }
  }

  async updateWager(
    userId: number,
    wagerId: number,
    dto: UpdateWagerDto,
  ): Promise<void> {
    try {
      const wager = (await this.prisma.wager.findUnique({
        where: { id: wagerId },
      })) as Wager;

      if (wager.playerOne !== userId) {
        throw new RpcException({
          status: 400,
          message: 'Details of a wager can only be modified by its creator',
        });
      }
      if (wager.status === 'ACTIVE') {
        throw new RpcException({
          status: 400,
          message: 'Details of an active wager cannot be modified',
        });
      }
      if (wager.status === 'PENDING') {
        await this.prisma.wager.update({
          where: { id: wagerId },
          data: { ...dto },
        });

        return;
      }
    } catch (error) {
      throw error;
    }
  }

  async findWagerByInviteCode(dto: WagerInviteDto): Promise<Wager> {
    try {
      const wager = await this.prisma.wager.findUnique({
        where: { ...dto },
      });

      if (!wager) {
        throw new RpcException({
          status: 400,
          message: 'Invalid wager invite code',
        });
      }

      return wager;
    } catch (error) {
      throw error;
    }
  }

  async joinWager(userId: number, wagerId: number): Promise<string> {
    try {
      const wager = (await this.prisma.wager.findUnique({
        where: { id: wagerId },
      })) as Wager;

      if (wager.playerOne === userId) {
        throw new RpcException({
          status: 400,
          message:
            'The creator of a wager cannot join the wager. Please invite another user',
        });
      }
      if (wager.playerOne && wager.playerTwo) {
        throw new RpcException({
          status: 400,
          message: 'This wager cannot have more than two players',
        });
      }

      const user = (await this.prisma.user.findUnique({
        where: { id: userId },
      })) as User;

      // Check if user has sufficient funds to stake and join the wager
      const stake = wager.amount / 2;
      if (stake > user.balance) {
        throw new RpcException({
          status: 400,
          message: 'Insufficient balance',
        });
      }

      // Update wager status
      await this.prisma.wager.update({
        where: { id: wagerId },
        data: {
          playerTwo: userId,
          status: 'ACTIVE',
        },
      });

      // Update user balance after joining wager
      await this.prisma.user.update({
        where: { id: userId },
        data: { balance: { decrement: stake } },
      });

      return wager.title;
    } catch (error) {
      throw error;
    }
  }

  async getWagerDetails(wagerId: number): Promise<Wager> {
    try {
      const wager = (await this.prisma.wager.findUnique({
        where: { id: wagerId },
      })) as Wager;

      return wager;
    } catch (error) {
      throw error;
    }
  }

  async claimWager(userId: number, wagerId: number): Promise<string> {
    try {
      const wager = (await this.prisma.wager.findUnique({
        where: { id: wagerId },
      })) as Wager;

      if (wager.status === 'SETTLED') {
        throw new RpcException({
          status: 400,
          message: 'This wager has already been settled!',
        });
      }
      if (wager.playerOne !== userId || wager.playerTwo !== userId) {
        throw new RpcException({
          status: 400,
          message:
            'A prize claim can only be made by any of the two players in this wager',
        });
      }

      // Store the claimant as the winner temporarily until the opponent takes action within 24 hours
      await this.prisma.wager.update({
        where: { id: wagerId },
        data: { winner: userId },
      });

      const claimant = (await this.prisma.user.findUnique({
        where: { id: userId },
      })) as User;

      let opponentId: number;
      wager.playerOne === userId
        ? (opponentId = wager.playerTwo)
        : (opponentId = wager.playerOne);

      const opponent = (await this.prisma.user.findUnique({
        where: { id: opponentId },
      })) as User;

      // Notify the opponent via email
      const subject = 'Accept or Contest Claim';
      const content = `@${claimant.username} has claimed the prize in the ${wager.title} wager.
        Accepting the claim means that you accept defeat and forfeit the prize.
        Contesting the claim means that you disagree and the claim will be settled through dispute resolution.`;
      await this.utils.sendEmail(opponent, subject, content);

      // Automatically settle the wager after 24 hours if the opponent takes no action
      await this.wagersQueue.add(
        'settle-wager',
        { wagerId, userId, opponentId },
        {
          jobId: `wager-${wagerId}`,
          delay: 24 * 60 * 60 * 1000,
        },
      );

      return wager.title;
    } catch (error) {
      throw error;
    }
  }

  async acceptWagerClaim(wagerId: number): Promise<void> {
    try {
      const wager = (await this.prisma.wager.findUnique({
        where: { id: wagerId },
      })) as Wager;

      if (wager.status === 'SETTLED') {
        throw new RpcException({
          status: 400,
          message: 'This wager has already been settled!',
        });
      }
      await this.wagersQueue.removeJobs(`wager-${wagerId}`);

      await this.prisma.wager.update({
        where: { id: wagerId },
        data: { status: 'SETTLED' },
      });

      // Subtract platform fee and add winnings to winner's balance
      await this.prisma.user.update({
        where: { id: wager.winner as number },
        data: { balance: { increment: wager.amount * 0.95 } },
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async contestWagerClaim(wagerId: number): Promise<void> {
    try {
      const wager = (await this.prisma.wager.findUnique({
        where: { id: wagerId },
      })) as Wager;

      if (wager.status === 'SETTLED') {
        throw new RpcException({
          status: 400,
          message: 'This wager has already been settled!',
        });
      }
      await this.wagersQueue.removeJobs(`wager-${wagerId}`);

      // Update wager status and reset winner data
      await this.prisma.wager.update({
        where: { id: wagerId },
        data: {
          status: 'DISPUTE',
          winner: null,
        },
      });

      await this.wagersQueue.add('contest-wager', { wagerId });

      return;
    } catch (error) {
      throw error;
    }
  }

  async deleteWager(userId: number, wagerId: number): Promise<void> {
    try {
      const wager = (await this.prisma.wager.findUnique({
        where: { id: wagerId },
      })) as Wager;

      if (wager.playerOne !== userId) {
        throw new RpcException({
          status: 400,
          message: 'A wager can only be deleted by its creator',
        });
      }
      if (wager.status === 'ACTIVE') {
        throw new RpcException({
          status: 400,
          message: 'An active wager cannot be deleted',
        });
      }
      if (wager.status === 'PENDING') {
        await this.prisma.wager.delete({
          where: { id: wagerId },
        });

        return;
      }
    } catch (error) {
      throw error;
    }
  }

  async getDisputeChatMessages(wagerId: number): Promise<Message[]> {
    try {
      return this.prisma.message.findMany({
        where: {
          chat: { wagerId },
        },
        orderBy: { createdAt: 'asc' },
      });
    } catch (error) {
      throw error;
    }
  }

  async assignWinnerAfterResolution(
    wagerId: number,
    username: string,
  ): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { username },
      });
      if (!user) {
        throw new RpcException({
          status: 400,
          message: 'Invalid username',
        });
      }

      // Update the status and winner of the wager
      const wager = await this.prisma.wager.update({
        where: { id: wagerId },
        data: {
          winner: user.id,
          status: 'SETTLED',
        },
      });

      // Subtract platform fee and add winnings to the winner's balance
      await this.prisma.user.update({
        where: { username },
        data: { balance: { increment: wager.amount * 0.95 } },
      });
    } catch (error) {
      throw error;
    }
  }
}
