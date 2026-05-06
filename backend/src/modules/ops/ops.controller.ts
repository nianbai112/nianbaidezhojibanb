import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { OpsService } from "./ops.service";
import { JwtGuard } from "../../guards/jwt.guard";
import { AdminGuard } from "../../guards/admin.guard";
import { CurrentUser } from "../../decorators/current-user.decorator";
import { Request } from "express";

@ApiTags("运维中心")
@Controller()
@UseGuards(JwtGuard, AdminGuard)
@ApiBearerAuth()
export class OpsController {
  constructor(private readonly opsService: OpsService) {}

  @Get("admin/ops/overview")
  @ApiOperation({ summary: "运维概览" })
  async overview(@CurrentUser("sub") accountId: string) {
    await this.opsService.ensureSuperAdmin(accountId);
    return this.opsService.getOverview();
  }

  @Get("admin/ops/health")
  @ApiOperation({ summary: "服务器健康状态" })
  async health(@CurrentUser("sub") accountId: string) {
    await this.opsService.ensureSuperAdmin(accountId);
    return this.opsService.getHealth();
  }

  @Get("admin/ops/logs")
  @ApiOperation({ summary: "服务器日志" })
  async logs(@CurrentUser("sub") accountId: string, @Query() query: any) {
    await this.opsService.ensureSuperAdmin(accountId);
    return this.opsService.getLogs(query);
  }

  @Get("admin/ops/actions")
  @ApiOperation({ summary: "运维操作记录" })
  async actions(@CurrentUser("sub") accountId: string, @Query() query: any) {
    await this.opsService.ensureSuperAdmin(accountId);
    return this.opsService.getActions(query);
  }

  @Post("admin/ops/restart")
  @ApiOperation({ summary: "重启后端服务" })
  async restart(
    @CurrentUser("sub") accountId: string,
    @Body() dto: { reason: string; confirmText: string },
    @Req() req: Request,
  ) {
    return this.opsService.restart(
      accountId,
      dto,
      req.ip,
      req.headers["user-agent"] as string,
    );
  }

  @Post("admin/ops/logs/cleanup")
  @ApiOperation({ summary: "清理日志" })
  async cleanupLogs(
    @CurrentUser("sub") accountId: string,
    @Body() dto: { beforeDays: number },
  ) {
    return this.opsService.cleanupLogs(accountId, dto);
  }
}
