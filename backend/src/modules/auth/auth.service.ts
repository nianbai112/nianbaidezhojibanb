import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import axios from 'axios';
import * as crypto from 'crypto';
import * as speakeasy from 'speakeasy';
import { IpGeoService } from '../ip-geo/ip-geo.service';
import { checkPasswordStrength } from '../../common/utils/password-policy';

type MiniLoginDeviceInput = {
  brand?: string;
  model?: string;
  system?: string;
  platform?: string;
  version?: string;
  SDKVersion?: string;
  hostName?: string;
};

type LoginMetaInput = {
  ip?: string;
  ua?: string;
  device?: MiniLoginDeviceInput | null;
  method?: string;
};

type SmsProvider = 'aliyun' | 'tencent';

type SmsSendState = {
  attemptedProviders: SmsProvider[];
  lastProvider: SmsProvider;
  deliveryUnknown: boolean;
};

type SmsSendResult = {
  provider: SmsProvider;
  attemptedProviders: SmsProvider[];
  deliveryUnknown: boolean;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // ===== Captcha 配置 =====
  private readonly CAPTCHA_TTL = 300; // 验证码有效期 5 分钟（秒）
  private readonly CAPTCHA_MAX_ATTEMPTS = 5; // 单 captchaId 最多尝试次数

  // ===== 登录失败锁定配置 =====
  private readonly LOGIN_FAIL_MAX = 5; // 连续失败 N 次后锁定
  private readonly LOGIN_LOCK_MINUTES = 15; // 锁定时间（分钟）
  private readonly PHONE_CODE_TTL = 300;
  private readonly PHONE_CODE_MIN_INTERVAL = 60;
  private readonly PHONE_CODE_IP_LIMIT = 10;
  private readonly PHONE_LOGIN_OPENID_PREFIX = 'phone_login_';

  // ===== Captcha 内存回退（非生产环境 Redis 不可用时使用） =====
  private readonly memoryCaptchaStore = new Map<string, { answer: string; attempts: number; expiresAt: number }>();
  private readonly memoryPhoneCodeStore = new Map<string, { code: string; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly ipGeo: IpGeoService,
  ) {}

  private formatPublicUser(user: any) {
    const publicUid = user?.publicUid || user?.public_uid || user?.displayUid || user?.uid || null;
    return {
      ...user,
      uid: publicUid,
      public_uid: publicUid,
      publicUid,
      legacy_uid: user?.uid || null,
      internal_uid: user?.uid || null,
    };
  }

  private compactText(value?: string | null, max = 1000) {
    if (!value) return null;
    const text = String(value).trim();
    return text ? text.slice(0, max) : null;
  }

  private compactIp(value?: string | null) {
    return this.compactText(value, 128);
  }

  private compactUserAgent(value?: string | null) {
    return this.compactText(value, 1000);
  }

  private compactLoginDevice(value?: string | null) {
    return this.compactText(value, 191);
  }

  private buildMiniLoginDevice(device?: MiniLoginDeviceInput | null, ua?: string | null) {
    const parts = [
      device?.brand,
      device?.model,
      device?.system,
      device?.platform,
      device?.hostName,
      device?.version ? `WeChat ${device.version}` : "",
      device?.SDKVersion ? `SDK ${device.SDKVersion}` : "",
    ]
      .map((item) => String(item || "").trim())
      .filter(Boolean);

    if (parts.length) {
      return this.compactLoginDevice([...new Set(parts)].join(" / "));
    }
    return this.compactLoginDevice(ua || null);
  }

  private normalizePhone(value?: string | null) {
    const phone = String(value || '').replace(/\s+/g, '').trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      throw new BadRequestException('请输入正确的手机号');
    }
    return phone;
  }

  private buildPhoneLoginOpenid(phone: string) {
    return `${this.PHONE_LOGIN_OPENID_PREFIX}${crypto.createHash('sha256').update(phone).digest('hex').slice(0, 32)}`;
  }

  private isPhoneLoginOpenid(openid?: string | null) {
    return String(openid || '').startsWith(this.PHONE_LOGIN_OPENID_PREFIX);
  }

  private async buildLoginMeta(input: LoginMetaInput) {
    const deviceText = this.buildMiniLoginDevice(input.device, input.ua);
    const method = this.compactLoginDevice(input.method || null);
    const location = await this.ipGeo.resolve(input.ip);
    return {
      lastLoginAt: new Date(),
      lastLoginIp: this.compactIp(input.ip),
      lastLoginCountry: location?.country || null,
      lastLoginProvince: location?.province || null,
      lastLoginCity: location?.city || null,
      lastLoginDistrict: location?.district || null,
      lastLoginLocationSource: location?.provider || null,
      lastLoginLocatedAt: location ? new Date() : null,
      lastLoginDevice: this.compactLoginDevice([method, deviceText].filter(Boolean).join(' / ')),
      lastLoginUserAgent: this.compactUserAgent(input.ua),
    };
  }

  private async createUserProfileDefaults(userId: string) {
    await Promise.all([
      this.prisma.userProfile.upsert({
        where: { userId },
        create: { userId },
        update: {},
      }),
      this.prisma.userSettings.upsert({
        where: { userId },
        create: { userId },
        update: {},
      }),
    ]);
  }

  private async clearUserProfileCache(userId: string) {
    await Promise.all([
      this.redis.delPattern(`user:profile:${userId}:*`).catch(() => undefined),
      this.redis.delPattern(`user:profile:v2:${userId}:*`).catch(() => undefined),
    ]);
  }

  private formatLoginResponse(user: any, tokens: { accessToken: string; refreshToken: string; expiresIn: number }, studentVerify?: any) {
    const publicUser = this.formatPublicUser(user);
    return {
      id: user.id,
      uid: publicUser.uid,
      public_uid: publicUser.public_uid,
      publicUid: publicUser.publicUid,
      legacy_uid: user.uid,
      token: tokens.accessToken,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      nickname: user.nickname,
      avatar: user.avatar,
      phone: user.phone,
      mobile: user.phone,
      phone_bound: !!user.phone,
      wx_bound: !this.isPhoneLoginOpenid(user.openid),
      login_identifier_type: this.isPhoneLoginOpenid(user.openid) ? 'phone' : 'wechat',
      student_verified: studentVerify?.status === 'APPROVED',
      student_verification_status: studentVerify?.status?.toLowerCase() || 'none',
      status: user.status,
    };
  }

  private generatePublicUidCandidate() {
    return crypto.randomInt(10000000, 100000000);
  }

  private async ensurePublicUid(user: any) {
    if (!user?.id) return user;
    if (user.publicUid) return user;
    for (let i = 0; i < 8; i += 1) {
      const publicUid = this.generatePublicUidCandidate();
      try {
        return await (this.prisma.user as any).update({
          where: { id: user.id },
          data: { publicUid },
        });
      } catch (error: any) {
        if (error?.code !== 'P2002') throw error;
      }
    }
    const fallbackUid = 10000000 + (Math.abs(Number(user.uid || 0) * 7919) % 90000000);
    return (this.prisma.user as any).update({
      where: { id: user.id },
      data: { publicUid: fallbackUid },
    });
  }

  /** 判断当前环境是否为 production */
  private get isProduction(): boolean {
    return this.config.get('NODE_ENV') === 'production';
  }

  private async bindInitialRegion(userId: string, regionId?: string) {
    const targetRegionId = String(regionId || '').trim();
    if (!targetRegionId) return;

    const [profile, region] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { userId } }),
      this.prisma.region.findUnique({ where: { id: targetRegionId } }),
    ]);
    if (!region || !region.isOpen || profile?.regionId) return;

    await this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        regionId: region.id,
        region: region.name,
      },
      update: {
        regionId: region.id,
        region: region.name,
      },
    });
  }

  /**
   * AUD-P1-069: 登录时记录协议确认。
   * 用户在登录页勾选"已阅读并同意"后即视为确认用户协议和隐私政策的当前版本。
   */
  private async recordLoginAgreementConsent(userId: string, regionId?: string) {
    const effectiveRegionId = String(regionId || 'global').trim() || 'global';
    const now = new Date();
    const codes = ['TERMS_OF_SERVICE', 'PRIVACY_POLICY'];

    for (const code of codes) {
      await this.prisma.userAgreementConsent.upsert({
        where: {
          userId_code_version_regionId: {
            userId,
            code,
            version: '1.0.0',
            regionId: effectiveRegionId,
          },
        },
        update: { acceptedAt: now, scene: 'login', source: 'miniapp-login' },
        create: {
          userId,
          code,
          version: '1.0.0',
          regionId: effectiveRegionId,
          scene: 'login',
          source: 'miniapp-login',
          acceptedAt: now,
        },
      }).catch(() => undefined); // 静默失败，不阻塞登录
    }
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

  async wxMiniLogin(
    dto: { code: string; nickname?: string; avatarUrl?: string; region_id?: string; regionId?: string; loginDevice?: MiniLoginDeviceInput },
    ip?: string,
    ua?: string,
  ) {
    const { code, nickname, avatarUrl } = dto;
    const { appid, secret } = await this.getMiniappCredentials();
    const loginMeta = await this.buildLoginMeta({ ip, ua, device: dto.loginDevice, method: '微信小程序登录' });

    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`;
    const { data } = await axios.get(url);

    if (data.errcode) {
      throw new BadRequestException(`微信登录失败: ${data.errmsg}`);
    }

    const { openid, session_key, unionid } = data;

    let user: any = await this.prisma.user.findUnique({ where: { openid } });

    if (!user) {
      user = await (this.prisma.user as any).create({
        data: {
          openid,
          unionid: unionid || null,
          nickname: nickname || `用户${openid.slice(-6)}`,
          avatar: avatarUrl || null,
          ...loginMeta,
        },
      });
      await this.createUserProfileDefaults(user.id);
    } else {
      user = await (this.prisma.user as any).update({
        where: { id: user.id },
        data: {
          ...loginMeta,
          ...(nickname && !user.nickname ? { nickname } : {}),
          ...(avatarUrl && !user.avatar ? { avatar: avatarUrl } : {}),
        },
      });
    }
    user = await this.ensurePublicUid(user);

    await this.bindInitialRegion(user.id, dto.region_id || dto.regionId);

    const tokens = await this.generateTokens(user.id, openid);
    await this.redis.set(`session_key:${user.id}`, session_key, 7200);

    // AUD-P1-069: 登录时记录协议确认（用户勾选同意后登录即视为确认当前版本）
    await this.recordLoginAgreementConsent(user.id, dto.region_id || dto.regionId).catch(() => {});

    await this.clearUserProfileCache(user.id);
    const studentVerify = await this.prisma.studentVerify.findUnique({ where: { userId: user.id } });
    return this.formatLoginResponse(user, tokens, studentVerify);
  }

  async getPhoneNumber(userId: string, dto: { code: string }) {
    const phone = await this.resolveWxPhoneNumber(dto.code);
    await this.prisma.user.update({ where: { id: userId }, data: { phone } });
    return { phone, phoneNumber: phone, mobile: phone };
  }

  async phoneOneTapLogin(
    dto: { loginCode?: string; code?: string; phoneCode?: string; nickname?: string; avatarUrl?: string; region_id?: string; regionId?: string; loginDevice?: MiniLoginDeviceInput },
    ip?: string,
    ua?: string,
  ) {
    const loginCode = String(dto.loginCode || dto.code || '').trim();
    const phoneCode = String(dto.phoneCode || '').trim();
    if (!loginCode) throw new BadRequestException('缺少微信登录凭证');
    if (!phoneCode) throw new BadRequestException('缺少手机号授权凭证');

    const { appid, secret } = await this.getMiniappCredentials();
    const sessionUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${loginCode}&grant_type=authorization_code`;
    const { data } = await axios.get(sessionUrl);
    if (data.errcode) {
      throw new BadRequestException(`微信登录失败: ${data.errmsg}`);
    }

    const { openid, session_key, unionid } = data;
    const phone = await this.resolveWxPhoneNumber(phoneCode);
    const loginMeta = await this.buildLoginMeta({ ip, ua, device: dto.loginDevice, method: '手机号一键登录' });

    let user: any = await this.prisma.user.findUnique({ where: { openid } });
    if (!user) {
      const phoneUser = await this.prisma.user.findFirst({ where: { phone, status: { not: 'DELETED' as any } } });
      if (phoneUser && !this.isPhoneLoginOpenid(phoneUser.openid)) {
        throw new BadRequestException('该手机号已绑定其他微信账号，请使用手机号验证码登录');
      }
      user = phoneUser
        ? await (this.prisma.user as any).update({
            where: { id: phoneUser.id },
            data: {
              openid,
              unionid: unionid || phoneUser.unionid || null,
              phone,
              ...loginMeta,
              ...(dto.nickname && !phoneUser.nickname ? { nickname: dto.nickname } : {}),
              ...(dto.avatarUrl && !phoneUser.avatar ? { avatar: dto.avatarUrl } : {}),
            },
          })
        : await (this.prisma.user as any).create({
            data: {
              openid,
              unionid: unionid || null,
              phone,
              nickname: dto.nickname || `用户${phone.slice(-4)}`,
              avatar: dto.avatarUrl || null,
              ...loginMeta,
            },
          });
      await this.createUserProfileDefaults(user.id);
    } else {
      user = await (this.prisma.user as any).update({
        where: { id: user.id },
        data: {
          phone,
          unionid: unionid || user.unionid || null,
          ...loginMeta,
          ...(dto.nickname && !user.nickname ? { nickname: dto.nickname } : {}),
          ...(dto.avatarUrl && !user.avatar ? { avatar: dto.avatarUrl } : {}),
        },
      });
    }

    user = await this.ensurePublicUid(user);
    await this.bindInitialRegion(user.id, dto.region_id || dto.regionId);
    await this.redis.set(`session_key:${user.id}`, session_key, 7200);

    const tokens = await this.generateTokens(user.id, user.openid);
    // AUD-P1-069: 记录协议确认
    await this.recordLoginAgreementConsent(user.id, dto.region_id || dto.regionId).catch(() => {});
    await this.clearUserProfileCache(user.id);
    const studentVerify = await this.prisma.studentVerify.findUnique({ where: { userId: user.id } });
    return this.formatLoginResponse(user, tokens, studentVerify);
  }

  async sendPhoneLoginCode(dto: { phone?: string; mobile?: string }, ip?: string) {
    const phone = this.normalizePhone(dto.phone || dto.mobile);
    const key = `phone_login:code:${phone}`;
    const ipKey = `phone_login:ip:${this.compactIp(ip) || 'unknown'}`;
    const throttleKey = `phone_login:cooldown:${phone}`;

    try {
      const existingCooldown = await this.redis.get(throttleKey);
      if (existingCooldown) {
        throw new BadRequestException('验证码发送过于频繁，请稍后再试');
      }
      const ipCount = await this.redis.incr(ipKey);
      await this.redis.expire(ipKey, 60);
      if (Number(ipCount) > this.PHONE_CODE_IP_LIMIT) {
        throw new BadRequestException('验证码请求过于频繁，请稍后再试');
      }
      await this.redis.set(throttleKey, '1', this.PHONE_CODE_MIN_INTERVAL);
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      if (this.isProduction) {
        this.logger.error(`生产环境 Redis 不可用，无法执行手机号验证码限流: ${error?.message || error}`);
        throw new BadRequestException('验证码服务暂不可用，请稍后重试');
      }
      // Redis 不可用时仍允许本地测试验证码走内存。
    }

    const smsConfig = await this.getSmsConfig();
    const existingCode = await this.readPhoneCode(key);
    const previousState = existingCode ? await this.readPhoneSmsState(phone) : null;
    const automatic = smsConfig.mode === 'auto';
    if (automatic && previousState?.attemptedProviders.length === 2) {
      throw new BadRequestException('本验证码已通过双通道发送，请检查垃圾短信或五分钟后重试');
    }

    const reuseExisting = automatic && !!existingCode && !!previousState;
    const code = reuseExisting
      ? existingCode
      : this.isProduction
        ? String(crypto.randomInt(100000, 1000000))
        : String(this.config.get('DEV_PHONE_LOGIN_CODE') || '123456').slice(0, 6).padStart(6, '0');
    const previousAttempts = reuseExisting ? previousState.attemptedProviders : [];
    const resendProvider = previousAttempts.length === 1
      ? this.getBackupSmsProvider(previousAttempts[0])
      : undefined;

    if (!reuseExisting) {
      await this.storePhoneCode(key, code);
    }
    try {
      const sendResult = await this.sendSmsCode(phone, code, {
        provider: resendProvider,
        allowFallback: previousAttempts.length === 0,
        smsConfig,
      });
      if (automatic) {
        const attemptedProviders = Array.from(new Set([
          ...previousAttempts,
          ...sendResult.attemptedProviders,
        ])) as SmsProvider[];
        await this.storePhoneSmsState(phone, {
          attemptedProviders,
          lastProvider: sendResult.provider,
          deliveryUnknown: sendResult.deliveryUnknown,
        });
      } else {
        await this.deletePhoneSmsState(phone);
      }
    } catch (error) {
      const failedAttempts = Array.isArray((error as any)?.smsAttemptedProviders)
        ? (error as any).smsAttemptedProviders.filter((item: unknown): item is SmsProvider => item === 'aliyun' || item === 'tencent')
        : [];
      if (reuseExisting && automatic && failedAttempts.length) {
        const attemptedProviders = Array.from(new Set([
          ...previousAttempts,
          ...failedAttempts,
        ])) as SmsProvider[];
        await this.storePhoneSmsState(phone, {
          attemptedProviders,
          lastProvider: failedAttempts[failedAttempts.length - 1],
          deliveryUnknown: false,
        });
      } else if (!reuseExisting) {
        await Promise.all([
          this.deletePhoneCode(key),
          this.deletePhoneCode(throttleKey),
          this.deletePhoneSmsState(phone),
        ]);
      }
      throw error;
    }
    return {
      success: true,
      message: this.isProduction ? '验证码已发送' : `本地测试验证码：${code}`,
      expiresIn: this.PHONE_CODE_TTL,
      debugCode: this.isProduction ? undefined : code,
    };
  }

  async phoneLogin(
    dto: { phone?: string; mobile?: string; code?: string; region_id?: string; regionId?: string; loginDevice?: MiniLoginDeviceInput },
    ip?: string,
    ua?: string,
    options: { preferApprovedOfficialRider?: boolean } = {},
  ) {
    const phone = this.normalizePhone(dto.phone || dto.mobile);
    const code = String(dto.code || '').trim();
    if (!code) throw new BadRequestException('请输入验证码');
    await this.verifyPhoneLoginCode(phone, code);

    const loginMeta = await this.buildLoginMeta({ ip, ua, device: dto.loginDevice, method: '手机号验证码登录' });
    let user: any = await this.findPhoneLoginUser(
      phone,
      options.preferApprovedOfficialRider === true,
    );
    if (!user) {
      user = await (this.prisma.user as any).create({
        data: {
          openid: this.buildPhoneLoginOpenid(phone),
          phone,
          nickname: `用户${phone.slice(-4)}`,
          ...loginMeta,
        },
      });
      await this.createUserProfileDefaults(user.id);
    } else {
      user = await (this.prisma.user as any).update({
        where: { id: user.id },
        data: loginMeta,
      });
    }

    user = await this.ensurePublicUid(user);
    await this.bindInitialRegion(user.id, dto.region_id || dto.regionId);
    const tokens = await this.generateTokens(user.id, user.openid);
    // AUD-P1-069: 记录协议确认
    await this.recordLoginAgreementConsent(user.id, dto.region_id || dto.regionId).catch(() => {});
    await this.clearUserProfileCache(user.id);
    const studentVerify = await this.prisma.studentVerify.findUnique({ where: { userId: user.id } });
    return this.formatLoginResponse(user, tokens, studentVerify);
  }

  private async findPhoneLoginUser(phone: string, preferApprovedOfficialRider: boolean) {
    if (preferApprovedOfficialRider) {
      const riders = await this.prisma.regionRider.findMany({
        where: {
          phone,
          verifyStatus: 'approved',
          riderType: 'official',
          User: { status: { not: 'DELETED' as any } },
        },
        select: { userId: true },
        take: 2,
      });
      if (riders.length > 1) {
        throw new BadRequestException('该手机号关联了多个官方骑手账号，请联系管理员处理');
      }
      if (riders.length === 1) {
        return this.prisma.user.findFirst({
          where: { id: riders[0].userId, status: { not: 'DELETED' as any } },
        });
      }
    }
    return this.prisma.user.findFirst({
      where: { phone, status: { not: 'DELETED' as any } },
    });
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
    const publicUser = this.formatPublicUser(await this.ensurePublicUid(user));

    return {
      id: publicUser.id,
      uid: publicUser.uid,
      public_uid: publicUser.public_uid,
      publicUid: publicUser.publicUid,
      legacy_uid: publicUser.legacy_uid,
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

  async adminLogin(dto: { username: string; password: string; captchaId?: string; captcha?: string; mfaCode?: string }, ip?: string, ua?: string) {
    // 1. 校验验证码（不区分账号是否存在，统一返回"验证码错误"）
    const captchaRequired = process.env.ADMIN_LOGIN_CAPTCHA_REQUIRED !== 'false';
    if (captchaRequired && (!dto.captchaId || !dto.captcha)) {
      throw new BadRequestException('请填写验证码');
    }
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
    if (account.mfaEnabled && account.mfaSecret) {
      if (!dto.mfaCode) {
        // MFA 已启用但未提供验证码，返回需要 MFA 的状态
        throw new UnauthorizedException('MFA_REQUIRED');
      }
      // 验证 TOTP code
      const isValid = this.verifyTotpCode(account.mfaSecret, dto.mfaCode);
      if (!isValid) {
        await this.logAdminLogin(account.id, dto.username, false, 'MFA验证码错误', ip, ua);
        throw new UnauthorizedException('MFA验证码错误或已过期');
      }
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
        regionId: acctRole.regionId || null,
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
      regionIds: [...new Set(roles.map((role) => role.regionId).filter(Boolean))],
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
        regionIds: [...new Set(roles.map((role) => role.regionId).filter(Boolean))],
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
    // AUD-P1-166: 从数据库读取安全配置，不再使用硬编码值
    const securityConfig = await this.getSecurityConfig();
    const newFailCount = account.loginFailCount + 1;
    const lockedUntil =
      newFailCount >= securityConfig.loginFailLockCount
        ? new Date(Date.now() + securityConfig.lockDuration * 60 * 1000)
        : undefined;

    await this.prisma.adminAccount.update({
      where: { id: account.id },
      data: {
        loginFailCount: newFailCount,
        lockedUntil: lockedUntil || null,
      },
    });

    const failReason =
      newFailCount >= securityConfig.loginFailLockCount
        ? `密码错误(连续${newFailCount}次，已锁定${securityConfig.lockDuration}分钟)`
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

      // AUD-P1-164: 刷新前校验管理员账号状态，禁用/软删/需改密的管理员不能刷新 token
      const account = await this.prisma.adminAccount.findUnique({
        where: { id: payload.sub },
        select: { status: true, deletedAt: true, passwordResetRequired: true },
      });
      if (!account || account.status !== 'active' || account.deletedAt) {
        // 清理 refresh token
        await this.redis.del(`admin_refresh:${payload.sub}`).catch(() => undefined);
        throw new UnauthorizedException('管理员账号已被禁用或删除');
      }
      if (account.passwordResetRequired) {
        // 需要改密的管理员不能刷新 token，强制重新登录
        await this.redis.del(`admin_refresh:${payload.sub}`).catch(() => undefined);
        throw new UnauthorizedException('请先修改密码后再登录');
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
        webIp: this.compactIp(ip),
        webUserAgent: this.compactUserAgent(ua),
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
      // AUD-P1-162: 一次消费后删除 session，防止同一 ticket 重复换取 admin token
      await this.prisma.adminQrLoginSession.delete({ where: { ticket } }).catch(() => undefined);
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
        openid: this.compactText(user.openid, 191),
        nickname: this.compactText(user.nickname, 191),
        avatar: this.compactText(user.avatar, 191),
        scanIp: this.compactIp(ip),
        scanUserAgent: this.compactUserAgent(ua),
        scannedAt: session.scannedAt || new Date(),
      },
    });

    const accountActive = binding?.status === 'ACTIVE' && binding.account?.status === 'active';
    return {
      status: 'SCANNED',
      bindRequired: !accountActive,
      user: {
        id: user.id,
        uid: user.uid,
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
          openid: this.compactText(user.openid, 191),
          unionid: this.compactText(user.unionid, 191),
          nickname: this.compactText(user.nickname, 191),
          avatar: this.compactText(user.avatar, 191),
        },
        update: {
          accountId: account.id,
          status: 'ACTIVE',
          openid: this.compactText(user.openid, 191),
          unionid: this.compactText(user.unionid, 191),
          nickname: this.compactText(user.nickname, 191),
          avatar: this.compactText(user.avatar, 191),
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
        openid: this.compactText(user.openid, 191),
        nickname: this.compactText(user.nickname || binding?.nickname, 191),
        avatar: this.compactText(user.avatar || binding?.avatar, 191),
        scanIp: this.compactIp(ip) || session.scanIp,
        scanUserAgent: this.compactUserAgent(ua) || session.scanUserAgent,
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
      roles.push({
        id: acctRole.role.id,
        name: acctRole.role.name,
        code: acctRole.role.code,
        regionId: acctRole.regionId || null,
      });
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
      regionIds: [...new Set(roles.map((role) => role.regionId).filter(Boolean))],
      permissions: Array.from(permissionSet),
      status: account.status,
      passwordResetRequired: account.passwordResetRequired || false,
      mfaEnabled: account.mfaEnabled || false,
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
        regionId: acctRole.regionId || null,
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
      regionIds: [...new Set(roles.map((role) => role.regionId).filter(Boolean))],
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
        regionIds: [...new Set(roles.map((role) => role.regionId).filter(Boolean))],
        status: account.status === 'active' ? 1 : 0,
        passwordResetRequired: account.passwordResetRequired,
      },
    };
  }

  private async generateTokens(userId: string, openid: string) {
    // AUD-P1-178: 签发 token 前必须校验用户状态为 ACTIVE，封禁/禁用/已删除用户不得获取新 token
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      // 清理可能残留的 refresh token，防止旧 token 被刷新
      await this.redis.del(`refresh:${userId}`).catch(() => undefined);
      if (!user) {
        throw new UnauthorizedException('用户不存在');
      }
      if (user.status === 'BANNED') {
        throw new UnauthorizedException('账号已被封禁，暂无法登录');
      }
      if (user.status === 'INACTIVE') {
        throw new UnauthorizedException('账号已被禁用，暂无法登录');
      }
      if (user.status === 'DELETED') {
        throw new UnauthorizedException('账号已注销');
      }
      throw new UnauthorizedException('账号状态异常，暂无法登录');
    }

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

  // ===== AUD-P1-165: MFA (TOTP) 支持 =====

  /**
   * 生成 MFA 密钥和 QR 码数据
   */
  async generateMfaSecret(accountId: string, username: string) {
    const secret = speakeasy.generateSecret({
      name: `${this.config.get('APP_NAME') || '灵萌后台'}:${username}`,
      length: 20,
    });

    // 临时存储密钥（未启用状态），等待用户验证后才正式启用
    await this.redis.set(`mfa_setup:${accountId}`, secret.base32, 300); // 5分钟有效

    return {
      secret: secret.base32,
      otpauth: secret.otpauth_url,
      message: '请使用 Google Authenticator 或其他 TOTP 应用扫描二维码，然后调用 /auth/admin/mfa/enable 验证',
    };
  }

  /**
   * 验证 TOTP code 并启用 MFA
   */
  async enableMfa(accountId: string, code: string) {
    const pendingSecret = await this.redis.get(`mfa_setup:${accountId}`);
    if (!pendingSecret) {
      throw new BadRequestException('MFA 设置已过期，请重新生成');
    }

    const isValid = this.verifyTotpCode(pendingSecret, code);
    if (!isValid) {
      throw new BadRequestException('验证码错误，请重新输入');
    }

    // 验证通过，启用 MFA
    await this.prisma.adminAccount.update({
      where: { id: accountId },
      data: {
        mfaEnabled: true,
        mfaSecret: pendingSecret,
      },
    });

    // 清理临时密钥
    await this.redis.del(`mfa_setup:${accountId}`);

    return { success: true, message: 'MFA 已启用' };
  }

  /**
   * 禁用 MFA（需要验证当前 TOTP code）
   */
  async disableMfa(accountId: string, code: string) {
    const account = await this.prisma.adminAccount.findUnique({
      where: { id: accountId },
      select: { mfaEnabled: true, mfaSecret: true },
    });

    if (!account?.mfaEnabled || !account?.mfaSecret) {
      throw new BadRequestException('MFA 未启用');
    }

    const isValid = this.verifyTotpCode(account.mfaSecret, code);
    if (!isValid) {
      throw new BadRequestException('验证码错误，请重新输入');
    }

    await this.prisma.adminAccount.update({
      where: { id: accountId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
      },
    });

    return { success: true, message: 'MFA 已禁用' };
  }

  /**
   * 获取 MFA 状态
   */
  async getMfaStatus(accountId: string) {
    const account = await this.prisma.adminAccount.findUnique({
      where: { id: accountId },
      select: { mfaEnabled: true },
    });
    return { enabled: account?.mfaEnabled || false };
  }

  /**
   * 验证 TOTP code
   */
  private verifyTotpCode(secret: string, code: string): boolean {
    try {
      return speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token: code,
        window: 1, // 允许前后1个时间窗口的误差
      });
    } catch {
      return false;
    }
  }

  /**
   * AUD-P1-166: 从数据库读取安全配置，支持默认值
   */
  private async getSecurityConfig(): Promise<{
    loginFailLockCount: number;
    lockDuration: number;
    passwordMinLength: number;
    captchaRequired: boolean;
  }> {
    const defaults = {
      loginFailLockCount: 5,
      lockDuration: 15,
      passwordMinLength: 8,
      captchaRequired: process.env.ADMIN_LOGIN_CAPTCHA_REQUIRED !== 'false',
    };

    try {
      const config = await this.prisma.config.findUnique({
        where: { key: 'security' },
      });

      if (!config?.value) return defaults;

      const value = config.value as Record<string, any>;
      return {
        loginFailLockCount: Number(value.loginFailLockCount) || defaults.loginFailLockCount,
        lockDuration: Number(value.lockDuration) || defaults.lockDuration,
        passwordMinLength: Number(value.passwordMinLength) || defaults.passwordMinLength,
        captchaRequired: value.captchaRequired !== undefined
          ? Boolean(value.captchaRequired)
          : defaults.captchaRequired,
      };
    } catch {
      return defaults;
    }
  }

  /**
   * AUD-P1-166: 验证密码强度
   */
  async validatePasswordStrength(password: string): Promise<{ valid: boolean; message?: string }> {
    const config = await this.getSecurityConfig();
    return checkPasswordStrength(password, config.passwordMinLength);
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

  private async resolveWxPhoneNumber(code?: string) {
    const phoneCode = String(code || '').trim();
    if (!phoneCode) throw new BadRequestException('缺少手机号授权凭证');
    const accessToken = await this.getWxAccessToken();
    const url = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`;
    const { data } = await axios.post(url, { code: phoneCode });

    if (data.errcode !== 0) {
      throw new BadRequestException(`获取手机号失败: ${data.errmsg}`);
    }

    return this.normalizePhone(data.phone_info?.phoneNumber);
  }

  private async storePhoneCode(key: string, code: string) {
    try {
      await this.redis.set(key, code, this.PHONE_CODE_TTL);
    } catch (error: any) {
      if (this.isProduction) {
        this.logger.error(`生产环境 Redis 不可用，无法保存手机号验证码: ${error.message}`);
        throw new BadRequestException('验证码服务暂不可用，请稍后重试');
      }
      this.memoryPhoneCodeStore.set(key, { code, expiresAt: Date.now() + this.PHONE_CODE_TTL * 1000 });
    }
  }

  private async readPhoneCode(key: string) {
    try {
      return (await this.redis.get(key)) || '';
    } catch {
      const memory = this.memoryPhoneCodeStore.get(key);
      return memory && Date.now() <= memory.expiresAt ? memory.code : '';
    }
  }

  private getPhoneSmsStateKey(phone: string) {
    return `phone_login:sms_state:${phone}`;
  }

  private async readPhoneSmsState(phone: string): Promise<SmsSendState | null> {
    try {
      const raw = await this.redis.get(this.getPhoneSmsStateKey(phone));
      if (!raw) return null;
      const value = JSON.parse(raw) as Partial<SmsSendState>;
      const attemptedProviders = Array.isArray(value.attemptedProviders)
        ? value.attemptedProviders.filter((item): item is SmsProvider => item === 'aliyun' || item === 'tencent')
        : [];
      if (!attemptedProviders.length || (value.lastProvider !== 'aliyun' && value.lastProvider !== 'tencent')) return null;
      return {
        attemptedProviders: Array.from(new Set(attemptedProviders)),
        lastProvider: value.lastProvider,
        deliveryUnknown: value.deliveryUnknown === true,
      };
    } catch {
      return null;
    }
  }

  private async storePhoneSmsState(phone: string, state: SmsSendState) {
    try {
      await this.redis.set(this.getPhoneSmsStateKey(phone), JSON.stringify(state), this.PHONE_CODE_TTL);
    } catch (error: any) {
      this.logger.error(`保存短信发送通道状态失败: ${error?.message || error}`);
    }
  }

  private async deletePhoneSmsState(phone: string) {
    try {
      await this.redis.del(this.getPhoneSmsStateKey(phone));
    } catch {
      // 验证码仍由 Redis 有效期兜底，通道状态清理失败不影响登录。
    }
  }

  private async deletePhoneCode(key: string) {
    this.memoryPhoneCodeStore.delete(key);
    try {
      await this.redis.del(key);
    } catch {
      // 发送失败时尽量清理验证码，Redis 不可用由发送路径继续向外抛错。
    }
  }

  private async verifyPhoneLoginCode(phone: string, code: string) {
    const key = `phone_login:code:${phone}`;
    let stored = '';
    let fromMemory = false;
    try {
      stored = (await this.redis.get(key)) || '';
    } catch {
      const memory = this.memoryPhoneCodeStore.get(key);
      if (memory && Date.now() <= memory.expiresAt) {
        stored = memory.code;
        fromMemory = true;
      }
    }

    if (!stored || stored !== code) {
      throw new BadRequestException('验证码错误或已过期');
    }

    if (fromMemory) {
      this.memoryPhoneCodeStore.delete(key);
    } else {
      try {
        await this.redis.del(key);
      } catch {
        // ignore
      }
    }
    await this.deletePhoneSmsState(phone);
  }

  private async getSmsConfig() {
    const saved = await this.prisma.config.findUnique({ where: { key: 'sms' } }).catch(() => null);
    const value = ((saved?.value || {}) as Record<string, any>).sms || saved?.value || {};
    return {
      mode: String(value.mode || 'auto').trim().toLowerCase() === 'manual' ? 'manual' : 'auto',
      provider: String(value.provider || this.config.get('SMS_PROVIDER') || '').trim().toLowerCase(),
      aliyunAccessKeyId: String(value.aliyunAccessKeyId || this.config.get('ALIYUN_SMS_ACCESS_KEY_ID') || '').trim(),
      aliyunAccessKeySecret: String(value.aliyunAccessKeySecret || this.config.get('ALIYUN_SMS_ACCESS_KEY_SECRET') || '').trim(),
      aliyunSignName: String(value.aliyunSignName || this.config.get('ALIYUN_SMS_SIGN_NAME') || '').trim(),
      aliyunTemplateCode: String(value.aliyunTemplateCode || this.config.get('ALIYUN_SMS_TEMPLATE_CODE') || '').trim(),
      aliyunEndpoint: String(value.aliyunEndpoint || this.config.get('ALIYUN_SMS_ENDPOINT') || 'dysmsapi.aliyuncs.com').trim(),
      aliyunRegionId: String(value.aliyunRegionId || this.config.get('ALIYUN_SMS_REGION_ID') || 'cn-hangzhou').trim(),
      tencentSecretId: String(value.tencentSecretId || this.config.get('TENCENT_SMS_SECRET_ID') || '').trim(),
      tencentSecretKey: String(value.tencentSecretKey || this.config.get('TENCENT_SMS_SECRET_KEY') || '').trim(),
      tencentSmsSdkAppId: String(value.tencentSmsSdkAppId || this.config.get('TENCENT_SMS_SDK_APP_ID') || '').trim(),
      tencentSignName: String(value.tencentSignName || this.config.get('TENCENT_SMS_SIGN_NAME') || '').trim(),
      tencentTemplateId: String(value.tencentTemplateId || this.config.get('TENCENT_SMS_TEMPLATE_ID') || '').trim(),
      tencentEndpoint: String(value.tencentEndpoint || this.config.get('TENCENT_SMS_ENDPOINT') || 'sms.tencentcloudapi.com').trim(),
      tencentRegion: String(value.tencentRegion || this.config.get('TENCENT_SMS_REGION') || 'ap-guangzhou').trim(),
    };
  }

  private getBackupSmsProvider(provider: SmsProvider): SmsProvider {
    return provider === 'aliyun' ? 'tencent' : 'aliyun';
  }

  private isSmsDeliveryUnknown(error: any) {
    if (error?.smsDeliveryUnknown === true) return true;
    const code = String(error?.code || error?.name || '').toUpperCase();
    const message = String(error?.message || '').toLowerCase();
    return ['ETIMEDOUT', 'ECONNRESET', 'ECONNABORTED', 'EPIPE'].includes(code)
      || /request timeout|timed out|socket hang up|connection reset/.test(message);
  }

  private markSmsDeliveryUnknown(error: BadRequestException) {
    (error as any).smsDeliveryUnknown = true;
    return error;
  }

  private markSmsAttemptedProviders(error: any, attemptedProviders: SmsProvider[]) {
    error.smsAttemptedProviders = [...attemptedProviders];
    return error;
  }

  private normalizeSmsProvider(provider: string): SmsProvider {
    if (provider === 'aliyun' || provider === 'alicloud') return 'aliyun';
    if (provider === 'tencent') return 'tencent';
    throw new BadRequestException('短信服务提供商暂不支持，请在后台选择阿里云或腾讯云');
  }

  private async sendSmsByProvider(
    provider: SmsProvider,
    phone: string,
    code: string,
    smsConfig: Awaited<ReturnType<AuthService['getSmsConfig']>>,
  ) {
    if (provider === 'aliyun') {
      await this.sendAliyunSmsCode(phone, code, smsConfig);
      return;
    }
    await this.sendTencentSmsCode(phone, code, smsConfig);
  }

  private async sendSmsCode(
    phone: string,
    code: string,
    options: {
      provider?: SmsProvider;
      allowFallback?: boolean;
      smsConfig?: Awaited<ReturnType<AuthService['getSmsConfig']>>;
    } = {},
  ): Promise<SmsSendResult> {
    if (!this.isProduction) {
      this.logger.warn(`本地测试手机号验证码 ${phone}: ${code}`);
      return { provider: 'aliyun', attemptedProviders: [], deliveryUnknown: false };
    }
    const smsConfig = options.smsConfig || await this.getSmsConfig();
    if (!smsConfig.provider && !options.provider) {
      throw new BadRequestException('短信服务未配置，请联系管理员');
    }
    const primary = options.provider || this.normalizeSmsProvider(smsConfig.provider);
    const providers: SmsProvider[] = [primary];
    if (smsConfig.mode === 'auto' && options.allowFallback !== false) {
      providers.push(this.getBackupSmsProvider(primary));
    }
    const attemptedProviders: SmsProvider[] = [];

    for (const provider of providers) {
      attemptedProviders.push(provider);
      try {
        await this.sendSmsByProvider(provider, phone, code, smsConfig);
        return { provider, attemptedProviders, deliveryUnknown: false };
      } catch (error: any) {
        if (this.isSmsDeliveryUnknown(error)) {
          return { provider, attemptedProviders, deliveryUnknown: true };
        }
        if (provider === providers[providers.length - 1]) {
          const finalError = error instanceof BadRequestException
            ? error
            : new BadRequestException(error?.message || '短信发送失败');
          throw this.markSmsAttemptedProviders(finalError, attemptedProviders);
        }
        this.logger.warn(`${provider === 'aliyun' ? '阿里云' : '腾讯云'}短信明确失败，尝试备用通道`);
      }
    }
    throw new BadRequestException('短信发送失败');
  }

  private async sendAliyunSmsCode(phone: string, code: string, smsConfig: Awaited<ReturnType<AuthService['getSmsConfig']>>) {
    const accessKeyId = smsConfig.aliyunAccessKeyId;
    const accessKeySecret = smsConfig.aliyunAccessKeySecret;
    const signName = smsConfig.aliyunSignName;
    const templateCode = smsConfig.aliyunTemplateCode;
    const endpoint = smsConfig.aliyunEndpoint;
    const regionId = smsConfig.aliyunRegionId;

    const missing: string[] = [];
    if (!accessKeyId) missing.push('ALIYUN_SMS_ACCESS_KEY_ID');
    if (!accessKeySecret) missing.push('ALIYUN_SMS_ACCESS_KEY_SECRET');
    if (!signName) missing.push('ALIYUN_SMS_SIGN_NAME');
    if (!templateCode) missing.push('ALIYUN_SMS_TEMPLATE_CODE');
    if (missing.length) {
      throw new BadRequestException(`阿里云短信配置不完整：缺少 ${missing.join(', ')}`);
    }

    try {
      // 阿里云短信官方 SDK，生产环境真实发送验证码。
      const DysmsapiClient = require('@alicloud/dysmsapi20170525').default;
      const { SendSmsRequest } = require('@alicloud/dysmsapi20170525');
      const OpenApi = require('@alicloud/openapi-client');
      const TeaUtil = require('@alicloud/tea-util');
      const config = new OpenApi.Config({
        accessKeyId,
        accessKeySecret,
        regionId,
      });
      config.endpoint = endpoint;
      const client = new DysmsapiClient(config);
      const request = new SendSmsRequest({
        phoneNumbers: phone,
        signName,
        templateCode,
        templateParam: JSON.stringify({ code }),
      });
      const response = await client.sendSmsWithOptions(request, new TeaUtil.RuntimeOptions({}));
      const body = response?.body || {};
      if (body.code !== 'OK') {
        this.logger.warn(`阿里云短信发送失败 phone=${phone} code=${body.code || ''} message=${body.message || ''}`);
        throw new BadRequestException(body.message || '阿里云短信发送失败');
      }
      this.logger.log(`阿里云短信验证码已发送 phone=${phone} bizId=${body.bizId || ''}`);
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`阿里云短信发送异常 phone=${phone}: ${error?.message || error}`);
      const wrapped = new BadRequestException('阿里云短信发送失败，请检查 AccessKey、签名、模板和账户余额');
      throw this.isSmsDeliveryUnknown(error) ? this.markSmsDeliveryUnknown(wrapped) : wrapped;
    }
  }

  private async sendTencentSmsCode(phone: string, code: string, smsConfig: Awaited<ReturnType<AuthService['getSmsConfig']>>) {
    const secretId = smsConfig.tencentSecretId;
    const secretKey = smsConfig.tencentSecretKey;
    const smsSdkAppId = smsConfig.tencentSmsSdkAppId;
    const signName = smsConfig.tencentSignName;
    const templateId = smsConfig.tencentTemplateId;
    const endpoint = smsConfig.tencentEndpoint;
    const region = smsConfig.tencentRegion;

    const missing: string[] = [];
    if (!secretId) missing.push('TENCENT_SMS_SECRET_ID');
    if (!secretKey) missing.push('TENCENT_SMS_SECRET_KEY');
    if (!smsSdkAppId) missing.push('TENCENT_SMS_SDK_APP_ID');
    if (!signName) missing.push('TENCENT_SMS_SIGN_NAME');
    if (!templateId) missing.push('TENCENT_SMS_TEMPLATE_ID');
    if (missing.length) {
      throw new BadRequestException(`腾讯云短信配置不完整：缺少 ${missing.join(', ')}`);
    }

    try {
      // 延迟加载便于在测试中完全替换 SDK，避免任何外部短信请求。
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { sms } = require('tencentcloud-sdk-nodejs-sms');
      const client = new sms.v20210111.Client({
        credential: { secretId, secretKey },
        region,
        profile: {
          httpProfile: {
            endpoint,
            reqMethod: 'POST',
            reqTimeout: 10,
          },
        },
      });
      const response = await client.SendSms({
        PhoneNumberSet: [phone.startsWith('+') ? phone : `+86${phone}`],
        SmsSdkAppId: smsSdkAppId,
        SignName: signName,
        TemplateId: templateId,
        TemplateParamSet: [code],
      });
      const body = response || {};
      const status = body.SendStatusSet?.[0];
      if (status?.Code !== 'Ok') {
        this.logger.warn(`腾讯云短信发送失败 code=${status?.Code || ''} message=${status?.Message || ''}`);
        throw new BadRequestException(status?.Message || '腾讯云短信发送失败');
      }
      this.logger.log(`腾讯云短信验证码已发送 serialNo=${status.SerialNo || ''} requestId=${body.RequestId || ''}`);
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`腾讯云短信发送异常: ${error?.message || error}`);
      const wrapped = new BadRequestException('腾讯云短信发送失败，请检查 SecretId、SecretKey、签名、模板和账户余额');
      throw this.isSmsDeliveryUnknown(error) ? this.markSmsDeliveryUnknown(wrapped) : wrapped;
    }
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
