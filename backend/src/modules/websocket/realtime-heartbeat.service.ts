import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { RedisService } from "../../common/services/redis.service";
import { WsNativeGateway } from "./ws-native.gateway";
import { RealtimeControlService } from "./realtime-control.service";
import { ConfigService } from "@nestjs/config";
import { SocketIoRedisStateService } from "../../common/services/socket-io-redis-state.service";

@Injectable()
export class RealtimeHeartbeatService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly redis: RedisService,
    private readonly wsNative: WsNativeGateway,
    private readonly control: RealtimeControlService,
    private readonly config: ConfigService,
    private readonly socketIoRedis: SocketIoRedisStateService,
  ) {}

  onApplicationBootstrap() {
    void this.heartbeat();
    this.timer = setInterval(() => void this.heartbeat(), 15_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async heartbeat() {
    const setupMode = this.isSetupWizardMode();
    await this.redis
      .setJson(
        "lm:service:realtime:heartbeat",
        {
          service: "realtime",
          instanceId: this.wsNative.getInstanceId(),
          pid: process.pid,
          mode: setupMode ? "setup" : "runtime",
          ready:
            this.wsNative.isAttached() &&
            (setupMode ||
              (this.wsNative.isPushSubscriberReady() &&
                this.control.isSubscribed() &&
                this.socketIoRedis.isReady())),
          connections: this.wsNative.getOnlineCount(),
          users: this.wsNative.getOnlineUserIds().length,
          updatedAt: new Date().toISOString(),
        },
        45,
      )
      .catch(() => undefined);
  }

  private isSetupWizardMode() {
    const installed = String(
      this.config.get("DB_IS_INSTALLED") || "",
    ).toLowerCase();
    const wizard = String(this.config.get("SETUP_WIZARD") || "").toLowerCase();
    return installed !== "1" || wizard === "true";
  }
}
