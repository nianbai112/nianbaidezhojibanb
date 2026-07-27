import { CanActivate, ExecutionContext, ForbiddenException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { Request } from "express";
import { resolveLicenseModuleFromPath } from "./license-runtime.modules";
import { LicenseRuntimeService } from "./license-runtime.service";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

@Injectable()
export class LicenseRuntimeGuard implements CanActivate {
  constructor(private readonly runtime: LicenseRuntimeService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (this.isAllowedSystemPath(request)) return true;

    const path = (request.path || request.url || "").split("?")[0];
    const moduleKey = resolveLicenseModuleFromPath(path);
    const isWrite = WRITE_METHODS.has(request.method.toUpperCase());
    if (!moduleKey && !isWrite) return true;

    const status = await this.runtime.getRuntimeStatus();
    if (moduleKey && !this.runtime.isModuleAllowed(moduleKey, status)) {
      throw new ForbiddenException({
        code: "LICENSE_MODULE_BLOCKED",
        message: "当前授权未开通该功能模块，请联系服务商处理",
        module: moduleKey,
        licenseStatus: status.code,
      });
    }

    if (!isWrite || status.writable) return true;

    throw new ServiceUnavailableException({
      code: "LICENSE_BLOCKED",
      message: status.message || "授权不可用，已限制新增和修改操作",
      licenseStatus: status.code,
    });
  }

  private isAllowedSystemPath(request: Request) {
    const path = this.normalizePath((request.path || request.url || "").split("?")[0]);
    if (!path) return true;

    const allowedPrefixes = [
      "/auth",
      "/admin/login",
      "/admin/license-runtime",
      "/setup",
      "/healthz",
      "/uploads",
      "/wechat",
      "/wx-auth",
      "/api/admin/license-runtime",
      "/api/setup",
      "/api/healthz",
    ];

    if (allowedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
      return true;
    }

    return false;
  }

  private normalizePath(path: string) {
    return String(path || "")
      .replace(/\/+/g, "/")
      .replace(/^\/api\/v\d+(?=\/|$)/, "")
      .replace(/\/$/, "") || "/";
  }
}
