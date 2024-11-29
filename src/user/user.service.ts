import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { updateProfileDto } from './dto/user.dto';
import { User } from '@prisma/client';

@Injectable()
export class UserService {
  constructor (private prisma: DbService) {};

  async updateProfile(userId: number, dto: updateProfileDto): Promise<User> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { ...dto }
    })

    delete user.password
    return user;
  }

  async deleteAccount(userId: number) {
    return this.prisma.user.delete({
      where: { id: userId }
    })
  }
}
