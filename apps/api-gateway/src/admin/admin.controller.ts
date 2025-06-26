import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, Observable } from 'rxjs';
import { AdminAuthDTO, CreateAdminDTO } from './dto';
import { handleError } from '../utils/error';
import { AuthGuard } from '@nestjs/passport';
import { SuperAdminGuard } from '../custom/guards/admin.guard';
import { Admin } from '@prisma/client';
import { GetAdmin } from '../custom/decorators';

@Controller('admin')
export class AdminController {
  constructor(
    @Inject('ADMIN_SERVICE') private readonly natsClient: ClientProxy,
  ) {}

  @Post('signup')
  signup(@Body() dto: AdminAuthDTO): Observable<any> {
    return this.natsClient
      .send('admin-signup', { dto })
      .pipe(catchError(handleError));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: AdminAuthDTO): Observable<any> {
    return this.natsClient
      .send('admin-login', { dto })
      .pipe(catchError(handleError));
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @UseGuards(SuperAdminGuard)
  getAllAdmins(): Observable<any> {
    return this.natsClient.send('all-admins', {}).pipe(catchError(handleError));
  }

  @Post('add')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @UseGuards(SuperAdminGuard)
  addAdmin(@Body() dto: CreateAdminDTO): Observable<any> {
    return this.natsClient.send('add', { dto }).pipe(catchError(handleError));
  }

  @Post('remove')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @UseGuards(SuperAdminGuard)
  removeAdmin(@Query('email') email: string): Observable<any> {
    return this.natsClient
      .send('remove', { email })
      .pipe(catchError(handleError));
  }

  @Get('disputes')
  @UseGuards(AuthGuard('jwt'))
  getDisputeChats(@GetAdmin() admin: Admin): Observable<any> {
    return this.natsClient
      .send('dispute-chats', { adminId: admin.id })
      .pipe(catchError(handleError));
  }
}
