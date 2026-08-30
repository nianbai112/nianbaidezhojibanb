import {
  Controller,
  Get,
  HttpCode,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { RedisService } from "../../common/services/redis.service";

type ServiceHeartbeat = {
  service?: string;
  instanceId?: string;
  mode?: string;
  ready?: boolean;
  updatedAt?: string;
};

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
    private readonly redis: RedisService,
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

    let worker: ServiceHeartbeat | null;
    let realtime: ServiceHeartbeat | null;
    try {
      [worker, realtime] = await Promise.all([
        this.redis.getJson<ServiceHeartbeat>("lm:service:worker:heartbeat"),
        this.redis.getJson<ServiceHeartbeat>("lm:service:realtime:heartbeat"),
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
      worker: this.toServiceStatus(worker, "runtime"),
      realtime: this.toServiceStatus(realtime, "runtime"),
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
