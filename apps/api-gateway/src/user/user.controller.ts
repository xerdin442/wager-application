import { Controller, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

@Controller('user')
export class UserController {
  constructor(
    @Inject('USER_SERVICE') private readonly natsClient: ClientProxy,
  ) {}
}
