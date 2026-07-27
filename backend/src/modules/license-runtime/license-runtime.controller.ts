import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request, Response } from "express";
import { JwtGuard } from "../../guards/jwt.guard";
import { AdminGuard, SuperAdminGuard } from "../../guards/admin.guard";
import { LicenseRuntimeService } from "./license-runtime.service";

@ApiTags("授权与更新")
@Controller("admin/license-runtime")
@UseGuards(JwtGuard, AdminGuard, SuperAdminGuard)
@ApiBearerAuth()
export class LicenseRuntimeController {
  constructor(private readonly runtime: LicenseRuntimeService) {}

  @Get("status")
  @ApiOperation({ summary: "客户系统授权状态" })
  status() {
    return this.runtime.getAdminStatus();
  }

  @Post("config")
  @ApiOperation({ summary: "保存客户系统授权配置" })
  saveConfig(@Body() body: Record<string, unknown>) {
    return this.runtime.saveRuntimeConfig(body);
  }

  @Post("check")
  @ApiOperation({ summary: "立即校验授权" })
  check(@Req() req: Request) {
    return this.runtime.checkLicenseNow(this.getRequestMeta(req));
  }

  @Post("updates/check")
  @ApiOperation({ summary: "检查系统更新" })
  checkUpdate(@Body() body: { component?: string }, @Req() req: Request) {
    return this.runtime.checkUpdate(body?.component || "full", this.getRequestMeta(req));
  }

  @Post("updates/download")
  @ApiOperation({ summary: "下载并校验更新包" })
  downloadUpdate(@Body() body: { update?: Record<string, unknown> }) {
    return this.runtime.downloadUpdatePackage(body?.update);
  }

  @Get("updates/download-status")
  @ApiOperation({ summary: "更新包后台下载状态" })
  downloadStatus() {
    return this.runtime.getDownloadStatus();
  }

  @Post("updates/apply")
  @ApiOperation({ summary: "一键应用已下载的更新包" })
  applyUpdate() {
    return this.runtime.applyDownloadedUpdate();
  }

  @Get("updates/apply-status")
  @ApiOperation({ summary: "一键更新执行状态" })
  applyStatus() {
    return this.runtime.getApplyStatus();
  }

  @Post("updates/apply-status/clear")
  @ApiOperation({ summary: "清除已结束或异常的一键更新状态" })
  clearApplyStatus() {
    return this.runtime.clearApplyStatus();
  }

  @Get("diagnostics")
  @ApiOperation({ summary: "检测本机数据库与更新状态" })
  diagnostics() {
    return this.runtime.getDatabaseDiagnostics();
  }

  @Post("diagnostics/repair")
  @ApiOperation({ summary: "执行当前版本允许的数据库安全补丁" })
  repairDiagnostics() {
    return this.runtime.repairDatabaseDiagnostics();
  }

  @Post("miniapp/latest")
  @ApiOperation({ summary: "获取最新小程序包" })
  latestMiniapp(@Req() req: Request) {
    return this.runtime.getLatestMiniProgramPackage(this.getRequestMeta(req));
  }

  @Post("miniapp/download")
  @ApiOperation({ summary: "下载并校验小程序包" })
  downloadMiniapp(@Body() body: { update?: Record<string, unknown> }) {
    return this.runtime.downloadMiniProgramPackage(body?.update);
  }

  @Get("miniapp/file")
  @ApiOperation({ summary: "下载已校验的小程序包文件" })
  async miniappFile(@Query("token") token: string | undefined, @Res() response: Response) {
    const file = await this.runtime.getMiniProgramDownloadFile(token);
    return response.download(file.filePath, file.fileName);
  }

  @Post("updates/report")
  @ApiOperation({ summary: "回传更新结果" })
  reportUpdate(@Body() body: { result: "SUCCESS" | "FAILED" | "ROLLBACK"; message?: string; releaseId?: string; targetVersion?: string }) {
    return this.runtime.reportUpdate(body);
  }

  private getRequestIp(req: Request) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim();
    return req.ip || req.socket.remoteAddress || "";
  }

  private getHeaderValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value || "";
  }

  private getRequestMeta(req: Request) {
    return {
      requestIp: this.getRequestIp(req),
      origin: this.getHeaderValue(req.headers.origin),
      host: this.getHeaderValue(req.headers.host),
    };
  }
}
