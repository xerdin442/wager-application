import { DbService } from '@app/db';
import { Injectable } from '@nestjs/common';
import { Transaction, User, Wager } from '@prisma/client';
import { UpdateProfileDto, GetTransactionsDto, FundsTransferDto } from './dto';
import { UtilsService } from '@app/utils';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: DbService,
    private readonly utils: UtilsService,
  ) {}

  async updateProfile(
    userId: number,
    dto: UpdateProfileDto,
    file?: Express.Multer.File,
  ): Promise<User> {
    try {
      // Upload file to AWS if available
      let filePath: string = '';
      if (file) filePath = await this.utils.upload(file, 'profile-images');

      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...dto,
          ...(filePath && { profileImage: filePath }),
        },
      });

      // Sanitize user output
      user.password = '';
      user.ethPrivateKey = '';
      user.solPrivateKey = '';

      return user;
    } catch (error) {
      throw error;
    }
  }

  async deleteAccount(userId: number): Promise<void> {
    try {
      await this.prisma.user.delete({
        where: { id: userId },
      });
    } catch (error) {
      throw error;
    }
  }

  async getWagers(userId: number): Promise<Wager[]> {
    try {
      return this.prisma.wager.findMany({
        where: {
          OR: [{ playerOne: userId }, { playerTwo: userId }],
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      throw error;
    }
  }

  async getTransactionHistory(
    userId: number,
    dto: GetTransactionsDto,
  ): Promise<Transaction[]> {
    try {
      return this.prisma.transaction.findMany({
        where: { ...dto, userId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      throw error;
    }
  }

  async transferFunds(userId: number, dto: FundsTransferDto): Promise<string> {
    try {
      // Update wallet balance of the sender and recipient
      await this.prisma.user.update({
        where: { id: userId },
        data: { balance: { decrement: dto.amount } },
      });
      const recipient = await this.prisma.user.update({
        where: { username: dto.username },
        data: { balance: { increment: dto.amount } },
      });

      return recipient.email;
    } catch (error) {
      throw error;
    }
  }
}
