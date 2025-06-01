import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { User } from '@prisma/client';
import { GetUser } from '../custom/decorators';
import { catchError, Observable } from 'rxjs';
import { DepositDTO, WithdrawalDTO } from './dto';
import { handleError } from '../utils/error';
import { AuthGuard } from '@nestjs/passport';

@Controller('wallet')
@UseGuards(AuthGuard('jwt'))
export class WalletController {
  constructor(
    @Inject('WALLET_SERVICE') private readonly natsClient: ClientProxy,
  ) {}

  @Post('deposit')
  processDeposit(
    @GetUser() user: User,
    @Body() dto: DepositDTO,
  ): Observable<any> {
    return this.natsClient
      .send('deposit', { dto, user })
      .pipe(catchError(handleError));
  }

  @Post('withdrawal')
  @HttpCode(HttpStatus.OK)
  processWithdrawal(
    @GetUser() user: User,
    @Body() dto: WithdrawalDTO,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ): Observable<any> {
    return this.natsClient
      .send('withdraw', { user, dto, idempotencyKey })
      .pipe(catchError(handleError));
  }
}
