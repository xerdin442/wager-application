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
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { AuthGuard } from '@nestjs/passport';
import { User } from '@prisma/client';
import { Observable, catchError } from 'rxjs';
import { GetUser } from '../custom/decorators';
import { handleError } from '../utils/error';
import {
  CreateWagerDTO,
  DisputeResolutionDTO,
  UpdateWagerDTO,
  WagerInviteDTO,
} from './dto';
import { AdminGuard } from '../custom/guards/admin.guard';

@Controller('wagers')
export class WagerController {
  constructor(
    @Inject('WAGER_SERVICE') private readonly natsClient: ClientProxy,
  ) {}

  @Get('metrics')
  @UseGuards(AuthGuard('jwt'))
  getMetrics(): Observable<any> {
    return this.natsClient
      .send('wager-metrics', {})
      .pipe(catchError(handleError));
  }

  @Post('create')
  @UseGuards(AuthGuard('jwt'))
  createWager(
    @GetUser() user: User,
    @Body() dto: CreateWagerDTO,
  ): Observable<any> {
    return this.natsClient
      .send('create', { user, dto })
      .pipe(catchError(handleError));
  }

  @Patch(':wagerId')
  @UseGuards(AuthGuard('jwt'))
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
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  findWagerByInviteCode(@Body() dto: WagerInviteDTO): Observable<any> {
    return this.natsClient
      .send('invite', { dto })
      .pipe(catchError(handleError));
  }

  @Get(':wagerId')
  @UseGuards(AuthGuard('jwt'))
  getWagerDetails(
    @Param('wagerId', ParseIntPipe) wagerId: number,
  ): Observable<any> {
    return this.natsClient
      .send('details', { wagerId })
      .pipe(catchError(handleError));
  }

  @Post(':wagerId/join')
  @UseGuards(AuthGuard('jwt'))
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
  @UseGuards(AuthGuard('jwt'))
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
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  acceptWagerClaim(
    @Param('wagerId', ParseIntPipe) wagerId: number,
  ): Observable<any> {
    return this.natsClient
      .send('accept-claim', { wagerId })
      .pipe(catchError(handleError));
  }

  @Post(':wagerId/claim/contest')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  contestWagerClaim(
    @Param('wagerId', ParseIntPipe) wagerId: number,
  ): Observable<any> {
    return this.natsClient
      .send('contest-claim', { wagerId })
      .pipe(catchError(handleError));
  }

  @Delete(':wagerId')
  @UseGuards(AuthGuard('jwt'))
  deleteWager(
    @GetUser() user: User,
    @Param('wagerId', ParseIntPipe) wagerId: number,
  ): Observable<any> {
    return this.natsClient
      .send('delete', { userId: user.id, wagerId })
      .pipe(catchError(handleError));
  }

  @Get(':wagerId/dispute/chat')
  @UseGuards(AuthGuard('jwt'))
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
    @Body() dto: DisputeResolutionDTO,
  ): Observable<any> {
    return this.natsClient
      .send('resolve-dispute', { wagerId, dto })
      .pipe(catchError(handleError));
  }
}
