import { Injectable, Logger } from "@nestjs/common";
import { Cron, Interval } from "@nestjs/schedule";
import { RedisService } from "../../common/services/redis.service";
import { WechatBroadcastService } from "./wechat-broadcast.service";

/** Registered only by WorkerModule. DB rows are authoritative; Redis keeps one ticker running. */
@Injectable()
export class WechatBroadcastWorker {
  private running = false;
  private readonly logger = new Logger(WechatBroadcastWorker.name);
  constructor(
    private readonly service: WechatBroadcastService,
    private readonly redis: RedisService,
  ) {}

  @Interval(5000)
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.redis.withRenewingLock("wechat-broadcast:tick", 60, async () => {
        const settings = await this.service.settings();
        if (!settings.enabled) return;
        await this.service.scan(settings, new Date());
        await this.service.sendDue(settings, new Date());
      });
    } catch (error: any) {
      this.logger.error(
        `订单群播报处理失败，已保留队列：${String(error?.message || error).slice(0, 200)}`,
      );
    } finally {
      this.running = false;
    }
  }

  @Cron("0 30 3 * * *", { timeZone: "Asia/Shanghai" })
  async purge() {
    await this.service.purgeHistory(new Date());
  }
}
