import { Controller, Get } from '@nestjs/common';
import { WagersServiceService } from './wagers-service.service';

@Controller()
export class WagersServiceController {
  constructor(private readonly wagersServiceService: WagersServiceService) {}

  @Get()
  getHello(): string {
    return this.wagersServiceService.getHello();
  }
}
