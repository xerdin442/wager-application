import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { AuthGuard } from '@nestjs/passport';
import { User } from '@prisma/client';
import { Observable, catchError } from 'rxjs';
import { GetUser } from '../custom/decorators';
import { handleError } from '../utils/error';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { FundsTransferDTO, GetTransactionsDTO, UpdateProfileDTO } from './dto';

@Controller('user')
@UseGuards(AuthGuard('jwt'))
export class UserController {
  constructor(
    @Inject('USER_SERVICE') private readonly natsClient: ClientProxy,
  ) {}

  @Get('profile')
  getProfile(@GetUser() user: User): Observable<any> {
    return this.natsClient
      .send('profile', { user })
      .pipe(catchError(handleError));
  }

  @Patch('profile')
  @UseInterceptors(
    FileInterceptor('profileImage', {
      storage: multer.memoryStorage(),
      limits: { fieldSize: 8 * 1024 * 1024 },
      fileFilter: (
        req: Request,
        file: Express.Multer.File,
        callback: multer.FileFilterCallback,
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
  updateProfile(
    @GetUser() user: User,
    @Body() dto: UpdateProfileDTO,
    @UploadedFile() file?: Express.Multer.File,
  ): Observable<any> {
    return this.natsClient
      .send('update-profile', { user, dto, file })
      .pipe(catchError(handleError));
  }

  @Delete('profile')
  deleteAccount(@GetUser() user: User): Observable<any> {
    return this.natsClient
      .send('delete-profile', { user })
      .pipe(catchError(handleError));
  }

  @Get('wagers')
  getWagers(@GetUser() user: User): Observable<any> {
    return this.natsClient
      .send('wagers', { userId: user.id })
      .pipe(catchError(handleError));
  }

  @Get('transactions')
  getTransactionHistory(
    @GetUser() user: User,
    @Query() dto: GetTransactionsDTO,
  ): Observable<any> {
    return this.natsClient
      .send('transactions', { userId: user.id, dto })
      .pipe(catchError(handleError));
  }

  @Post('wallet/transfer')
  @HttpCode(HttpStatus.OK)
  transferFunds(
    @GetUser() user: User,
    @Body() dto: FundsTransferDTO,
  ): Observable<any> {
    return this.natsClient
      .send('transfer-funds', { user, dto })
      .pipe(catchError(handleError));
  }
}
