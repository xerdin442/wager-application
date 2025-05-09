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
  Req,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { AuthGuard } from '@nestjs/passport';
import { User } from '@prisma/client';
import { catchError, Observable } from 'rxjs';
import { GetUser } from '../custom/decorators';
import { FiatAmountDTO, FiatWithdrawalDTO } from './dto';
import { handleError } from '../utils/error';
import { Request } from 'express';

@Controller('wallet/fiat')
export class FiatController {
  constructor(
    @Inject('FIAT_SERVICE') private readonly natsClient: ClientProxy,
  ) {}

  @Post('deposit')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  processDeposit(
    @GetUser() user: User,
    @Body() dto: FiatAmountDTO,
  ): Observable<any> {
    return this.natsClient
      .send('deposit', { user, dto })
      .pipe(catchError(handleError));
  }

  @Post('withdraw')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  processWithdrawal(
    @GetUser() user: User,
    @Body() dto: FiatWithdrawalDTO,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ): Observable<any> {
    return this.natsClient
      .send('withdraw', { user, dto, idempotencyKey })
      .pipe(catchError(handleError));
  }

  @Get('withdraw/recent')
  @UseGuards(AuthGuard('jwt'))
  getRecentWithdrawalDetails(@GetUser() user: User): Observable<any> {
    return this.natsClient
      .send('recent-withdrawal-details', { user })
      .pipe(catchError(handleError));
  }

  @Get('withdraw/banks')
  getSupportedBanks(): Observable<any> {
    return this.natsClient
      .send('supported-banks', {})
      .pipe(catchError(handleError));
  }

  @Post('convert')
  @HttpCode(HttpStatus.OK)
  fiatConversion(
    @Body() dto: FiatAmountDTO,
    @Query('target') targetCurrency: string,
  ): Observable<any> {
    return this.natsClient
      .send('convert', { dto, targetCurrency })
      .pipe(catchError(handleError));
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  paystackWebhook(@Req() req: Request): Observable<any> {
    return this.natsClient
      .send('paystack-webhook', {
        body: req.body as Record<string, any>,
        headers: req.headers,
      })
      .pipe(catchError(handleError));
  }
}
