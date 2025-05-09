import { Controller } from '@nestjs/common';
import { AdminService } from './admin.service';
import { UtilsService } from '@app/utils';
import { MessagePattern } from '@nestjs/microservices';
import { AdminAuthDto, CreateAdminDto } from './dto';
import { Admin, Chat } from '@prisma/client';

@Controller()
export class AdminController {
  private readonly context: string = AdminController.name;

  constructor(
    private readonly adminService: AdminService,
    private readonly utils: UtilsService,
  ) {}

  @MessagePattern('signup')
  async signup(data: {
    dto: AdminAuthDto;
  }): Promise<{ message: string; token: string }> {
    try {
      const { dto } = data;
      const token = await this.adminService.signup(dto);

      this.utils
        .logger()
        .info(
          `[${this.context}] Super Admin profile created by ${dto.email}.\n`,
        );

      return { message: 'Super Admin created successfully', token };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred during super admin signup. Error: ${error.message}.\n`,
        );

      throw error;
    }
  }

  @MessagePattern('login')
  async login(data: { dto: AdminAuthDto }): Promise<{ token: string }> {
    try {
      const { dto } = data;
      const token = await this.adminService.login(dto);

      this.utils
        .logger()
        .info(
          `[${this.context}] Admin profile login successful. Email: ${dto.email}.\n`,
        );

      return { token };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred during admin login. Error: ${error.message}.\n`,
        );

      throw error;
    }
  }

  @MessagePattern('all-admins')
  async getAllAdmins(): Promise<{ admins: Admin[] }> {
    try {
      return { admins: await this.adminService.getAllAdmins() };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while retrieving profile details of sub admins. Error: ${error.message}.\n`,
        );

      throw error;
    }
  }

  @MessagePattern('add')
  async addAdmin(data: { dto: CreateAdminDto }): Promise<{ message: string }> {
    try {
      const { dto } = data;
      await this.adminService.addAddmin(dto);

      this.utils
        .logger()
        .info(
          `[${this.context}] ${dto.email} has been added as a dispute resolution admin.\n`,
        );

      return { message: 'New admin added successfully' };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while adding a new admin. Error: ${error.message}.\n`,
        );

      throw error;
    }
  }

  @MessagePattern('remove')
  async removeAdmin(data: { email: string }): Promise<{ message: string }> {
    try {
      const { email } = data;
      await this.adminService.removeAddmin(email);

      this.utils
        .logger()
        .info(
          `[${this.context}] ${email} has been removed as a dispute resolution admin.\n`,
        );

      return { message: 'Admin profile deleted successfully' };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while deleting admin profile. Error: ${error.message}.\n`,
        );

      throw error;
    }
  }

  @MessagePattern('dispute-chats')
  async getDisputeChats(data: { adminId: number }): Promise<{ chats: Chat[] }> {
    try {
      return {
        chats: await this.adminService.getDisputeChats(data.adminId),
      };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while retrieving admin's dispute chats. Error: ${error.message}.\n`,
        );

      throw error;
    }
  }
}
