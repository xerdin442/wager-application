import { Body, Controller, HttpCode, HttpStatus, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthDto } from './dto/auth.dto';
import { User } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserService } from '../user/user.service';
import { UploadConfig } from '../config/upload';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService
  ) { }

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
      const newUser = await this.authService.signup(dto);
      const user = await this.userService.updateProfile(newUser.id, {
        profileImage: file.path
      });
  
      return { user };
    } catch (error) {
      if (file.path) {
        const upload = new UploadConfig();
        upload.deleteFile(file.path);

        console.log(error)
      }
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() dto: AuthDto): Promise<{ token: string }> {
    return { token: await this.authService.login(dto) };
  }
}
