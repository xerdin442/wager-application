import { BadRequestException, Body, Controller, ForbiddenException, HttpCode, HttpStatus, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthDto, Verify2FADto } from './dto/auth.dto';
import { User } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadConfig } from '../config/upload';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../user/decorators/user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { };

  @Post('signup')
  @UseInterceptors(FileInterceptor('profileImage', {
    fileFilter: new UploadConfig().fileFilter,    
    limits: { fieldSize: 5 * 1024 * 1024 }, // File sizes must be less than 5MB
    storage: new UploadConfig().storage('profile-images', 'image')
  }))
  async signup(
    @Body() dto: AuthDto,
    @UploadedFile() file: Express.Multer.File
  ): Promise<{ user: User }> {
    try {
      return { user: await this.authService.signup(dto, file.path) };
    } catch (error) {
      if (file.path) {
        new UploadConfig().deleteFile(file.path);
      }

      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() dto: AuthDto)
  : Promise<{ token: string }> {
    try {
      return { token: await this.authService.login(dto) };
    } catch (error) {
      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @Post('2fa/enable')
  async enable2FA(@GetUser() user: User)
  : Promise<{ qrcode: string }> {
    try {
      return { qrcode: await this.authService.enable2FA(user.id) }
    } catch (error) {
      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @Post('2fa/disable')
  async disable2FA(@GetUser() user: User)
  : Promise<{ message: string }> {
    try {
      await this.authService.disable2FA(user.id);
      return { message: '2FA disabled successfully' };
    } catch (error) {
      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @Post('2fa/verify')
  async verify2FA(
    @GetUser() user: User,
    @Body() dto: Verify2FADto
  ): Promise<{ message: string }> {
    try {
      const verified = await this.authService.verify2FA(user.id, dto);
      
      if (verified) {
        return { message: '2FA token verified successfully' };
      } else {
        return new BadRequestException('Invalid token')
      }
    } catch (error) {
      throw error;
    }
  }
}
