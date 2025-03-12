import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { WagersService } from './wagers.service';
import { GetUser } from '@src/custom/decorators';
import { Message, User, Wager } from '@prisma/client';
import {
  CreateWagerDto,
  UpdateWagerDto,
  WagerInviteDto
} from './dto';
import logger from '@src/common/logger';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '@src/custom/guards';

@Controller('wagers')
@UseGuards(AuthGuard('jwt'))
export class WagersController {
  private readonly context: string = WagersController.name;

  constructor(private readonly wagersService: WagersService) {};

  @Post('create')
  async createWager(
    @GetUser() user: User,
    @Body() dto: CreateWagerDto
  ): Promise<{ wager: Wager }> {
    try {
      const wager = await this.wagersService.createWager(user.id, dto);
      logger.info(`[${this.context}] ${user.email} created a new wager: ${wager.title}.\n`);

      return { wager }
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while creating a new wager. Error: ${error.message}.\n`);
      throw error;
    }
  }

  @Patch(':wagerId')
  async updateWager(
    @GetUser() user: User,
    @Param('wagerId', ParseIntPipe) wagerId: number,
    @Body() dto: UpdateWagerDto
  ): Promise<{ message: string }> {
    try {
      await this.wagersService.updateWager(user.id, wagerId, dto);
      return { message: 'Wager updated successfully' };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while updating wager details. Error: ${error.message}.\n`);
      throw error;
    }
  }

  @Post('invite')
  @HttpCode(HttpStatus.OK)
  async findWagerByInviteCode(@Body() dto: WagerInviteDto): Promise<{ wager: Wager }> {
    try {
      return { wager: await this.wagersService.findWagerByInviteCode(dto) };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while inviting new player to wager. Error: ${error.message}.\n`);
      throw error;
    }
  }

  @Post(':wagerId/join')
  @HttpCode(HttpStatus.OK)
  async joinWager(
    @GetUser() user: User,
    @Param('wagerId', ParseIntPipe) wagerId: number
  ): Promise<{ message: string }> {
    try {
      const wagerTitle = await this.wagersService.joinWager(user.id, wagerId);
      logger.info(`[${this.context}] ${user.email} joined ${wagerTitle} wager.\n`);

      return { message: 'Successfully joined wager' };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while joining a new wager. Error: ${error.message}.\n`);
      throw error;
    }
  }

  @Get(':wagerId')
  async getWagerDetails(@Param('wagerId', ParseIntPipe) wagerId: number): Promise<{ wager: Wager }> {
    try {
      return { wager: await this.wagersService.getWagerDetails(wagerId) };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while retrieving wager details. Error: ${error.message}.\n`);
      throw error;
    }
  }

  @Post(':wagerId/claim')
  @HttpCode(HttpStatus.OK)
  async claimWager(
    @GetUser() user: User,
    @Param('wagerId', ParseIntPipe) wagerId: number
  ): Promise<{ message: string }> {
    try {
      const wagerTitle = await this.wagersService.claimWager(user.id, wagerId);
      logger.info(`[${this.context}] ${user.email} claimed the prize in ${wagerTitle} wager.\n`);

      return { message: 'Prize claimed successfully, awaiting response from opponent' };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while claiming wager prize. Error: ${error.message}.\n`);
      throw error;
    }
  }

  @Post(':wagerId/claim/accept')
  @HttpCode(HttpStatus.OK)
  async acceptWagerClaim(@Param('wagerId', ParseIntPipe) wagerId: number): Promise<{ message: string }> {
    try {
      await this.wagersService.acceptWagerClaim(wagerId);
      return { message: 'Wager claim accepted, better luck next time!' };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while accepting wager prize claim. Error: ${error.message}.\n`);
      throw error;
    }
  }

  @Post(':wagerId/claim/contest')
  @HttpCode(HttpStatus.OK)
  async contestWagerClaim(@Param('wagerId', ParseIntPipe) wagerId: number): Promise<{ message: string }> {
    try {
      await this.wagersService.contestWagerClaim(wagerId);
      return { message: 'Wager claim contested, dispute resolution initiated.' };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while contesting wager prize claim. Error: ${error.message}.\n`);
      throw error;
    }
  }

  @Delete(':wagerId')
  async deleteWager(
    @GetUser() user: User,
    @Param('wagerId', ParseIntPipe) wagerId: number
  ): Promise<{ message: string }> {
    try {
      await this.wagersService.deleteWager(user.id, wagerId);
      return { message: 'Wager deleted successfully' };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while deleting wager. Error: ${error.message}.\n`);
      throw error;
    }
  }

  @Get(':wagerId/dispute/chat')
  async getDisputeChatMessages(@Param('wagerId', ParseIntPipe) wagerId: number): Promise<{ messages: Message[] }> {
    try {
      return { messages: await this.wagersService.getDisputeChatMessages(wagerId) };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while retrieving dispute chat messages. Error: ${error.message}.\n`);
      throw error;
    }
  }

  @Post(':wagerId/dispute/resolve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminGuard)
  async assignWinnerAfterResolution(
    @Param('wagerId', ParseIntPipe) wagerId: number,
    @Query('username') username: string
  ): Promise<{ message: string }> {
    try {
      await this.wagersService.assignWinnerAfterResolution(wagerId, username);
      return { message: 'Dispute resolution successful' };
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while resolving wager dispute. Error: ${error.message}.\n`);
      throw error;
    }
  }
}
