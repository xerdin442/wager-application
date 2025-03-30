import { Controller, Get } from '@nestjs/common';
import { FiatServiceService } from './fiat-service.service';

@Controller()
export class FiatServiceController {
  constructor(private readonly fiatServiceService: FiatServiceService) {}

  @Get()
  getHello(): string {
    return this.fiatServiceService.getHello();
  }
}
