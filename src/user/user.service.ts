import { Injectable } from '@nestjs/common';
import { DbService } from '@src/db/db.service';
import { UpdateProfileDto } from './dto';
import { Transaction, User, Wager } from '@prisma/client';

@Injectable()
export class UserService {
  constructor (private prisma: DbService) {};

  async updateProfile(userId: number, dto: UpdateProfileDto, filePath?: string): Promise<User> {
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...dto,
          ...(filePath && { profileImage: filePath }),        
        }
      })

      delete user.password
      return user;
    } catch (error) {
      throw error;
    }
  }

  async deleteAccount(userId: number): Promise<void> {
    try {
      await this.prisma.user.delete({
        where: { id: userId }
      })
    } catch (error) {
      throw error;
    }
  }

  async getWagers(userId: number): Promise<Wager[]> {
    try {
      return this.prisma.wager.findMany({
        where: {
          OR: [
            { playerOne: userId },
            { playerTwo: userId }
          ]
        },
        orderBy: { createdAt: 'desc' }
      });
    } catch (error) {
      throw error;
    }
  }

  async getTransactionHistory(userId: number): Promise<Transaction[]> {
    try {
      return this.prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });
    } catch (error) {
      throw error;
    }
  }
}
