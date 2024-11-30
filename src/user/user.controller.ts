import { Body, Controller, Delete, Get, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { User } from '@prisma/client';
import { GetUser } from '../common/decorators/user.decorator';
import { updateProfileDto } from './dto/user.dto';
import { UserService } from './user.service';

@UseGuards(AuthGuard('jwt'))
@Controller('users')
export class UserController {
  constructor(private userService: UserService) {};

  @Get('profile')
  profile(@GetUser() user: User): { user: User } {
    return { user };
  }

  @Patch('profile/update')
  async updateProfile(
    @GetUser() user: User,
    @Body() dto: updateProfileDto
  ): Promise<{ user: User }> {
    try {
      return { user: await this.userService.updateProfile(user.id, dto) }
    } catch (error) {
      throw error;
    }
  }

  @Delete('profile/delete')
  async deleteAccount(@GetUser() user: User)
  : Promise<{ message: string }> {
    try {
      await this.userService.deleteAccount(user.id);
      return { message: 'Account deleted successfully' };
    } catch (error) {
      throw error;
    }
  }
}
