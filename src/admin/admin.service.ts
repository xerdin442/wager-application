import { BadRequestException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon from 'argon2'
import { DbService } from '@src/db/db.service';
import { AdminAuthDto, CreateAdminDto } from './dto';
import { randomUUID } from 'crypto';
import { Secrets } from '@src/common/env';
import { sendEmail } from '@src/common/config/mail';
import { Admin, Chat } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: DbService,
    private readonly jwt: JwtService
  ) { };

  async signup(dto: AdminAuthDto): Promise<void> {
    try {
      const admins = await this.prisma.admin.findMany();
      if (admins.length >= 1) {
        throw new BadRequestException('Only one super admin profile can be created')
      };

      const hash = await argon.hash(dto.passcode)
      await this.prisma.admin.create({
        data: {
          ...dto,
          passcode: hash,
          name: 'Admin',
          category: 'OTHERS',
          disputes: 0
        }
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async login(dto: AdminAuthDto): Promise<string> {
    try {
      const admin = await this.prisma.admin.findUnique({
        where: { email: dto.email }
      });
      // Check if admin is found with given email address
      if (!admin) {
        throw new BadRequestException('No admin found with that email address')
      };

      // Check if password is valid
      const checkPassword = await argon.verify(admin.passcode, dto.passcode)
      if (!checkPassword) {
        throw new BadRequestException('Access denied. Invalid passcode')
      }

      const payload = { sub: admin.id, email: admin.email, admin: true };  // Create JWT payload
      
      return this.jwt.signAsync(payload);
    } catch (error) {
      throw error;
    }
  }

  async getAllAdmins(): Promise<Admin[]> {
    try {
      return this.prisma.admin.findMany({
        where: { NOT: { id: 1 } }
      });
    } catch (error) {
      throw error;
    }
  }

  async addAddmin(dto: CreateAdminDto): Promise<void> {
    try {
      const passcode = randomUUID().split('-').slice(1, 3).join('-');
      const hash = await argon.hash(passcode);

      const admin = await this.prisma.admin.create({
        data: {
          ...dto,
          disputes: 0,
          passcode: hash
        }
      });

      // Send passcode to new admin
      const subject = 'Login Details';
      const content = `Welcome to the team! You're now a dispute resolution admin at ${Secrets.APP_NAME}. Your passcode is: ${passcode}.`;
      await sendEmail(admin, subject, content);

      return;
    } catch (error) {
      throw error;
    }
  }

  async removeAddmin(email: string): Promise<void> {
    try {
      await this.prisma.admin.delete({
        where: { email }
      });
    } catch (error) {
      throw error;
    }
  }

  async getDisputeChats(adminId: number): Promise<Chat[]> {
    try {
      return this.prisma.chat.findMany({
        where: { adminId },
        include: { messages: true }
      });
    } catch (error) {
      throw error;
    }
  }
}
