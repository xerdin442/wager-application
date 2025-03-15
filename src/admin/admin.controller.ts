import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminService } from './admin.service';
import logger from '@src/common/logger';
import { AdminAuthDto, CreateAdminDto } from './dto';
import { SuperAdminGuard } from '@src/custom/guards';
import { Admin, Chat } from '@prisma/client';
import { GetAdmin } from '@src/custom/decorators';

@Controller('admin')
export class AdminController {
  private readonly context: string = AdminController.name;
  
  constructor(private readonly adminService: AdminService) { };

  @Post('signup')
  async signup(@Body() dto: AdminAuthDto): Promise<{ message: string }> {
    try {
      await this.adminService.signup(dto);
      logger.info(`[${this.context}] Super admin profile created by ${dto.email}.\n`);

      return { message: 'Super admin created successfully' };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred during super admin signup. Error: ${error.message}.\n`);
      throw error;
    }
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: AdminAuthDto): Promise<{ token: string }> {
    try {
      const token = await this.adminService.login(dto);
      logger.info(`[${this.context}] Admin profile login successful. Email: ${dto.email}.\n`);

      return { token };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred during admin login. Error: ${error.message}.\n`);
      throw error;
    }
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @UseGuards(SuperAdminGuard)
  async getAllAdmins(): Promise<{ admins: Admin[] }> {
    try {
      return { admins: await this.adminService.getAllAdmins() };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while retrieving profile details of sub admins. Error: ${error.message}.\n`);
      throw error;
    }
  }

  @Post('add')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @UseGuards(SuperAdminGuard)
  async addAdmin(@Body() dto: CreateAdminDto): Promise<{ message: string }> {
    try {
      await this.adminService.addAddmin(dto);
      logger.info(`[${this.context}] ${dto.email} has been added as a dispute resolution admin.\n`);

      return { message: 'New admin added successfully' };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while adding a new admin. Error: ${error.message}.\n`);
      throw error;
    }
  }

  @Post('remove')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @UseGuards(SuperAdminGuard)
  async removeAdmin(@Query('email') email: string): Promise<{ message: string }> {
    try {
      await this.adminService.removeAddmin(email);
      logger.info(`[${this.context}] ${email} has been removed as a dispute resolution admin.\n`);

      return { message: 'Admin profile deleted successfully' };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while deleting admin profile. Error: ${error.message}.\n`);
      throw error;
    }
  }

  @Get('disputes')
  @UseGuards(AuthGuard('jwt'))
  async getDisputeChats(@GetAdmin() admin: Admin): Promise<{ disputes: Chat[] }> {
    try {
      return { disputes: await this.adminService.getDisputeChats(admin.id) };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while retrieving admin's dispute chats. Error: ${error.message}.\n`);
      throw error;
    }
  }
}
