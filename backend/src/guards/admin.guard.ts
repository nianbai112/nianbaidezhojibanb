import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../common/services/prisma.service';

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
    const { user } = context.switchToHttp().getRequest();

    if (!user?.sub || !user?.isAdmin) {
      throw new UnauthorizedException('需要管理员权限');
    }

    // 验证管理员账号是否仍为 active
    const account = await this.prisma.adminAccount.findUnique({
      where: { id: user.sub },
      select: { status: true },
    });

    if (!account || account.status !== 'active') {
      throw new UnauthorizedException('管理员账号已被禁用');
    }

    return true;
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

    return true;
  }
}
