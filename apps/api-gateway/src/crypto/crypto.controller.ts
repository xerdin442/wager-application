import { Controller, Get, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

@Controller('wallet/crypto')
export class CryptoController {
  constructor(
    @Inject('CRYPTO_SERVICE') private readonly natsClient: ClientProxy,
  ) {}

  @Get('test')
  testFunction() {
    return this.natsClient.send('test', { message: 'Testing...' });
  }
}
