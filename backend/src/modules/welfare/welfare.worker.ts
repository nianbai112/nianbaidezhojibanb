import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { WelfareService } from "./welfare.service";
import { WelfareWecomService } from "./welfare-wecom.service";

// Registered only in WorkerModule. Multiple workers remain safe through database locks.
@Injectable()
export class WelfareWorker {
  private running = false;
  private readonly logger = new Logger(WelfareWorker.name);
  constructor(private readonly service: WelfareService, private readonly wecom: WelfareWecomService) {}
  @Interval(10000)
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      await this.service.sweep();
      await this.wecom.sweep();
    } catch (error: any) {
      this.logger.error(`抽奖任务执行失败：${error.message}`);
    } finally {
      this.running = false;
    }
  }
}
