import { Controller, Get, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

@Controller('admin')
export class AdminController {
  constructor(
    @Inject('ADMIN_SERVICE') private readonly natsClient: ClientProxy,
  ) {}

  @Get('test')
  testFunction() {
    return this.natsClient.send('test', { message: 'Testing...' });
  }
}
