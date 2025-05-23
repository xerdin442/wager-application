import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { AuthGuard } from '@nestjs/passport';
import { User } from '@prisma/client';
import { Observable, catchError } from 'rxjs';
import { GetUser } from '../custom/decorators';
import { handleError } from '../utils/error';
import { CreateWagerDTO, UpdateWagerDTO, WagerInviteDTO } from './dto';
import { AdminGuard } from '../custom/guards/admin.guard';

@Controller('wagers')
@UseGuards(AuthGuard('jwt'))
export class WagerController {
  constructor(
    @Inject('WAGER_SERVICE') private readonly natsClient: ClientProxy,
  ) {}

  @Post('create')
  createWager(
    @GetUser() user: User,
    @Body() dto: CreateWagerDTO,
  ): Observable<any> {
    return this.natsClient
      .send('create', { user, dto })
      .pipe(catchError(handleError));
  }

  @Patch(':wagerId')
  updateWager(
    @GetUser() user: User,
    @Param('wagerId', ParseIntPipe) wagerId: number,
    @Body() dto: UpdateWagerDTO,
  ): Observable<any> {
    return this.natsClient
      .send('update', { wagerId, userId: user.id, dto })
      .pipe(catchError(handleError));
  }

  @Post('invite')
  @HttpCode(HttpStatus.OK)
  findWagerByInviteCode(@Body() dto: WagerInviteDTO): Observable<any> {
    return this.natsClient
      .send('invite', { dto })
      .pipe(catchError(handleError));
  }

  @Get(':wagerId')
  getWagerDetails(
    @Param('wagerId', ParseIntPipe) wagerId: number,
  ): Observable<any> {
    return this.natsClient
      .send('details', { wagerId })
      .pipe(catchError(handleError));
  }

  @Post(':wagerId/join')
  @HttpCode(HttpStatus.OK)
  joinWager(
    @GetUser() user: User,
    @Param('wagerId', ParseIntPipe) wagerId: number,
  ): Observable<any> {
    return this.natsClient
      .send('join', { wagerId, user })
      .pipe(catchError(handleError));
  }

  @Post(':wagerId/claim')
  @HttpCode(HttpStatus.OK)
  claimWager(
    @GetUser() user: User,
    @Param('wagerId', ParseIntPipe) wagerId: number,
  ): Observable<any> {
    return this.natsClient
      .send('claim', { wagerId, user })
      .pipe(catchError(handleError));
  }

  @Post(':wagerId/claim/accept')
  @HttpCode(HttpStatus.OK)
  acceptWagerClaim(
    @Param('wagerId', ParseIntPipe) wagerId: number,
  ): Observable<any> {
    return this.natsClient
      .send('accept-claim', { wagerId })
      .pipe(catchError(handleError));
  }

  @Post(':wagerId/claim/contest')
  @HttpCode(HttpStatus.OK)
  contestWagerClaim(
    @Param('wagerId', ParseIntPipe) wagerId: number,
  ): Observable<any> {
    return this.natsClient
      .send('contest-claim', { wagerId })
      .pipe(catchError(handleError));
  }

  @Delete(':wagerId')
  deleteWager(
    @GetUser() user: User,
    @Param('wagerId', ParseIntPipe) wagerId: number,
  ): Observable<any> {
    return this.natsClient
      .send('delete', { userId: user.id, wagerId })
      .pipe(catchError(handleError));
  }

  @Get(':wagerId/dispute/chat')
  getDisputeChatMessages(
    @Param('wagerId', ParseIntPipe) wagerId: number,
  ): Observable<any> {
    return this.natsClient
      .send('dispute-chat', { wagerId })
      .pipe(catchError(handleError));
  }

  @Post(':wagerId/dispute/resolve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminGuard)
  assignWinnerAfterResolution(
    @Param('wagerId', ParseIntPipe) wagerId: number,
    @Query('username') username: string,
  ): Observable<any> {
    return this.natsClient
      .send('resolve-dispute', { username, wagerId })
      .pipe(catchError(handleError));
  }
}
