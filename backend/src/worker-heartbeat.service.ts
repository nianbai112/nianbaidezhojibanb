import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";
import { ServiceHeartbeatStore } from "./common/services/service-heartbeat.store";

@Injectable()
export class WorkerHeartbeatService implements OnModuleInit, OnModuleDestroy {
  private readonly instanceId = `${process.pid}-${Date.now()}`;

  constructor(
    private readonly heartbeats: ServiceHeartbeatStore,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.heartbeat();
  }

  @Interval(15_000)
  async heartbeat() {
    if (this.isSetupWizardMode()) return;
    await this.heartbeats.publish("worker", this.instanceId, {
      pid: process.pid,
      mode: "runtime",
      ready: true,
      updatedAt: new Date().toISOString(),
    });
  }

  async onModuleDestroy() {
    await this.heartbeats.remove("worker", this.instanceId);
  }

  private isSetupWizardMode() {
    const installed = String(
      this.config.get("DB_IS_INSTALLED") || "",
    ).toLowerCase();
    const wizard = String(this.config.get("SETUP_WIZARD") || "").toLowerCase();
    return installed !== "1" || wizard === "true";
  }
}
