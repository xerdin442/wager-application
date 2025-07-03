import { Controller } from '@nestjs/common';
import { WagerService } from './wager.service';
import { MessagePattern } from '@nestjs/microservices';
import { Message, User, Wager } from '@prisma/client';
import {
  CreateWagerDTO,
  DisputeResolutionDTO,
  UpdateWagerDTO,
  WagerInviteDTO,
} from './dto';
import { UtilsService } from '@app/utils';
import { MetricsService } from '@app/metrics';

@Controller()
export class WagerController {
  private readonly context: string = WagerController.name;
  constructor(
    private readonly wagerService: WagerService,
    private readonly utils: UtilsService,
    private readonly metrics: MetricsService,
  ) {}

  @MessagePattern('wager-metrics')
  async getMetrics(): Promise<Record<string, any>> {
    return this.metrics.getMetrics();
  }

  @MessagePattern('create')
  async createWager(data: {
    user: User;
    dto: CreateWagerDTO;
  }): Promise<{ wager: Wager }> {
    try {
      const { dto, user } = data;
      const wager = await this.wagerService.createWager(user.id, dto);

      this.utils
        .logger()
        .info(
          `[${this.context}] ${user.email} created a new wager: ${wager.title}.\n`,
        );

      return { wager };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while creating a new wager. Error: ${error.message}.\n`,
        );

      throw error;
    }
  }

  @MessagePattern('update')
  async updateWager(data: {
    userId: number;
    dto: UpdateWagerDTO;
    wagerId: number;
  }): Promise<{ message: string }> {
    try {
      const { dto, userId, wagerId } = data;
      await this.wagerService.updateWager(userId, wagerId, dto);

      return { message: 'Wager updated successfully' };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while updating wager details. Error: ${error.message}.\n`,
        );

      throw error;
    }
  }

  @MessagePattern('invite')
  async findWagerByInviteCode(data: {
    dto: WagerInviteDTO;
  }): Promise<{ wager: Wager }> {
    try {
      return { wager: await this.wagerService.findWagerByInviteCode(data.dto) };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while inviting new player to wager. Error: ${error.message}.\n`,
        );

      throw error;
    }
  }

  @MessagePattern('details')
  async getWagerDetails(data: { wagerId: number }): Promise<{ wager: Wager }> {
    try {
      return { wager: await this.wagerService.getWagerDetails(data.wagerId) };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while retrieving wager details. Error: ${error.message}.\n`,
        );

      throw error;
    }
  }

  @MessagePattern('join')
  async joinWager(data: {
    wagerId: number;
    user: User;
  }): Promise<{ message: string }> {
    try {
      const { user, wagerId } = data;
      const wagerTitle = await this.wagerService.joinWager(user.id, wagerId);

      this.utils
        .logger()
        .info(`[${this.context}] ${user.email} joined ${wagerTitle} wager.\n`);

      return { message: 'Successfully joined wager' };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while joining a new wager. Error: ${error.message}.\n`,
        );

      throw error;
    }
  }

  @MessagePattern('claim')
  async claimWager(data: {
    wagerId: number;
    user: User;
  }): Promise<{ message: string }> {
    try {
      const { user, wagerId } = data;
      const wagerTitle = await this.wagerService.claimWager(user.id, wagerId);

      this.utils
        .logger()
        .info(
          `[${this.context}] ${user.email} claimed the prize in ${wagerTitle} wager.\n`,
        );

      return {
        message: 'Prize claimed successfully, awaiting response from opponent',
      };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while claiming wager prize. Error: ${error.message}.\n`,
        );

      throw error;
    }
  }

  @MessagePattern('accept-claim')
  async acceptWagerClaim(data: {
    wagerId: number;
  }): Promise<{ message: string }> {
    try {
      await this.wagerService.acceptWagerClaim(data.wagerId);
      return { message: 'Wager claim accepted, better luck next time!' };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while accepting wager prize claim. Error: ${error.message}.\n`,
        );

      throw error;
    }
  }

  @MessagePattern('contest-claim')
  async contestWagerClaim(data: {
    wagerId: number;
  }): Promise<{ message: string }> {
    try {
      await this.wagerService.contestWagerClaim(data.wagerId);
      return {
        message:
          'Wager claim contested, dispute resolution has been initiated.',
      };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while contesting wager prize claim. Error: ${error.message}.\n`,
        );

      throw error;
    }
  }

  @MessagePattern('delete')
  async deleteWager(data: {
    wagerId: number;
    userId: number;
  }): Promise<{ message: string }> {
    try {
      const { userId, wagerId } = data;
      await this.wagerService.deleteWager(userId, wagerId);

      return { message: 'Wager deleted successfully' };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while deleting wager. Error: ${error.message}.\n`,
        );

      throw error;
    }
  }

  @MessagePattern('dispute-chat')
  async getDisputeChatMessages(data: {
    wagerId: number;
  }): Promise<{ messages: Message[] }> {
    try {
      return {
        messages: await this.wagerService.getDisputeChatMessages(data.wagerId),
      };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while retrieving dispute chat messages. Error: ${error.message}.\n`,
        );

      throw error;
    }
  }

  @MessagePattern('resolve-dispute')
  async assignWinnerAfterResolution(data: {
    wagerId: number;
    dto: DisputeResolutionDTO;
  }): Promise<{ message: string }> {
    try {
      const { dto, wagerId } = data;
      await this.wagerService.assignWinnerAfterResolution(wagerId, dto);

      return { message: 'Dispute resolution successful' };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while resolving wager dispute. Error: ${error.message}.\n`,
        );

      throw error;
    }
  }
}
