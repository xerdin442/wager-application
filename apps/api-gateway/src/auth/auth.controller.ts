import { Controller, Get, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly natsClient: ClientProxy,
  ) {}

  @Get('test')
  testFunction() {
    return this.natsClient.send('test', { message: 'Testing...' });
  }
}
