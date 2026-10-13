import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { AcademicService } from "./academic.service";
@Injectable()
export class AcademicWorker {
  private running = false;
  private readonly logger = new Logger(AcademicWorker.name);
  constructor(private readonly service: AcademicService) {}
  @Interval(30000)
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      await this.service.sweep();
    } catch {
      this.logger.error("课程提醒任务执行失败，请检查数据库与微信配置");
    } finally {
      this.running = false;
    }
  }
}
