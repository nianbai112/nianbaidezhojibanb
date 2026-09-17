import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { WelfareService } from './welfare.service';

// Registered only in WorkerModule. Multiple workers remain safe through database locks.
@Injectable()
export class WelfareWorker {
  private running = false;
  private readonly logger = new Logger(WelfareWorker.name);
  constructor(private readonly service: WelfareService) {}
  @Interval(10000)
  async run() {
    if (this.running) return;
    this.running = true;
    try { await this.service.sweep(); }
    catch (error: any) { this.logger.error(`抽奖任务执行失败：${error.message}`); }
    finally { this.running = false; }
  }
}
