import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

export type AdminScopeContext = {
  accountId?: string;
  isSuperAdmin: boolean;
  roleIds: string[];
  roleCodes: string[];
  regionIds: string[];
};

@Injectable()
export class AdminDataScopeService {
  constructor(private readonly prisma: PrismaService) {}

  private isSuperRole(role: any) {
    const code = String(role?.code || "").toLowerCase();
    const name = String(role?.name || "");
    return code === "super_admin" || code === "administrator" || name.includes("超级管理员");
  }

  private extractRegionIds(config: any): string[] {
    if (!config) return [];
    if (Array.isArray(config)) return config.map((id) => String(id)).filter(Boolean);
    if (typeof config === "string") return config.split(/[,\n]/).map((id) => id.trim()).filter(Boolean);

    const keys = ["regionIds", "regions", "allowedRegionIds", "ids"];
    for (const key of keys) {
      const value = config[key];
      if (Array.isArray(value)) return value.map((id) => String(id)).filter(Boolean);
      if (typeof value === "string") return value.split(/[,\n]/).map((id) => id.trim()).filter(Boolean);
    }
    return [];
  }

  async getAdminContext(accountId?: string): Promise<AdminScopeContext> {
    if (!accountId) {
      return { accountId, isSuperAdmin: true, roleIds: [], roleCodes: [], regionIds: [] };
    }

    const account = await this.prisma.adminAccount.findUnique({
      where: { id: accountId },
      include: {
        roles: {
          include: {
            role: { select: { id: true, code: true, name: true } },
          },
        },
        managedRegions: { select: { id: true } },
      },
    });

    if (!account) {
      throw new ForbiddenException("管理员账号不存在");
    }

    const roleIds = account.roles.map((item) => item.roleId).filter(Boolean);
    const roleCodes = account.roles.map((item) => item.role?.code).filter(Boolean);
    if (account.roles.some((item) => this.isSuperRole(item.role))) {
      return { accountId, isSuperAdmin: true, roleIds, roleCodes, regionIds: [] };
    }

    const explicitRegionIds = account.roles
      .map((item) => item.regionId)
      .filter((id): id is string => !!id);
    const managedRegionIds = account.managedRegions.map((region) => region.id).filter(Boolean);

    const scopes = roleIds.length
      ? await this.prisma.dataScopeRole.findMany({
          where: { roleId: { in: roleIds } },
          include: { scope: true },
        })
      : [];

    if (scopes.some((item) => item.scope?.type === "all")) {
      return { accountId, isSuperAdmin: true, roleIds, roleCodes, regionIds: [] };
    }

    const scopedRegionIds = scopes.flatMap((item) => {
      const type = String(item.scope?.type || "");
      if (type !== "region" && type !== "custom") return [];
      return this.extractRegionIds(item.scope?.config);
    });

    const regionIds = Array.from(new Set([...explicitRegionIds, ...managedRegionIds, ...scopedRegionIds]));
    return { accountId, isSuperAdmin: false, roleIds, roleCodes, regionIds };
  }

  async canAccessAllRegions(accountId?: string) {
    const ctx = await this.getAdminContext(accountId);
    return ctx.isSuperAdmin;
  }

  async assertRegionAccess(accountId: string | undefined, regionId?: string | null, message = "无权访问该区域数据") {
    if (!regionId) return;
    const ctx = await this.getAdminContext(accountId);
    if (ctx.isSuperAdmin) return;
    if (!ctx.regionIds.includes(regionId)) {
      throw new ForbiddenException(message);
    }
  }

  async resolveRegionId(accountId: string | undefined, requestedRegionId?: string | null) {
    const regionId = requestedRegionId ? String(requestedRegionId) : "";
    const ctx = await this.getAdminContext(accountId);
    if (ctx.isSuperAdmin) return regionId || undefined;
    if (regionId) {
      if (!ctx.regionIds.includes(regionId)) throw new ForbiddenException("无权访问该区域数据");
      return regionId;
    }
    if (ctx.regionIds.length === 1) return ctx.regionIds[0];
    if (ctx.regionIds.length > 1) return undefined;
    throw new ForbiddenException("当前管理员未绑定区域数据范围");
  }

  async regionModelWhere(accountId?: string, requestedRegionId?: string | null) {
    const regionId = requestedRegionId ? String(requestedRegionId) : "";
    const ctx = await this.getAdminContext(accountId);
    if (ctx.isSuperAdmin) return regionId ? { id: regionId } : {};
    if (regionId) {
      if (!ctx.regionIds.includes(regionId)) throw new ForbiddenException("无权访问该区域数据");
      return { id: regionId };
    }
    if (!ctx.regionIds.length) return { id: { in: [] } };
    return { id: { in: ctx.regionIds } };
  }

  async regionFieldWhere(field: string, accountId?: string, requestedRegionId?: string | null) {
    const regionId = requestedRegionId ? String(requestedRegionId) : "";
    const ctx = await this.getAdminContext(accountId);
    if (ctx.isSuperAdmin) return regionId ? { [field]: regionId } : {};
    if (regionId) {
      if (!ctx.regionIds.includes(regionId)) throw new ForbiddenException("无权访问该区域数据");
      return { [field]: regionId };
    }
    if (!ctx.regionIds.length) return { [field]: { in: [] } };
    return { [field]: { in: ctx.regionIds } };
  }
}
