import { Controller, Get } from '@nestjs/common';
import { CryptoServiceService } from './crypto-service.service';

@Controller()
export class CryptoServiceController {
  constructor(private readonly cryptoServiceService: CryptoServiceService) {}

  @Get()
  getHello(): string {
    return this.cryptoServiceService.getHello();
  }
}
