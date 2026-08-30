import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "./common/services/redis.service";
import { SocketIoRedisStateService } from "./common/services/socket-io-redis-state.service";
import { RealtimeControlService } from "./modules/websocket/realtime-control.service";
import { WsNativeGateway } from "./modules/websocket/ws-native.gateway";

@Controller("healthz")
export class RealtimeHealthController {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly wsNative: WsNativeGateway,
    private readonly control: RealtimeControlService,
    private readonly socketIoRedis: SocketIoRedisStateService,
  ) {}

  @Get()
  async health() {
    try {
      await this.redis.getClient().ping();
      const setupMode = this.isSetupWizardMode();
      const checks = {
        serverAttached: this.wsNative.isAttached(),
        pushSubscriber: this.wsNative.isPushSubscriberReady(),
        controlSubscriber: this.control.isSubscribed(),
        socketIoRedisAdapter: this.socketIoRedis.getStatus(),
      };
      const ready =
        checks.serverAttached &&
        (setupMode ||
          (checks.pushSubscriber &&
            checks.controlSubscriber &&
            checks.socketIoRedisAdapter.ready));
      if (!ready) {
        throw new ServiceUnavailableException({
          status: "degraded",
          service: "realtime",
          mode: setupMode ? "setup" : "runtime",
          checks,
        });
      }
      return {
        status: "ok",
        service: "realtime",
        mode: setupMode ? "setup" : "runtime",
        checks,
        pid: process.pid,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException({
        status: "degraded",
        service: "realtime",
        redis: error?.message || "unavailable",
      });
    }
  }

  private isSetupWizardMode() {
    const installed = String(
      this.config.get("DB_IS_INSTALLED") || "",
    ).toLowerCase();
    const wizard = String(this.config.get("SETUP_WIZARD") || "").toLowerCase();
    return installed !== "1" || wizard === "true";
  }
}
