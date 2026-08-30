import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "../../common/services/redis.service";
import { MessageGateway } from "./message.gateway";
import { WsNativeGateway } from "./ws-native.gateway";

@Injectable()
export class RealtimeControlService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeControlService.name);
  private subscriber?: ReturnType<RedisService["getClient"]>;
  private subscribed = false;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly wsNative: WsNativeGateway,
    private readonly messageGateway: MessageGateway,
  ) {}

  async onModuleInit() {
    if (this.isSetupWizardMode()) {
      this.logger.log(
        "Setup wizard mode detected, realtime control bridge is idle",
      );
      return;
    }
    const subscriber = this.redis.getClient().duplicate();
    this.subscriber = subscriber;
    subscriber.on("message", (_channel, raw) => this.handleCommand(raw));
    subscriber.on("error", (error) => {
      this.logger.warn(`Realtime control subscriber error: ${error.message}`);
    });
    subscriber.on("close", () => {
      this.subscribed = false;
    });
    subscriber.on("ready", () => {
      if (this.subscribed) return;
      void subscriber
        .subscribe(this.wsNative.getControlChannel())
        .then(() => {
          this.subscribed = true;
        })
        .catch((error) => {
          this.logger.warn(
            `Realtime control resubscribe failed: ${error.message}`,
          );
        });
    });
    await subscriber.subscribe(this.wsNative.getControlChannel());
    this.subscribed = true;
    this.logger.log(
      `Realtime control subscribed: ${this.wsNative.getControlChannel()}`,
    );
  }

  onModuleDestroy() {
    this.subscriber?.disconnect();
    this.subscriber = undefined;
    this.subscribed = false;
  }

  isSubscribed() {
    return this.subscribed;
  }

  private handleCommand(raw: string) {
    try {
      const message = JSON.parse(raw);
      if (message?.command !== "disconnect_user") return;
      const userId = String(message?.data?.userId || "").trim();
      if (!userId) return;
      const nativeSockets = this.wsNative.disconnectUserLocal(userId);
      const socketIoSockets = this.messageGateway.disconnectUser(userId);
      this.logger.log(
        `Realtime disconnect command applied: userId=${userId} native=${nativeSockets} socketIo=${socketIoSockets}`,
      );
    } catch (error: any) {
      this.logger.warn(
        `Realtime control command ignored: ${error?.message || error}`,
      );
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
