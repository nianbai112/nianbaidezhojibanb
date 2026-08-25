import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../common/services/prisma.service';
import { AdminDataScopeService } from '../common/services/admin-data-scope.service';

/**
 * AdminGuard - 验证当前请求来自管理员
 * 要求 JWT payload.isAdmin === true，并且 AdminAccount 状态为 active
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { user } = request;

    if (!user?.sub || !user?.isAdmin) {
      throw new UnauthorizedException('需要管理员权限');
    }

    // 验证管理员账号是否仍为 active
    const account = await this.prisma.adminAccount.findUnique({
      where: { id: user.sub },
      select: { status: true, passwordResetRequired: true, passwordChangedAt: true },
    });

    if (!account || account.status !== 'active') {
      throw new UnauthorizedException('管理员账号已被禁用');
    }

    if (account.passwordChangedAt && Number(user.iat || 0) * 1000 < account.passwordChangedAt.getTime()) {
      throw new UnauthorizedException('管理员登录状态已失效，请重新登录');
    }

    // AUD-P1-161: 强制改密 - 要求改密的管理员只能访问改密接口
    if (account.passwordResetRequired && !this.isPasswordResetEndpoint(request)) {
      throw new UnauthorizedException('请先修改初始密码后再访问后台功能');
    }

    return true;
  }

  /**
   * AUD-P1-161: 判断是否为密码重置相关端点
   * 要求改密的管理员只能访问这些端点
   */
  private isPasswordResetEndpoint(request: { method?: string; path?: string; url?: string }): boolean {
    const method = request.method?.toUpperCase() || '';
    const path = String(request.path || request.url || '').split('?')[0]
      .replace(/\/+/g, '/')
      .replace(/\/$/, '');

    // 允许：POST 密码重置、GET profile（获取当前用户信息）、POST 登出
    if (method === 'POST' && path.includes('/auth/admin/reset-password')) return true;
    if (method === 'GET' && path.includes('/auth/admin/profile')) return true;
    if (method === 'POST' && path.includes('/auth/admin/logout')) return true;
    return false;
  }
}

/**
 * AdminPermissionGuard - 验证管理员是否有指定权限
 * 配合 @RequirePermission('user:delete') 装饰器使用
 * 
 * 规则：
 * 1. 无 @RequirePermission 装饰器时直接放行
 * 2. 角色 code === 'super_admin' 或 'SUPER_ADMIN' 直接放行（拥有所有权限）
 * 3. 否则检查该管理员账号是否拥有所有要求的权限码
 */
@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      'admin_permissions',
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true; // 无权限要求时放行
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user?.sub || !user?.isAdmin) {
      throw new UnauthorizedException('需要管理员权限');
    }

    // 第一步：查询账号所属角色 code
    const account = await this.prisma.adminAccount.findUnique({
      where: { id: user.sub },
      include: {
        roles: {
          select: {
            role: {
              select: { code: true },
            },
          },
        },
      },
    });

    if (!account) {
      throw new UnauthorizedException('管理员不存在');
    }

    // 超级管理员：拥有所有权限，无条件放行
    for (const ar of account.roles) {
      if (ar.role.code === 'super_admin' || ar.role.code === 'SUPER_ADMIN') {
        return true;
      }
    }

    // 第二步：非超级管理员，查询具体权限
    const accountWithPerms = await this.prisma.adminAccount.findUnique({
      where: { id: user.sub },
      select: {
        roles: {
          select: {
            role: {
              select: {
                permissions: {
                  select: {
                    permission: {
                      select: { code: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const userPermissions = new Set<string>();
    for (const ar of accountWithPerms?.roles ?? []) {
      for (const rp of ar.role.permissions) {
        userPermissions.add(rp.permission.code);
      }
    }

    const missing = requiredPermissions.filter((p) => !userPermissions.has(p));
    if (missing.length > 0) {
      throw new UnauthorizedException(
        `缺少权限: ${missing.join(', ')}`,
      );
    }

    // AUD-P1-074: 检查 OR 权限（满足任意一个即可）
    const requiredAnyPermissions = this.reflector.getAllAndOverride<string[]>(
      'admin_permissions_any',
      [context.getHandler(), context.getClass()],
    );
    if (requiredAnyPermissions && requiredAnyPermissions.length > 0) {
      const hasAny = requiredAnyPermissions.some((p) => userPermissions.has(p));
      if (!hasAny) {
        throw new UnauthorizedException(
          `缺少权限: ${requiredAnyPermissions.join(' 或 ')}`,
        );
      }
    }

    return true;
  }
}

/** Protect system-wide legacy and runtime operations that are not safe to delegate. */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly adminDataScope: AdminDataScopeService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request?.user;
    if (!user?.sub || !user?.isAdmin) {
      throw new UnauthorizedException('需要管理员权限');
    }

    const scope = await this.adminDataScope.getAdminContext(user.sub);
    if (!scope.isSuperAdmin) {
      throw new ForbiddenException('仅超级管理员可执行此操作');
    }
    return true;
  }

}
