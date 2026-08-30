import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";
import { RedisService } from "./common/services/redis.service";

@Injectable()
export class WorkerHeartbeatService implements OnModuleInit {
  private readonly instanceId = `${process.pid}-${Date.now()}`;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.heartbeat();
  }

  @Interval(15_000)
  async heartbeat() {
    if (this.isSetupWizardMode()) return;
    await this.redis.setJson(
      "lm:service:worker:heartbeat",
      {
        service: "worker",
        instanceId: this.instanceId,
        pid: process.pid,
        mode: "runtime",
        ready: true,
        updatedAt: new Date().toISOString(),
      },
      45,
    );
  }

  private isSetupWizardMode() {
    const installed = String(
      this.config.get("DB_IS_INSTALLED") || "",
    ).toLowerCase();
    const wizard = String(this.config.get("SETUP_WIZARD") || "").toLowerCase();
    return installed !== "1" || wizard === "true";
  }
}
