import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { Registry } from 'prom-client';

@Module({
  providers: [
    MetricsService,
    {
      provide: Registry,
      useFactory: () => {
        const registry = new Registry();
        registry.setDefaultLabels({ app: process.env.APP_NAME as string });
        return registry;
      },
    },
  ],
  exports: [Registry, MetricsService],
})
export class MetricsModule {}
