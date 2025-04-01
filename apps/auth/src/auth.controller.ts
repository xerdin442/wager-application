import { Controller } from '@nestjs/common';
import { AuthService } from './auth.service';
import { MessagePattern } from '@nestjs/microservices';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @MessagePattern('test')
  testFUnction(data: { message: string }): string {
    return `Receieved message: ${data.message}`;
  }
}
