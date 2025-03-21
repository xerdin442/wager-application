import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { AuthGuard } from '@nestjs/passport';
import { CryptoDepositDto, CryptoWithdrawalDto } from './dto';
import { GetUser } from '@src/custom/decorators';
import { User } from '@prisma/client';
import logger from '@src/common/logger';

@Controller('wallet/crypto')
@UseGuards(AuthGuard('jwt'))
export class CryptoController {
  private readonly context: string = CryptoController.name;

  constructor(private readonly cryptoService: CryptoService) { };

  @Post('deposit')
  @HttpCode(HttpStatus.OK)
  async processDeposit(
    @GetUser() user: User,
    @Query('chain') chain: string,
    @Body() dto: CryptoDepositDto
  ) { }

  @Post('withdraw')
  @HttpCode(HttpStatus.OK)
  async processWithdrawal(
    @GetUser() user: User,
    @Query('chain') chain: string,
    @Body() dto: CryptoWithdrawalDto
  ): Promise<{ message: string }> {
    try {
      switch (chain) {
        case 'ETH':
          const hash = await this.cryptoService.processUSDTWithdrawal(user.id, dto);
          return { message: `Your withdrawal is complete. Verify this transaction on etherscan.io: ${hash}` };

        case 'SOL':
          return;

        default:
          throw new BadRequestException('Invalid value for chain query parameter. Expected "ETH" or "SOL".');
      }
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while processing crypto deposit. Error: ${error.message}\n`);
      throw error;
    }
  }
}
