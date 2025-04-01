import { Controller, Get } from '@nestjs/common';
import { FiatService } from './fiat.service';

@Controller()
export class FiatController {
  constructor(private readonly fiatService: FiatService) {}

  @Get()
  getHello(): string {
    return this.fiatService.getHello();
  }
}
