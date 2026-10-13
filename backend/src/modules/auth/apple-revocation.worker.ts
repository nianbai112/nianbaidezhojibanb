import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AppleLifecycleService } from './apple-lifecycle.service';

// Only registered in WorkerModule, never in the HTTP module's providers.
@Injectable()
export class AppleRevocationWorker {
  private running = false;
  private readonly logger = new Logger(AppleRevocationWorker.name);
  constructor(private readonly lifecycle: AppleLifecycleService) {}
  @Interval(30000)
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.lifecycle.drainRevocations();
      if (result.attempted !== result.completed) this.logger.warn('部分 Apple 授权撤销任务等待重试，请检查渠道与密钥配置');
    } catch { this.logger.warn('Apple 授权撤销队列暂不可用，稍后重试'); }
    finally { this.running = false; }
  }
}
