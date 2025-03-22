import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { AuthGuard } from '@nestjs/passport';
import { CryptoWithdrawalDto } from './dto';
import { GetUser } from '@src/custom/decorators';
import { User } from '@prisma/client';
import logger from '@src/common/logger';

@Controller('wallet/crypto')
@UseGuards(AuthGuard('jwt'))
export class CryptoController {
  private readonly context: string = CryptoController.name;

  constructor(private readonly cryptoService: CryptoService) { };

  @Get('deposit/address')
  async getDepositAddress(
    @GetUser() user: User,
    @Query('chain') chain: string
  ): Promise<{ address: string }> {
    try {
      switch (chain) {
        case 'base':
          return { address: user.ethAddress };

        case 'solana':
          return { address: user.solAddress };

        default:
          throw new BadRequestException('Invalid value for chain query parameter. Expected "base" or "solana".');
      }
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while retrieving user's deposit address. Error: ${error.message}\n`);
      throw error;
    }
  }

  @Post('withdraw')
  @HttpCode(HttpStatus.OK)
  async processWithdrawal(
    @GetUser() user: User,
    @Query('chain') chain: string,
    @Body() dto: CryptoWithdrawalDto
  ): Promise<{ message: string }> {
    try {
      switch (chain) {
        case 'base':
          const hash = await this.cryptoService.processWithdrawalOnBase(user.id, dto);
          return { message: `Your withdrawal is complete. Verify this transaction on basescan.io: ${hash}` };

        case 'solana':
          const signature = await this.cryptoService.processWithdrawalOnSolana(user.id, dto);
          return { message: `Your withdrawal is complete. Verify this transaction on solscan.io: ${signature}` };

        default:
          throw new BadRequestException('Invalid value for chain query parameter. Expected "base" or "solana".');
      }
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while processing crypto withdrawal. Error: ${error.message}\n`);
      throw error;
    }
  }
}
