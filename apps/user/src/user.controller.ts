import { Controller } from '@nestjs/common';
import { UserService } from './user.service';
import { UtilsService } from '@app/utils';
import { MessagePattern } from '@nestjs/microservices';
import { Transaction, User, Wager } from '@prisma/client';
import { FundsTransferDto, GetTransactionsDto, UpdateProfileDto } from './dto';

@Controller()
export class UserController {
  private readonly context: string = UserController.name;
  constructor(
    private readonly userService: UserService,
    private readonly utils: UtilsService,
  ) {}

  @MessagePattern('profile')
  getProfile(data: { user: User }): { user: User } {
    const { user } = data;
    this.utils
      .logger()
      .info(`[${this.context}] Profile viewed by ${user.email}\n`);

    return { user };
  }

  @MessagePattern('update-profile')
  async updateProfile(data: {
    user: User;
    dto: UpdateProfileDto;
    file?: Express.Multer.File;
  }): Promise<{ user: User }> {
    try {
      const { dto, user, file } = data;
      const updatedUser = await this.userService.updateProfile(
        user.id,
        dto,
        file,
      );

      this.utils
        .logger()
        .info(`[${this.context}] Profile updated by ${user.email}.\n`);

      return { user: updatedUser };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while updating profile details. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  @MessagePattern('delete-profile')
  async deleteAccount(data: { user: User }): Promise<{ message: string }> {
    try {
      const { user } = data;
      await this.userService.deleteAccount(user);

      this.utils
        .logger()
        .info(`[${this.context}] Profile deleted by ${user.email}.\n`);

      return { message: 'Account deleted successfully' };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while deleting user profile. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  @MessagePattern('wagers')
  async getWagers(data: { userId: number }): Promise<{ wagers: Wager[] }> {
    try {
      return { wagers: await this.userService.getWagers(data.userId) };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while retrieving user's wagers. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  @MessagePattern('transactions')
  async getTransactionHistory(data: {
    userId: number;
    dto: GetTransactionsDto;
  }): Promise<{ transactions: Transaction[] }> {
    try {
      const { userId, dto } = data;
      return {
        transactions: await this.userService.getTransactionHistory(userId, dto),
      };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while retrieving user's transaction history. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  @MessagePattern('transfer-funds')
  async transferFunds(data: {
    user: User;
    dto: FundsTransferDto;
  }): Promise<{ message: string }> {
    try {
      const { user, dto } = data;
      const recipient = await this.userService.transferFunds(user.id, dto);

      this.utils
        .logger()
        .info(
          `[${this.context}] Successful funds transfer from ${user.email} to ${recipient}. Amount: $${dto.amount}\n`,
        );

      return {
        message: `$${dto.amount} transfer to @${dto.username} was successful!`,
      };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while processing funds transfer. Error: ${error.message}\n`,
        );

      throw error;
    }
  }
}
