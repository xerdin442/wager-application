import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { User } from '@prisma/client';
import { GetUser } from '../custom/decorators';
import { catchError, Observable } from 'rxjs';
import { Chain } from './types';
import { WithdrawalDTO } from './dto';
import { handleError } from '../utils/error';
import { AuthGuard } from '@nestjs/passport';

@Controller('wallet')
@UseGuards(AuthGuard('jwt'))
export class WalletController {
  constructor(
    @Inject('WALLET_SERVICE') private readonly natsClient: ClientProxy,
  ) {}

  @Get('deposit')
  getDepositAddress(
    @GetUser() user: User,
    @Query('chain') chain: Chain,
  ): Observable<any> {
    return this.natsClient
      .send('deposit', { chain, user })
      .pipe(catchError(handleError));
  }

  @Post('withdraw')
  @HttpCode(HttpStatus.OK)
  processWithdrawal(
    @GetUser() user: User,
    @Query('chain') chain: Chain,
    @Body() dto: WithdrawalDTO,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ): Observable<any> {
    return this.natsClient
      .send('withdraw', { chain, user, dto, idempotencyKey })
      .pipe(catchError(handleError));
  }
}
