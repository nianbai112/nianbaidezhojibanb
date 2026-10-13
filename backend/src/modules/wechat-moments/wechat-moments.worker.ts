import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WechatMomentsService } from './wechat-moments.service';

// 只在 WorkerModule 注册。多实例由 Redis 锁保证同一时刻只有一个在发。
@Injectable()
export class WechatMomentsWorker {
  private readonly logger = new Logger(WechatMomentsWorker.name);

  constructor(private readonly service: WechatMomentsService) {}

  /** 每天整点、半点各一次：收集这半小时审核通过的帖子，最多 9 张合成一条朋友圈 */
  @Cron('0 0,30 * * * *', { timeZone: 'Asia/Shanghai' })
  async run() {
    try {
      const result = await this.service.runBatch('cron');
      if (!['disabled', 'idle', 'locked'].includes(result.status)) {
        this.logger.log(`朋友圈同步：${result.status}${result.message ? ` ${result.message}` : ''}`);
      }
    } catch (error: any) {
      this.logger.error(`朋友圈同步任务异常：${error?.message}`);
    }
  }
}
