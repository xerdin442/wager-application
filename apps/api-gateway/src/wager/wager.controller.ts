import { Controller, Get, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

@Controller('wagers')
export class WagerController {
  constructor(
    @Inject('WAGER_SERVICE') private readonly natsClient: ClientProxy,
  ) {}

  @Get('test')
  testFunction() {
    return this.natsClient.send('test', { message: 'Testing...' });
  }
}
