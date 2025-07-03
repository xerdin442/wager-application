import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, Observable } from 'rxjs';
import { AdminAuthDTO, CreateAdminDTO } from './dto';
import { handleError } from '../utils/error';
import { SuperAdminGuard } from '../custom/guards/admin.guard';

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
  @UseGuards(SuperAdminGuard)
  getAllAdmins(): Observable<any> {
    return this.natsClient.send('all-admins', {}).pipe(catchError(handleError));
  }

  @Post('add')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuperAdminGuard)
  addAdmin(@Body() dto: CreateAdminDTO): Observable<any> {
    return this.natsClient.send('add', { dto }).pipe(catchError(handleError));
  }

  @Post('remove/:adminId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuperAdminGuard)
  removeAdmin(
    @Param('adminId', ParseIntPipe) adminId: number,
  ): Observable<any> {
    return this.natsClient
      .send('remove', { adminId })
      .pipe(catchError(handleError));
  }

  @Get('disputes/:adminId')
  getDisputeChats(
    @Param('adminId', ParseIntPipe) adminId: number,
  ): Observable<any> {
    return this.natsClient
      .send('dispute-chats', { adminId })
      .pipe(catchError(handleError));
  }
}
