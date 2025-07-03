import { DbService } from '@app/db';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Admin, Chat } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AdminAuthDTO, CreateAdminDTO } from './dto';
import * as argon from 'argon2';
import { RpcException } from '@nestjs/microservices';
import { UtilsService } from '@app/utils';
import { ConfigService } from '@nestjs/config';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: DbService,
    private readonly utils: UtilsService,
    private readonly config: ConfigService,
  ) {}

  async signup(dto: AdminAuthDTO): Promise<void> {
    try {
      const admins = await this.prisma.admin.findMany();
      if (admins.length === 1) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: 'Only one Super Admin profile can be created',
        });
      }

      const hash = await argon.hash(dto.passcode);
      await this.prisma.admin.create({
        data: {
          ...dto,
          passcode: hash,
          name: 'Super Admin',
          category: 'OTHERS',
          disputes: 0,
        },
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async login(dto: AdminAuthDTO): Promise<Admin> {
    try {
      const admin = await this.prisma.admin.findUnique({
        where: { email: dto.email },
      });
      // Check if admin is found with given email address
      if (!admin) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: 'No admin found with that email address',
        });
      }

      // Check if password is valid
      const checkPassword = await argon.verify(admin.passcode, dto.passcode);
      if (!checkPassword) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: 'Access denied. Invalid passcode',
        });
      }

      admin.passcode = 'X-X-X';

      return admin;
    } catch (error) {
      throw error;
    }
  }

  async getAllAdmins(): Promise<Admin[]> {
    try {
      return this.prisma.admin.findMany({
        where: { NOT: { id: 1 } },
      });
    } catch (error) {
      throw error;
    }
  }

  async addAddmin(dto: CreateAdminDTO): Promise<void> {
    try {
      const passcode = randomUUID().split('-').slice(1, 4).join('-');
      const hash = await argon.hash(passcode);

      const admin = await this.prisma.admin.create({
        data: {
          ...dto,
          disputes: 0,
          passcode: hash,
        },
      });

      // Send passcode to new admin
      const subject = 'Login Details';
      const content = `Welcome to the team! You're now a dispute resolution admin at ${this.config.getOrThrow<string>('APP_NAME')}. Your passcode is: ${passcode}.`;
      await this.utils.sendEmail(admin.email, subject, content);

      return;
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          const meta = error.meta as Record<string, any>;
          throw new RpcException({
            status: HttpStatus.BAD_REQUEST,
            message: `This ${meta.target[0]} already exists. Please try again!`,
          });
        }
      }

      throw error;
    }
  }

  async removeAddmin(adminId: number): Promise<string> {
    try {
      const admin = await this.prisma.admin.delete({
        where: { id: adminId },
      });

      return admin.email;
    } catch (error) {
      throw error;
    }
  }

  async getDisputeChats(adminId: number): Promise<Chat[]> {
    try {
      return this.prisma.chat.findMany({
        where: { adminId },
        include: { messages: true },
      });
    } catch (error) {
      throw error;
    }
  }
}
