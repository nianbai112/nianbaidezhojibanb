import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../common/services/prisma.service';

type AuthenticatedRequest = Request & {
  user?: unknown;
};

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('未提供认证令牌');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get('JWT_SECRET'),
      });
      request['user'] = payload;

      // AUD-P1-179: 普通用户 JWT（非 admin token）必须校验 User.status。
      // 封禁/禁用/已删除用户即使有未过期 token 也不能访问受保护接口。
      if (!payload.isAdmin && payload.sub) {
        await this.assertUserActive(payload.sub, request);
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('令牌无效或已过期');
    }

    return true;
  }

  /**
   * AUD-P1-179: 校验普通用户状态为 ACTIVE。
   * 少数只读端点（如查询封禁状态）需要豁免此检查，否则用户无法知道自己被封禁。
   */
  private async assertUserActive(userId: string, request: Request): Promise<void> {
    // 豁免端点：查询封禁状态、自助解封配置
    if (this.isActiveCheckExempted(request)) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, status: true },
      });
      // 即使豁免，已删除用户仍然拒绝（不存在的用户）
      if (!user || user.status === 'DELETED') {
        throw new UnauthorizedException('账号不存在或已注销');
      }
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });

    if (!user || user.status === 'DELETED') {
      throw new UnauthorizedException('账号不存在或已注销');
    }
    if (user.status === 'BANNED') {
      throw new UnauthorizedException('账号已被封禁，暂无法操作');
    }
    if (user.status === 'INACTIVE') {
      throw new UnauthorizedException('账号已被禁用，暂无法操作');
    }
  }

  /**
   * 少数接口在用户被封禁/禁用时仍需可访问（如查询自身封禁状态），此处豁免。
   */
  private isActiveCheckExempted(request: Request): boolean {
    const method = request.method?.toUpperCase() || '';
    const path = String(request.path || request.url || '').split('?')[0]
      .replace(/\/+/g, '/')
      .replace(/\/$/, '');

    // GET 查询自身封禁状态 - 用户需要知道自己被封禁
    if (method === 'GET' && path.includes('/auth/user/current-ban-status')) {
      return true;
    }
    // GET 自身 profile（基础信息）
    if (method === 'GET' && path.includes('/auth/me')) {
      return true;
    }
    // AUD-P1-180: GET 查询自助解封配置 - 封禁用户需要看到解封费用
    if (method === 'GET' && path.includes('/auth/user/self-unban-config')) {
      return true;
    }
    // AUD-P1-181: POST 注销账号 - 封禁/禁用用户也可以注销
    if (method === 'POST' && path.includes('/auth/user/cancel-account')) {
      return true;
    }
    return false;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) return undefined;

    if (authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    if (authHeader.length > 20 && !authHeader.includes(' ')) {
      return authHeader;
    }

    return undefined;
  }

}
