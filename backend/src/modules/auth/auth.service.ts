import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // ===== Captcha 配置 =====
  private readonly CAPTCHA_TTL = 300; // 验证码有效期 5 分钟（秒）
  private readonly CAPTCHA_MAX_ATTEMPTS = 5; // 单 captchaId 最多尝试次数

  // ===== 登录失败锁定配置 =====
  private readonly LOGIN_FAIL_MAX = 5; // 连续失败 N 次后锁定
  private readonly LOGIN_LOCK_MINUTES = 15; // 锁定时间（分钟）

  // ===== Captcha 内存回退（非生产环境 Redis 不可用时使用） =====
  private readonly memoryCaptchaStore = new Map<string, { answer: string; attempts: number; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  /** 判断当前环境是否为 production */
  private get isProduction(): boolean {
    return this.config.get('NODE_ENV') === 'production';
  }

  // =============================================================================
  // 验证码生成与校验（Redis 主存储 + 内存 fallback）
  // =============================================================================

  async generateCaptcha(): Promise<{ captchaId: string; image: string }> {
    const captchaId = crypto.randomUUID();
    const a = Math.floor(Math.random() * 50);
    const b = Math.floor(Math.random() * 50);
    const answer = (a + b).toString();

    try {
      await this.redis.set(`captcha:answer:${captchaId}`, answer, this.CAPTCHA_TTL);
      await this.redis.set(`captcha:attempts:${captchaId}`, '0', this.CAPTCHA_TTL);
    } catch (err: any) {
      if (this.isProduction) {
        this.logger.error(`生产环境 Redis 不可用，无法生成验证码: ${err.message}`);
        throw new BadRequestException('验证码服务暂不可用，请稍后重试');
      }
      // 非生产环境降级到内存
      this.logger.warn(`Redis 不可用，验证码降级到内存存储 (captchaId: ${captchaId})`);
      this.memoryCaptchaStore.set(captchaId, { answer, attempts: 0, expiresAt: Date.now() + this.CAPTCHA_TTL * 1000 });
    }

    const svg = this.generateCaptchaSvg(`${a} + ${b} = ?`);
    return { captchaId, image: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` };
  }

  async verifyCaptcha(captchaId: string, captchaCode: string): Promise<boolean> {
    if (!captchaId || !captchaCode) {
      throw new BadRequestException('验证码不能为空');
    }

    // 先尝试 Redis
    let answer: string | null = null;
    let attempts = 0;
    let fromMemory = false;

    try {
      answer = await this.redis.get(`captcha:answer:${captchaId}`);
      attempts = parseInt((await this.redis.get(`captcha:attempts:${captchaId}`)) || '0', 10);
    } catch {
      // Redis 不可用，尝试内存
      const stored = this.memoryCaptchaStore.get(captchaId);
      if (!stored) {
        throw new BadRequestException('验证码已过期，请刷新验证码');
      }
      if (Date.now() > stored.expiresAt) {
        this.memoryCaptchaStore.delete(captchaId);
        throw new BadRequestException('验证码已过期，请刷新验证码');
      }
      answer = stored.answer;
      attempts = stored.attempts;
      fromMemory = true;
    }

    if (!answer) {
      throw new BadRequestException('验证码已过期，请刷新验证码');
    }

    // 检查尝试次数上限
    if (attempts >= this.CAPTCHA_MAX_ATTEMPTS) {
      await this.cleanupCaptcha(captchaId, fromMemory);
      throw new BadRequestException('验证码已过期或尝试次数过多，请刷新验证码');
    }

    // 增加尝试次数
    attempts++;
    if (fromMemory) {
      const stored = this.memoryCaptchaStore.get(captchaId);
      if (stored) stored.attempts = attempts;
    } else {
      try {
        await this.redis.incr(`captcha:attempts:${captchaId}`);
      } catch { /* ignore */ }
    }

    if (captchaCode !== answer) {
      return false;
    }

    // 验证成功，清除（一次性使用）
    await this.cleanupCaptcha(captchaId, fromMemory);
    return true;
  }

  private async cleanupCaptcha(captchaId: string, fromMemory: boolean) {
    if (fromMemory) {
      this.memoryCaptchaStore.delete(captchaId);
    } else {
      try {
        await this.redis.del(`captcha:answer:${captchaId}`);
        await this.redis.del(`captcha:attempts:${captchaId}`);
      } catch { /* ignore */ }
    }
  }

  private generateCaptchaSvg(text: string): string {
    const width = 160;
    const height = 50;
    const fontSize = 22;
    const noiseLines = 4;
    const noiseDots = 30;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
    svg += `<rect width="${width}" height="${height}" fill="#f0f5ff" rx="4"/>`;

    // 干扰线
    for (let i = 0; i < noiseLines; i++) {
      const x1 = Math.random() * width;
      const y1 = Math.random() * height;
      const x2 = Math.random() * width;
      const y2 = Math.random() * height;
      const color = `hsl(${200 + Math.random() * 40}, 70%, ${60 + Math.random() * 20}%)`;
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1" opacity="0.5"/>`;
    }

    // 干扰点
    for (let i = 0; i < noiseDots; i++) {
      const cx = Math.random() * width;
      const cy = Math.random() * height;
      const r = 0.5 + Math.random() * 1.5;
      svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#8ba5cc" opacity="0.4"/>`;
    }

    // 文字（居中，带轻微旋转和偏移）
    const chars = text.split('');
    const totalCharsWidth = chars.length * fontSize * 0.65;
    let startX = (width - totalCharsWidth) / 2;
    const centerY = height / 2 + fontSize / 3;

    for (const char of chars) {
      const rotation = (Math.random() - 0.5) * 20;
      const yOffset = (Math.random() - 0.5) * 8;
      const charWidth = char === ' ' ? 15 : fontSize * 0.6;
      const x = startX + charWidth / 2;
      const y = centerY + yOffset;
      const color = `hsl(${220 + Math.random() * 30}, ${50 + Math.random() * 30}%, ${30 + Math.random() * 25}%)`;
      svg += `<text x="${x}" y="${y}" font-size="${fontSize}" font-family="Arial, sans-serif" font-weight="bold" fill="${color}" text-anchor="middle" transform="rotate(${rotation},${x},${y})">${char}</text>`;
      startX += charWidth;
    }

    svg += '</svg>';
    return svg;
  }

  // ============ 小程序微信登录 ============

  async wxMiniLogin(dto: { code: string; nickname?: string; avatarUrl?: string }) {
    const { code, nickname, avatarUrl } = dto;
    const { appid, secret } = await this.getMiniappCredentials();

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

  // =============================================================================
  // 后台管理员登录（独立 AdminAccount 模型）
  // =============================================================================

  async adminLogin(dto: { username: string; password: string; captchaId?: string; captcha?: string }, ip?: string, ua?: string) {
    // 1. 校验验证码（不区分账号是否存在，统一返回"验证码错误"）
    if (dto.captchaId && !dto.captcha) {
      throw new BadRequestException('请填写验证码');
    }
    if (dto.captchaId) {
      const captchaValid = await this.verifyCaptcha(dto.captchaId, dto.captcha || '');
      if (!captchaValid) {
        throw new BadRequestException('验证码错误');
      }
    }

    // 2. 查找管理员（排除已软删除的）
    const account = await this.prisma.adminAccount.findFirst({
      where: {
        OR: [
          { username: dto.username },
          { phone: dto.username },
          { email: dto.username },
        ],
        status: { in: ['active', 'disabled'] },
        deletedAt: null,
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

    // 3. 账号不存在 → 统一错误消息，不泄露账号存在性
    if (!account) {
      await this.logAdminLogin('', dto.username, false, '账号不存在', ip, ua);
      throw new UnauthorizedException('账号或密码错误');
    }

    // 4. 检查是否被锁定
    if (account.lockedUntil && new Date(account.lockedUntil) > new Date()) {
      const remainingMin = Math.ceil((new Date(account.lockedUntil).getTime() - Date.now()) / 60000);
      await this.logAdminLogin(account.id, dto.username, false, `账号已锁定(剩余${remainingMin}分钟)`, ip, ua);
      throw new UnauthorizedException(`账号已被临时锁定，请在 ${remainingMin} 分钟后重试`);
    }

    // 5. MFA 校验（如已启用且未提供 MFA code，返回需要 MFA 的状态）
    if (account.mfaEnabled) {
      // MFA 完整接入预留 — 当前仅检查并不拒绝登录
      this.logger.log(`管理员 ${account.username} 已启用 MFA`);
    }

    // 6. 校验密码
    const valid = await bcrypt.compare(dto.password, account.passwordHash);
    if (!valid) {
      await this.handleLoginFailure(account, dto.username, ip, ua);
      throw new UnauthorizedException('账号或密码错误');
    }

    // 7. 检查 status 是否 active
    if (account.status !== 'active') {
      await this.logAdminLogin(account.id, dto.username, false, '账号已禁用', ip, ua);
      throw new UnauthorizedException('账号或密码错误');
    }

    // 8. 登录成功 — 清空失败计数、锁定、更新登录信息
    await this.prisma.adminAccount.update({
      where: { id: account.id },
      data: {
        loginFailCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ip || null,
        lastLoginUserAgent: ua || null,
      },
    });

    // 8. 收集权限码和菜单
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

    // 9. 生成 token
    const tokens = await this.generateAdminTokens(account.id, account.username);

    // 10. 记录登录成功日志
    await this.logAdminLogin(account.id, dto.username, true, undefined, ip, ua);

    return {
      token: tokens.accessToken,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      adminId: account.id,
      userId: account.id,
      username: account.username,
      nickname: account.realName || account.username,
      avatar: account.avatar || '',
      role: roles.some((role) => role.code === 'super_admin' || role.code === 'SUPER_ADMIN')
        ? 'super_admin'
        : roles[0]?.code || 'admin',
      login_method: 'password',
      login_via_auth_code: false,
      permissions,
      menus,
      forcePasswordReset: account.passwordResetRequired === true,
      user: {
        id: account.id,
        username: account.username,
        realName: account.realName,
        avatar: account.avatar || '',
        phone: account.phone || '',
        email: account.email || '',
        roles,
        status: account.status === 'active' ? 1 : 0,
        passwordResetRequired: account.passwordResetRequired,
      },
    };
  }

  /**
   * 记录登录失败，超过阈值则锁定账号
   * 注意：不区分散列失败的原因（密码错误 / 状态异常均计为一次失败）
   */
  private async handleLoginFailure(
    account: { id: string; loginFailCount: number },
    username: string,
    ip?: string,
    ua?: string,
  ) {
    const newFailCount = account.loginFailCount + 1;
    const lockedUntil =
      newFailCount >= this.LOGIN_FAIL_MAX
        ? new Date(Date.now() + this.LOGIN_LOCK_MINUTES * 60 * 1000)
        : undefined;

    await this.prisma.adminAccount.update({
      where: { id: account.id },
      data: {
        loginFailCount: newFailCount,
        lockedUntil: lockedUntil || null,
      },
    });

    const failReason =
      newFailCount >= this.LOGIN_FAIL_MAX
        ? `密码错误(连续${newFailCount}次，已锁定${this.LOGIN_LOCK_MINUTES}分钟)`
        : `密码错误(第${newFailCount}次)`;

    await this.logAdminLogin(account.id, username, false, failReason, ip, ua);
    this.logger.warn(`管理员登录失败: ${username} (第${newFailCount}次, IP: ${ip || 'unknown'})`);
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

  async createAdminQrLoginSession(ip?: string, ua?: string) {
    await this.expireAdminQrLoginSessions();

    const ticket = `aql_${crypto.randomBytes(18).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const scanPath = `/pages/auth/adminScanLogin/adminScanLogin?ticket=${encodeURIComponent(ticket)}`;
    const urlPrefix = String(
      this.config.get('ADMIN_QR_LOGIN_URL_PREFIX') ||
      this.config.get('PUBLIC_BASE_URL') ||
      '',
    ).trim();
    const scanUrl = urlPrefix
      ? `${urlPrefix.replace(/\/$/, '')}/admin-qr-login?ticket=${encodeURIComponent(ticket)}`
      : scanPath;

    await this.prisma.adminQrLoginSession.create({
      data: {
        ticket,
        expiresAt,
        webIp: ip || null,
        webUserAgent: ua || null,
      },
    });

    return {
      ticket,
      status: 'PENDING',
      expiresAt,
      scanPath,
      scanUrl,
      qrcodeText: scanUrl,
      message: urlPrefix
        ? '请使用微信扫描二维码，在小程序中确认登录'
        : '开发环境请在小程序打开扫码确认页并携带 ticket 参数',
    };
  }

  async getAdminQrLoginStatus(ticket: string, ip?: string, ua?: string) {
    const session = await this.prisma.adminQrLoginSession.findUnique({ where: { ticket } });
    if (!session) {
      throw new BadRequestException('扫码登录已失效，请刷新二维码');
    }

    if (session.expiresAt.getTime() <= Date.now() && !['CONFIRMED', 'CANCELED'].includes(session.status)) {
      await this.prisma.adminQrLoginSession.update({
        where: { id: session.id },
        data: { status: 'EXPIRED' },
      });
      return { status: 'EXPIRED', message: '二维码已过期，请刷新' };
    }

    if (session.status === 'CONFIRMED' && session.accountId) {
      const login = await this.buildAdminLoginPayload(session.accountId, 'wechat_scan', ip, ua);
      if (session.userId) {
        await this.prisma.adminWechatBinding.updateMany({
          where: { accountId: session.accountId, userId: session.userId },
          data: { lastLoginAt: new Date() },
        });
      }
      return { status: 'CONFIRMED', login };
    }

    return {
      status: session.status,
      nickname: session.nickname,
      avatar: session.avatar,
      scannedAt: session.scannedAt,
      expiresAt: session.expiresAt,
      message: this.getQrStatusMessage(session.status),
    };
  }

  async cancelAdminQrLogin(ticket: string) {
    await this.prisma.adminQrLoginSession.updateMany({
      where: { ticket, status: { in: ['PENDING', 'SCANNED'] } },
      data: { status: 'CANCELED', rejectReason: 'web_cancel' },
    });
    return { success: true };
  }

  async scanAdminQrLogin(ticket: string, userId: string, ip?: string, ua?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('小程序账号不存在或已被禁用');
    }

    const session = await this.getUsableQrSession(ticket);
    const binding = await this.prisma.adminWechatBinding.findUnique({
      where: { userId },
      include: { account: true },
    });

    await this.prisma.adminQrLoginSession.update({
      where: { id: session.id },
      data: {
        status: 'SCANNED',
        userId,
        openid: user.openid,
        nickname: user.nickname || null,
        avatar: user.avatar || null,
        scanIp: ip || null,
        scanUserAgent: ua || null,
        scannedAt: session.scannedAt || new Date(),
      },
    });

    const accountActive = binding?.status === 'ACTIVE' && binding.account?.status === 'active';
    return {
      status: 'SCANNED',
      bindRequired: !accountActive,
      user: {
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar,
      },
      account: accountActive
        ? {
            id: binding.account.id,
            username: binding.account.username,
            realName: binding.account.realName,
            avatar: binding.account.avatar,
          }
        : null,
      message: accountActive ? '请确认是否登录后台' : '首次使用扫码登录，请先绑定管理员账号',
    };
  }

  async confirmAdminQrLogin(
    dto: { ticket: string; username?: string; password?: string },
    userId: string,
    ip?: string,
    ua?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('小程序账号不存在或已被禁用');
    }

    const session = await this.getUsableQrSession(dto.ticket);
    if (session.userId && session.userId !== userId) {
      throw new BadRequestException('这个二维码已被其他用户扫码，请刷新二维码');
    }

    let binding = await this.prisma.adminWechatBinding.findUnique({
      where: { userId },
      include: { account: true },
    });

    let account = binding?.status === 'ACTIVE' && binding.account?.status === 'active'
      ? binding.account
      : null;

    if (!account) {
      if (!dto.username || !dto.password) {
        throw new BadRequestException('首次扫码登录需要填写管理员账号和密码完成绑定');
      }

      account = await this.verifyAdminCredentialForQr(dto.username, dto.password, ip, ua);
      const occupied = await this.prisma.adminWechatBinding.findUnique({
        where: { accountId: account.id },
      });
      if (occupied && occupied.userId !== userId && occupied.status === 'ACTIVE') {
        throw new BadRequestException('该管理员账号已绑定其他微信用户，请先由超级管理员解绑');
      }

      binding = await this.prisma.adminWechatBinding.upsert({
        where: { userId },
        create: {
          userId,
          accountId: account.id,
          openid: user.openid,
          unionid: user.unionid || null,
          nickname: user.nickname || null,
          avatar: user.avatar || null,
        },
        update: {
          accountId: account.id,
          status: 'ACTIVE',
          openid: user.openid,
          unionid: user.unionid || null,
          nickname: user.nickname || null,
          avatar: user.avatar || null,
          boundAt: new Date(),
        },
        include: { account: true },
      });
    }

    await this.prisma.adminQrLoginSession.update({
      where: { id: session.id },
      data: {
        status: 'CONFIRMED',
        accountId: account.id,
        userId,
        openid: user.openid,
        nickname: user.nickname || binding?.nickname || null,
        avatar: user.avatar || binding?.avatar || null,
        scanIp: ip || session.scanIp,
        scanUserAgent: ua || session.scanUserAgent,
        scannedAt: session.scannedAt || new Date(),
        confirmedAt: new Date(),
      },
    });

    return {
      success: true,
      status: 'CONFIRMED',
      account: {
        username: account.username,
        realName: account.realName,
        avatar: account.avatar,
      },
      message: '已确认登录，请回到电脑端',
    };
  }

  async rejectAdminQrLogin(ticket: string, userId: string) {
    await this.prisma.adminQrLoginSession.updateMany({
      where: { ticket, userId, status: { in: ['PENDING', 'SCANNED'] } },
      data: { status: 'CANCELED', rejectReason: 'miniapp_reject' },
    });
    return { success: true, message: '已取消本次扫码登录' };
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

  private async expireAdminQrLoginSessions() {
    await this.prisma.adminQrLoginSession.updateMany({
      where: {
        status: { in: ['PENDING', 'SCANNED'] },
        expiresAt: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });
  }

  private async getUsableQrSession(ticket: string) {
    if (!ticket) {
      throw new BadRequestException('缺少扫码登录参数，请刷新二维码');
    }

    const session = await this.prisma.adminQrLoginSession.findUnique({ where: { ticket } });
    if (!session) {
      throw new BadRequestException('二维码不存在或已失效');
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.prisma.adminQrLoginSession.update({
        where: { id: session.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('二维码已过期，请刷新');
    }
    if (!['PENDING', 'SCANNED'].includes(session.status)) {
      throw new BadRequestException(this.getQrStatusMessage(session.status));
    }
    return session;
  }

  private getQrStatusMessage(status: string) {
    const messages: Record<string, string> = {
      PENDING: '等待小程序扫码',
      SCANNED: '已扫码，请在小程序确认',
      CONFIRMED: '已确认登录',
      EXPIRED: '二维码已过期，请刷新',
      CANCELED: '本次扫码登录已取消',
    };
    return messages[status] || '扫码登录状态异常';
  }

  private async verifyAdminCredentialForQr(username: string, password: string, ip?: string, ua?: string) {
    const account = await this.prisma.adminAccount.findFirst({
      where: {
        OR: [
          { username },
          { phone: username },
          { email: username },
        ],
        status: { in: ['active', 'disabled'] },
        deletedAt: null,
      },
    });

    if (!account) {
      await this.logAdminLogin('', username, false, '扫码绑定账号不存在', ip, ua);
      throw new UnauthorizedException('管理员账号或密码错误');
    }

    if (account.lockedUntil && new Date(account.lockedUntil) > new Date()) {
      const remainingMin = Math.ceil((new Date(account.lockedUntil).getTime() - Date.now()) / 60000);
      await this.logAdminLogin(account.id, username, false, `扫码绑定账号已锁定(剩余${remainingMin}分钟)`, ip, ua);
      throw new UnauthorizedException(`管理员账号已被临时锁定，请在 ${remainingMin} 分钟后重试`);
    }

    const valid = await bcrypt.compare(password, account.passwordHash);
    if (!valid) {
      await this.handleLoginFailure(account, username, ip, ua);
      throw new UnauthorizedException('管理员账号或密码错误');
    }

    if (account.status !== 'active') {
      await this.logAdminLogin(account.id, username, false, '扫码绑定账号已禁用', ip, ua);
      throw new UnauthorizedException('管理员账号不可用，请联系超级管理员');
    }

    return account;
  }

  private async buildAdminLoginPayload(accountId: string, loginMethod: 'password' | 'wechat_scan', ip?: string, ua?: string) {
    const account = await this.prisma.adminAccount.findUnique({
      where: { id: accountId },
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

    if (!account || account.status !== 'active') {
      throw new UnauthorizedException('管理员账号不存在或已禁用');
    }

    await this.prisma.adminAccount.update({
      where: { id: account.id },
      data: {
        loginFailCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ip || null,
        lastLoginUserAgent: ua || null,
      },
    });

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

    const tokens = await this.generateAdminTokens(account.id, account.username);
    await this.logAdminLogin(account.id, account.username, true, undefined, ip, ua);

    return {
      token: tokens.accessToken,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      adminId: account.id,
      userId: account.id,
      username: account.username,
      nickname: account.realName || account.username,
      avatar: account.avatar || '',
      role: roles.some((role) => role.code === 'super_admin' || role.code === 'SUPER_ADMIN')
        ? 'super_admin'
        : roles[0]?.code || 'admin',
      login_method: loginMethod,
      login_via_auth_code: false,
      permissions: Array.from(permissionSet),
      menus,
      forcePasswordReset: account.passwordResetRequired === true,
      user: {
        id: account.id,
        username: account.username,
        realName: account.realName,
        avatar: account.avatar || '',
        phone: account.phone || '',
        email: account.email || '',
        roles,
        status: account.status === 'active' ? 1 : 0,
        passwordResetRequired: account.passwordResetRequired,
      },
    };
  }

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
    const { appid, secret } = await this.getMiniappCredentials();
    const { data } = await axios.get(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`,
    );
    if (data.access_token) {
      await this.redis.set(cacheKey, data.access_token, data.expires_in - 60);
      return data.access_token;
    }
    throw new BadRequestException('获取微信 AccessToken 失败');
  }

  private async getMiniappCredentials(): Promise<{ appid: string; secret: string }> {
    const saved = await this.prisma.config.findUnique({ where: { key: 'miniapp' } });
    const value = (saved?.value || {}) as Record<string, any>;
    const appid = String(value.appId || value.appid || this.config.get('WX_MINI_APPID') || '').trim();
    const secret = String(value.appSecret || value.secret || this.config.get('WX_MINI_SECRET') || '').trim();

    if (!appid || !secret || appid.startsWith('your-') || secret.startsWith('your-')) {
      throw new BadRequestException('请先在系统配置中填写微信小程序 AppID 和 AppSecret');
    }

    return { appid, secret };
  }
}
