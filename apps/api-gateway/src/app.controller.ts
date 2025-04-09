import { MetricsService } from '@app/metrics';
import { Controller, Get } from '@nestjs/common';

@Controller('metrics')
export class AppController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  async getMetrics() {
    return this.metricsService.getMetrics();
  }
}
