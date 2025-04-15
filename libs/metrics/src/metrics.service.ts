import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Registry } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly counter: { [name: string]: Counter<string> } = {};
  private readonly gauge: { [name: string]: Gauge<string> } = {};

  constructor(private readonly registry: Registry) {}

  async getMetrics(): Promise<Record<string, any>> {
    return await this.registry.getMetricsAsJSON();
  }

  updateGauge(
    name: string,
    action: 'dec' | 'inc',
    value?: number,
    labels?: string[],
  ): void {
    if (!this.gauge[name]) {
      this.gauge[name] = new Gauge({
        name,
        help: `${name}`
          .replace(/_/g, ' ')
          .split(' ')
          .map((word) => word[0].toUpperCase())
          .join(' '),
        labelNames: labels,
        registers: [this.registry],
      });
    }

    action === 'dec'
      ? this.gauge[name].dec(value)
      : this.gauge[name].inc(value);
  }

  incrementCounter(name: string, value?: number, labels?: string[]): void {
    if (!this.counter[name]) {
      this.counter[name] = new Counter({
        name,
        help: `${name}`
          .replace(/_/g, ' ')
          .split(' ')
          .map((word) => word[0].toUpperCase())
          .join(' '),
        labelNames: labels,
        registers: [this.registry],
      });
    }

    this.counter[name].inc(value);
  }
}
