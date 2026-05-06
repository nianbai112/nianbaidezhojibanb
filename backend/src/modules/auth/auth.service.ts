import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import axios from 'axios';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  // ============ 小程序微信登录 ============

  async wxMiniLogin(dto: { code: string; nickname?: string; avatarUrl?: string }) {
    const { code, nickname, avatarUrl } = dto;
    const appid = this.config.get('WX_MINI_APPID');
    const secret = this.config.get('WX_MINI_SECRET');

    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`;
    const { data } = await axios.get(url);

    if (data.errcode) {
      throw new BadRequestException(`微信登录失败: ${data.errmsg}`);
    }

    const { openid, session_key, unionid } = data;

    let user = await this.prisma.user.findUnique({ where: { openid } });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          openid,
          unionid: unionid || null,
          nickname: nickname || `用户${openid.slice(-6)}`,
          avatar: avatarUrl || null,
          lastLoginAt: new Date(),
        },
      });
      await this.prisma.userProfile.create({ data: { userId: user.id } });
      await this.prisma.userSettings.create({ data: { userId: user.id } });
    } else {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date(),
          ...(nickname && !user.nickname ? { nickname } : {}),
          ...(avatarUrl && !user.avatar ? { avatar: avatarUrl } : {}),
        },
      });
    }

    const tokens = await this.generateTokens(user.id, openid);
    await this.redis.set(`session_key:${user.id}`, session_key, 7200);

    const studentVerify = await this.prisma.studentVerify.findUnique({ where: { userId: user.id } });
    return {
      id: user.id,
      token: tokens.accessToken,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      nickname: user.nickname,
      avatar: user.avatar,
      phone: user.phone,
      student_verified: studentVerify?.status === 'APPROVED',
      student_verification_status: studentVerify?.status?.toLowerCase() || 'none',
      status: user.status,
    };
  }

  async getPhoneNumber(userId: string, dto: { code: string }) {
    const accessToken = await this.getWxAccessToken();
    const url = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`;
    const { data } = await axios.post(url, { code: dto.code });

    if (data.errcode !== 0) {
      throw new BadRequestException(`获取手机号失败: ${data.errmsg}`);
    }

    const phone = data.phone_info.phoneNumber;
    await this.prisma.user.update({ where: { id: userId }, data: { phone } });
    return { phone };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.config.get('JWT_SECRET'),
      });
      const stored = await this.redis.get(`refresh:${payload.sub}`);
      if (stored !== refreshToken) {
        throw new UnauthorizedException('刷新令牌已失效');
      }
      return this.generateTokens(payload.sub, payload.openid);
    } catch {
      throw new UnauthorizedException('刷新令牌无效');
    }
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, settings: true, studentVerify: true, wallet: true },
    });
    if (!user) throw new UnauthorizedException('用户不存在');

    return {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      phone: user.phone,
      status: user.status,
      createdAt: user.createdAt,
      student_verified: user.studentVerify?.status === 'APPROVED',
      student_verification_status: user.studentVerify?.status?.toLowerCase() || 'none',
      gender: user.profile?.gender,
      school: user.profile?.school,
      bio: user.profile?.bio,
      balance: Number(user.wallet?.balance || 0),
    };
  }

  // ============ 后台管理员登录（独立 AdminAccount 模型） ============

  async adminLogin(dto: { username: string; password: string }, ip?: string, ua?: string) {
    // 查找管理员账号
    const account = await this.prisma.adminAccount.findFirst({
      where: {
        OR: [
          { username: dto.username },
          { phone: dto.username },
          { email: dto.username },
        ],
        status: 'active',
      },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
                menus: { include: { menu: true } },
              },
            },
          },
        },
      },
    });

    if (!account) {
      await this.logAdminLogin('', dto.username, false, '账号不存在', ip, ua);
      throw new UnauthorizedException('账号或密码错误');
    }

    const valid = await bcrypt.compare(dto.password, account.passwordHash);
    if (!valid) {
      await this.logAdminLogin(account.id, dto.username, false, '密码错误', ip, ua);
      throw new UnauthorizedException('账号或密码错误');
    }

    // 更新登录信息
    await this.prisma.adminAccount.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date(), lastLoginIp: ip || null },
    });

    // 收集权限码
    const permissionSet = new Set<string>();
    const menus: any[] = [];
    const roles: any[] = [];

    for (const acctRole of account.roles) {
      roles.push({
        id: acctRole.role.id,
        name: acctRole.role.name,
        code: acctRole.role.code,
      });
      for (const rp of acctRole.role.permissions) {
        permissionSet.add(rp.permission.code);
      }
      for (const rm of acctRole.role.menus) {
        menus.push({
          id: rm.menu.id,
          name: rm.menu.name,
          path: rm.menu.path,
          icon: rm.menu.icon,
          parentId: rm.menu.parentId,
          type: rm.menu.type,
          sortOrder: rm.menu.sortOrder,
        });
      }
    }

    const permissions = Array.from(permissionSet);

    // 生成 token（用 admin_ 前缀区分管理员和小程序用户）
    const tokens = await this.generateAdminTokens(account.id, account.username);

    // 记录登录日志
    await this.logAdminLogin(account.id, dto.username, true, undefined, ip, ua);

    return {
      token: tokens.accessToken,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      permissions,
      menus,
      user: {
        id: account.id,
        username: account.username,
        realName: account.realName,
        avatar: account.avatar || '',
        phone: account.phone || '',
        email: account.email || '',
        roles,
        status: account.status === 'active' ? 1 : 0,
      },
    };
  }

  async adminLogout(accountId: string) {
    await this.redis.del(`admin_refresh:${accountId}`);
    return { success: true };
  }

  async adminRefreshToken(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.config.get('JWT_SECRET'),
      });
      if (!payload.isAdmin) {
        throw new UnauthorizedException('非管理员令牌');
      }
      const stored = await this.redis.get(`admin_refresh:${payload.sub}`);
      if (stored !== refreshToken) {
        throw new UnauthorizedException('刷新令牌已失效');
      }
      return this.generateAdminTokens(payload.sub, payload.username);
    } catch {
      throw new UnauthorizedException('刷新令牌无效');
    }
  }

  async getAdminProfile(accountId: string) {
    const account = await this.prisma.adminAccount.findUnique({
      where: { id: accountId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    if (!account || account.status !== 'active') {
      throw new UnauthorizedException('管理员不存在或已禁用');
    }

    const permissionSet = new Set<string>();
    const roles: any[] = [];
    for (const acctRole of account.roles) {
      roles.push({ id: acctRole.role.id, name: acctRole.role.name, code: acctRole.role.code });
      for (const rp of acctRole.role.permissions) {
        permissionSet.add(rp.permission.code);
      }
    }

    return {
      id: account.id,
      username: account.username,
      realName: account.realName,
      avatar: account.avatar,
      phone: account.phone,
      email: account.email,
      roles,
      permissions: Array.from(permissionSet),
      status: account.status,
      lastLoginAt: account.lastLoginAt,
      createdAt: account.createdAt,
    };
  }

  // ============ 内部方法 ============

  private async generateTokens(userId: string, openid: string) {
    const payload = { sub: userId, openid, isAdmin: false };
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN') || '2h',
    });
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN') || '7d',
    });
    await this.redis.set(`refresh:${userId}`, refreshToken, 7 * 24 * 3600);
    return { accessToken, refreshToken, expiresIn: 7200 };
  }

  private async generateAdminTokens(accountId: string, username: string) {
    const payload = { sub: accountId, username, isAdmin: true };
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN') || '2h',
    });
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN') || '7d',
    });
    await this.redis.set(`admin_refresh:${accountId}`, refreshToken, 7 * 24 * 3600);
    return { accessToken, refreshToken, expiresIn: 7200 };
  }

  private async logAdminLogin(
    accountId: string,
    username: string,
    success: boolean,
    failReason?: string,
    ip?: string,
    ua?: string,
  ) {
    try {
      if (accountId) {
        await this.prisma.adminLoginLog.create({
          data: { accountId, ip, ua, success, failReason },
        });
      }
    } catch (e) {
      this.logger.warn(`Failed to log admin login: ${e.message}`);
    }
  }

  private async getWxAccessToken(): Promise<string> {
    const cacheKey = 'wx:access_token';
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;
    const appid = this.config.get('WX_MINI_APPID');
    const secret = this.config.get('WX_MINI_SECRET');
    const { data } = await axios.get(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`,
    );
    if (data.access_token) {
      await this.redis.set(cacheKey, data.access_token, data.expires_in - 60);
      return data.access_token;
    }
    throw new BadRequestException('获取微信 AccessToken 失败');
  }
}
