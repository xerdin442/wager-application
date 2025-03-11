import { Process, Processor } from "@nestjs/bull";
import { Injectable } from "@nestjs/common";
import { DbService } from "@src/db/db.service";
import { MetricsService } from "@src/metrics/metrics.service";
import { FiatService } from "@src/wallet/fiat/fiat.service";
import { Job } from "bull";

@Injectable()
@Processor('fiat-queue')
export class FiatProcessor {
  private readonly context: string = FiatProcessor.name;

  constructor(
    private readonly payments: FiatService,
    private readonly prisma: DbService,
    private readonly metrics: MetricsService
  ) {};

  @Process('transaction')
  async finalizeTransaction(job: Job) {}

  @Process('transfer')
  async finalizeTransfer(job: Job) {}
}