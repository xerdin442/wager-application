import { Global, Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { Registry } from 'prom-client';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  providers: [
    MetricsService,
    {
      provide: Registry,
      useFactory: (config: ConfigService) => {
        const registry = new Registry();
        registry.setDefaultLabels({
          app: config.getOrThrow<string>('APP_NAME'),
        });
        return registry;
      },
      inject: [ConfigService],
    },
  ],
  exports: [Registry, MetricsService],
})
export class MetricsModule {}
