import { Controller } from '@nestjs/common';
import { WagerService } from './wager.service';
import { MessagePattern } from '@nestjs/microservices';

@Controller()
export class WagerController {
  constructor(private readonly wagerService: WagerService) {}

  @MessagePattern('test')
  testFUnction(data: { message: string }): string {
    return `Receieved message: ${data.message}`;
  }
}
