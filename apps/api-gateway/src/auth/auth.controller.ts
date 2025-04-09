import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, Observable } from 'rxjs';
import {
  LoginDTO,
  NewPasswordDTO,
  PasswordResetDTO,
  SignupDTO,
  Verify2faDTO,
  VerifyOtpDTO,
} from './dto';
import { AuthGuard } from '@nestjs/passport';
import { User } from '@prisma/client';
import { GetUser } from '../custom/decorators';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileFilterCallback } from 'multer';
import { handleError } from '../utils/error';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly natsClient: ClientProxy,
  ) {}

  @Post('signup')
  @UseInterceptors(
    FileInterceptor('profileImage', {
      limits: { fieldSize: 8 * 1024 * 1024 },
      fileFilter: (
        req: Request,
        file: Express.Multer.File,
        callback: FileFilterCallback,
      ): void => {
        const allowedMimetypes: string[] = [
          'image/png',
          'image/heic',
          'image/jpeg',
          'image/webp',
          'image/heif',
        ];

        if (allowedMimetypes.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
    }),
  )
  signup(
    @Body() dto: SignupDTO,
    @UploadedFile() file?: Express.Multer.File,
  ): Observable<any> {
    return this.natsClient
      .send('signup', { dto, file })
      .pipe(catchError(handleError));
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDTO): Observable<any> {
    return this.natsClient.send('login', { dto }).pipe(catchError(handleError));
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @Post('logout')
  logout(@GetUser() user: User): Observable<any> {
    return this.natsClient
      .send('logout', { user })
      .pipe(catchError(handleError));
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @Post('2fa/enable')
  enable2fa(@GetUser() user: User): Observable<any> {
    return this.natsClient
      .send('enable-2fa', { user })
      .pipe(catchError(handleError));
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @Post('2fa/disable')
  disable2fa(@GetUser() user: User): Observable<any> {
    return this.natsClient
      .send('disable-2fa', { user })
      .pipe(catchError(handleError));
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @Post('2fa/verify')
  verify2fa(@GetUser() user: User, @Body() dto: Verify2faDTO): Observable<any> {
    return this.natsClient
      .send('verify-2fa', { user, dto })
      .pipe(catchError(handleError));
  }

  @HttpCode(HttpStatus.OK)
  @Post('password/reset')
  requestPasswordReset(@Body() dto: PasswordResetDTO): Observable<any> {
    return this.natsClient
      .send('reset-password', { dto })
      .pipe(catchError(handleError));
  }

  @HttpCode(HttpStatus.OK)
  @Post('password/resend-otp')
  resendOtp(): Observable<any> {
    return this.natsClient
      .send('resend-reset-otp', {})
      .pipe(catchError(handleError));
  }

  @HttpCode(HttpStatus.OK)
  @Post('password/verify-otp')
  verifyOtp(@Body() dto: VerifyOtpDTO): Observable<any> {
    return this.natsClient
      .send('verify-reset-otp', { dto })
      .pipe(catchError(handleError));
  }

  @HttpCode(HttpStatus.OK)
  @Post('password/new')
  changePassword(@Body() dto: NewPasswordDTO): Observable<any> {
    return this.natsClient
      .send('new-password', { dto })
      .pipe(catchError(handleError));
  }
}
