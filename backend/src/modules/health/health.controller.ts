import { Controller, Get, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

/**
 * HealthController — 公开只读健康检查端点
 *
 * GET /healthz 仅检查进程存活，返回 { status: "ok", timestamp }
 * 不需要 JWT 认证，供 Docker HEALTHCHECK / K8s liveness probe / 负载均衡器使用。
 *
 * 注意：运维中心的管理端健康检查在 /admin/ops/health（需要超级管理员权限）
 */
@ApiTags('健康检查')
@Controller()
export class HealthController {
  @Get('healthz')
  @HttpCode(200)
  @ApiOperation({ summary: '公开健康检查（进程存活）' })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
