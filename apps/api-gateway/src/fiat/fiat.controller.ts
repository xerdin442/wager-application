import { Controller, Get, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

@Controller('wallet/fiat')
export class FiatController {
  constructor(
    @Inject('FIAT_SERVICE') private readonly natsClient: ClientProxy,
  ) {}

  @Get('test')
  testFunction() {
    return this.natsClient.send('test', { message: 'Testing...' });
  }
}
