import {
  Controller,
  Get,
  HttpCode,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import {
  ServiceHeartbeat,
  ServiceHeartbeatStore,
} from "../../common/services/service-heartbeat.store";

/**
 * HealthController — 公开只读健康检查端点
 *
 * GET /healthz 仅检查进程存活，返回 { status: "ok", timestamp }
 * 不需要 JWT 认证，供 Docker HEALTHCHECK / K8s liveness probe / 负载均衡器使用。
 *
 * 注意：运维中心的管理端健康检查在 /admin/ops/health（需要超级管理员权限）
 */
@ApiTags("健康检查")
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(
    private readonly heartbeats: ServiceHeartbeatStore,
    private readonly config: ConfigService,
  ) {}

  @Get("healthz")
  @HttpCode(200)
  @ApiOperation({ summary: "公开健康检查（进程存活）" })
  check() {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("healthz/services")
  @HttpCode(200)
  @ApiOperation({ summary: "API、Worker、Realtime 聚合就绪检查" })
  async services() {
    if (this.isSetupWizardMode()) {
      return {
        status: "ok",
        mode: "setup",
        services: { api: "up", worker: "idle", realtime: "idle" },
        timestamp: new Date().toISOString(),
      };
    }

    let worker: ServiceHeartbeat[];
    let realtime: ServiceHeartbeat[];
    try {
      [worker, realtime] = await Promise.all([
        this.heartbeats.list("worker"),
        this.heartbeats.list("realtime"),
      ]);
    } catch {
      throw new ServiceUnavailableException({
        status: "degraded",
        services: { api: "up", worker: "unknown", realtime: "unknown" },
        dependency: "redis",
        message: "unavailable",
        timestamp: new Date().toISOString(),
      });
    }
    const services = {
      api: { status: "up" },
      worker: this.toServiceGroupStatus(worker, "runtime"),
      realtime: this.toServiceGroupStatus(realtime, "runtime"),
    };
    const ready =
      services.worker.status === "up" && services.realtime.status === "up";
    const body = {
      status: ready ? "ok" : "degraded",
      services,
      timestamp: new Date().toISOString(),
    };
    if (!ready) throw new ServiceUnavailableException(body);
    return body;
  }

  private toServiceGroupStatus(
    heartbeats: ServiceHeartbeat[],
    requiredMode?: string,
  ) {
    const instances = heartbeats.map((heartbeat) =>
      this.toServiceStatus(heartbeat, requiredMode),
    );
    const readyInstances = instances.filter(
      (instance) => instance.status === "up",
    ).length;
    const ready = instances.length > 0 && readyInstances === instances.length;
    const latest = [...instances].sort((left, right) =>
      String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")),
    )[0];
    return {
      status: ready ? "up" : "down",
      ready,
      totalInstances: instances.length,
      readyInstances,
      mode: latest?.mode || null,
      updatedAt: latest?.updatedAt || null,
      instances,
    };
  }

  private toServiceStatus(
    heartbeat: ServiceHeartbeat | null,
    requiredMode?: string,
  ) {
    const updatedAt = heartbeat?.updatedAt || null;
    const ageMs = updatedAt ? Date.now() - Date.parse(updatedAt) : NaN;
    const fresh = Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= 45_000;
    const ready =
      fresh &&
      heartbeat?.ready === true &&
      (!requiredMode || heartbeat?.mode === requiredMode);
    return {
      status: ready ? "up" : "down",
      instanceId: heartbeat?.instanceId || null,
      mode: heartbeat?.mode || null,
      ready: heartbeat?.ready === true,
      updatedAt,
    };
  }

  private isSetupWizardMode() {
    const installed = String(
      this.config.get("DB_IS_INSTALLED") || "",
    ).toLowerCase();
    const wizard = String(this.config.get("SETUP_WIZARD") || "").toLowerCase();
    return installed !== "1" || wizard === "true";
  }
}
