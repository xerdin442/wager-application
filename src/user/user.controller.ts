import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Transaction, User, Wager } from '@prisma/client';
import { GetUser } from '@src/custom/decorators';
import { UpdateProfileDto } from './dto';
import { UserService } from './user.service';
import logger from '@src/common/logger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadConfig } from '@src/common/config/upload';

@UseGuards(AuthGuard('jwt'))
@Controller('users')
export class UserController {
  private context = UserController.name;

  constructor(private userService: UserService) { };

  @Get('profile')
  profile(@GetUser() user: User): { user: User } {
    logger.info(`[${this.context}] User profile viewed by ${user.email}\n`);
    return { user };
  }

  @Patch('profile/update')
  @UseInterceptors(FileInterceptor('profileImage', {
    fileFilter: new UploadConfig().fileFilter,
    limits: { fieldSize: 5 * 1024 * 1024 }, // File sizes must be less than 5MB
    storage: new UploadConfig().storage('profile-images', 'image')
  }))
  async updateProfile(
    @GetUser() user: User,
    @Body() dto: UpdateProfileDto,
    @UploadedFile() file?: Express.Multer.File
  ): Promise<{ user: User }> {
    try {
      const updatedUser = await this.userService.updateProfile(user.id, dto, file?.path);
      logger.info(`[${this.context}] User profile updated by ${user.email}.\n`);

      return { user: updatedUser };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while updating profile details. Error: ${error.message}\n`);

      throw error;
    }
  }

  @Delete('profile/delete')
  async deleteAccount(@GetUser() user: User): Promise<{ message: string }> {
    try {
      await this.userService.deleteAccount(user.id);
      logger.info(`[${this.context}] User profile deleted by ${user.email}.\n`);

      return { message: 'Account deleted successfully' };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while deleting user profile. Error: ${error.message}\n`);
      throw error;
    }
  }

  @Get('wagers')
  async getWagers(@GetUser() user: User): Promise<{ wagers: Wager[] }> {
    try {
      return { wagers: await this.userService.getWagers(user.id) };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while retrieving user's wagers. Error: ${error.message}\n`);
      throw error;
    }
  }

  @Get('transactions')
  async getTransactionHistory(
    @GetUser() user: User,
    // Filters in query object
  ): Promise<{ transactions: Transaction[] }> {
    try {
      return { transactions: await this.userService.getTransactionHistory(user.id) };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while retrieving user's transaction history. Error: ${error.message}\n`);
      throw error;
    }
  }
}
