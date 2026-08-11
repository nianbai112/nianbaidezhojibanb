import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { AuthService } from '../auth/auth.service';
import { ErrandService } from '../errand/errand.service';
import { SystemConfigService } from '../system-config/system-config.service';
import {
  isRiderPasswordWithinBcryptLimit,
  normalizeRiderPasswordUsername,
  PASSWORD_LOGIN_GENERIC_MESSAGE,
  RIDER_PASSWORD_CREDENTIAL_ID,
} from './rider-password-credential.contract';
import { sanitizeDeviceSummary } from './rider-password-credential.service';

const DUMMY_PASSWORD_HASH = '$2b$12$Z99xdBiy0l2THrMH4ie8kupph4vSYhzaJuxApZa.xrDxGlsHddjjC';
const PASSWORD_LOCK_MINUTES = 15;
const PASSWORD_LOGIN_LOCK_TTL_SECONDS = 10;
const PASSWORD_LOGIN_LOCK_ATTEMPTS = 20;
const PASSWORD_LOGIN_LOCK_RETRY_MS = 25;

@Injectable()
export class RiderAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly errandService: ErrandService,
    private readonly systemConfigService: SystemConfigService,
    private readonly redis: RedisService,
  ) {}

  async sendPhoneCode(dto: { phone?: string; mobile?: string }, ip?: string) {
    return this.authService.sendPhoneLoginCode(dto, ip);
  }

  async loginPhone(
    dto: { phone?: string; mobile?: string; code?: string },
    ip?: string,
    ua?: string,
  ) {
    const login = await this.authService.phoneLogin(dto, ip, ua);
    return {
      ...login,
      ...(await this.buildSession(login.id)),
    };
  }

  async loginPassword(
    dto: { username?: string; password?: string; device?: Record<string, unknown> },
    ip?: string,
    ua?: string,
  ) {
    const invalidLogin = () => new UnauthorizedException(PASSWORD_LOGIN_GENERIC_MESSAGE);
    for (let attempt = 0; attempt < PASSWORD_LOGIN_LOCK_ATTEMPTS; attempt += 1) {
      const result = await this.redis.withLock(
        `lock:rider_password:${RIDER_PASSWORD_CREDENTIAL_ID}`,
        PASSWORD_LOGIN_LOCK_TTL_SECONDS,
        async () => ({ value: await this.loginPasswordLocked(dto, ip, ua) }),
      );
      if (result) return result.value;
      if (attempt + 1 < PASSWORD_LOGIN_LOCK_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, PASSWORD_LOGIN_LOCK_RETRY_MS));
      }
    }
    throw invalidLogin();
  }

  private async loginPasswordLocked(
    dto: { username?: string; password?: string; device?: Record<string, unknown> },
    ip?: string,
    ua?: string,
  ) {
    const invalidLogin = () => new UnauthorizedException(PASSWORD_LOGIN_GENERIC_MESSAGE);
    const normalizedUsername = normalizeRiderPasswordUsername(dto?.username);
    const credential = await this.prisma.riderAppPasswordCredential.findUnique({
      where: { id: RIDER_PASSWORD_CREDENTIAL_ID },
      include: { User: { select: { openid: true } } },
    });
    const usernameMatches = Boolean(
      credential
      && normalizeRiderPasswordUsername(credential.username) === normalizedUsername,
    );
    const password = String(dto?.password || '');
    const passwordWithinLimit = isRiderPasswordWithinBcryptLimit(password);
    let passwordMatches = false;
    try {
      passwordMatches = await bcrypt.compare(
        passwordWithinLimit ? password : '',
        usernameMatches ? credential!.passwordHash : DUMMY_PASSWORD_HASH,
      );
    } catch {
      throw invalidLogin();
    }

    if (!credential || !usernameMatches) throw invalidLogin();
    const now = Date.now();
    const locked = Boolean(credential.lockedUntil && credential.lockedUntil.getTime() > now);
    const expired = Boolean(credential.expiresAt && credential.expiresAt.getTime() <= now);
    if (!passwordWithinLimit || !passwordMatches) {
      if (!locked) await this.recordPasswordFailure(credential.id);
      throw invalidLogin();
    }
    if (!credential.enabled || expired || locked) throw invalidLogin();

    const session = await this.buildSession(credential.userId);
    if (!session.allowed || !credential.User?.openid) throw invalidLogin();

    const lastLoginDevice = sanitizeDeviceSummary(dto?.device, ua);
    const claimed = await this.prisma.riderAppPasswordCredential.updateMany({
      where: {
        id: credential.id,
        normalizedUsername: credential.normalizedUsername,
        userId: credential.userId,
        passwordHash: credential.passwordHash,
        sessionVersion: credential.sessionVersion,
        enabled: true,
        failedAttempts: credential.failedAttempts,
        lockedUntil: credential.lockedUntil,
      },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: String(ip || '').trim().slice(0, 128) || null,
        lastLoginDevice: lastLoginDevice || Prisma.DbNull,
      },
    });
    if (claimed.count !== 1) throw invalidLogin();

    let tokens: { accessToken: string; refreshToken: string; expiresIn: number };
    try {
      tokens = await this.authService.issueActiveUserTokens(
        credential.userId,
        credential.User.openid,
        {
          authSource: 'rider_password',
          credentialId: credential.id,
          credentialVersion: credential.sessionVersion,
        },
        `refresh:rider_password:${credential.id}`,
      );
    } catch (error) {
      if (error instanceof UnauthorizedException) throw invalidLogin();
      throw error;
    }
    return { ...tokens, ...session };
  }

  loginWechat() {
    throw new BadRequestException('骑手 App 微信登录尚未配置，请使用手机号验证码登录');
  }

  getSession(userId: string) {
    return this.buildSession(userId);
  }

  async getOrders(userId: string, query: any) {
    await this.requireOfficialRider(userId);
    return this.errandService.getDeliveryOrdersList(userId, query);
  }

  async getOrderDetail(userId: string, orderId: string) {
    await this.requireOfficialRider(userId);
    return this.errandService.getRiderDeliveryOrderDetail(orderId, userId);
  }

  async acceptOrder(userId: string, orderId: string) {
    await this.requireOfficialRider(userId);
    return this.errandService.acceptOrder(orderId, userId);
  }

  async updateOrderStatus(userId: string, orderId: string, dto: any) {
    await this.requireOfficialRider(userId);
    return this.errandService.updateRiderStatus(orderId, userId, dto);
  }

  async updateLocation(userId: string, dto: any) {
    await this.requireOfficialRider(userId);
    const [activeErrands, activeShopOrders] = await Promise.all([
      this.prisma.errandOrder.count({
        where: { riderId: userId, status: { in: ['accepted', 'in_progress', 'arrived'] } },
      }),
      this.prisma.order.count({
        where: { riderId: userId, status: 'SHIPPED' as any },
      }),
    ]);
    if (activeErrands + activeShopOrders === 0) {
      throw new BadRequestException('没有配送中的订单，定位上传已关闭');
    }
    return this.errandService.updateLocation(userId, dto);
  }

  async updateLocationBatch(userId: string, dto: any) {
    await this.requireOfficialRider(userId);
    const source = Array.isArray(dto?.points) ? dto.points : [];
    if (source.length === 0) throw new BadRequestException('定位轨迹不能为空');
    if (source.length > 50) throw new BadRequestException('单次最多上传 50 个定位点');

    const configResponse = await this.systemConfigService.getRiderAppControlConfig();
    if (configResponse?.data?.runtime?.backgroundLocationEnabled === false) {
      throw new BadRequestException('后台定位已关闭，请稍后再补传');
    }
    const maxAgeHours = Number(configResponse?.data?.runtime?.locationMaxAgeHours) || 24;
    const now = Date.now();
    const orderCutoff = new Date(now - maxAgeHours * 60 * 60 * 1000);
    const [assignedErrands, assignedShopOrders] = await Promise.all([
      this.prisma.errandOrder.findMany({
        where: { riderId: userId, updatedAt: { gte: orderCutoff } },
        select: { id: true },
      }),
      this.prisma.order.findMany({
        where: { riderId: userId, updatedAt: { gte: orderCutoff } },
        select: { id: true },
      }),
    ]);
    if (assignedErrands.length + assignedShopOrders.length === 0) {
      throw new BadRequestException('没有可补传的配送订单');
    }
    const orderTypes = new Map<string, string>([
      ...assignedErrands.map((order) => [order.id, 'errand'] as const),
      ...assignedShopOrders.map((order) => [order.id, 'shop'] as const),
    ]);
    type TrackInput = {
      clientId: string;
      riderId: string;
      orderId: string | null;
      orderType: string | null;
      lat: number;
      lng: number;
      accuracy: number | null;
      speed: number | null;
      heading: number | null;
      recordedAt: Date;
    };
    const tracks: TrackInput[] = source.map((item: any): TrackInput => {
      const clientId = String(item?.client_id ?? item?.clientId ?? '').trim();
      if (!clientId || clientId.length > 128) throw new BadRequestException('定位点编号无效');
      const lat = Number(item?.lat ?? item?.latitude);
      const lng = Number(item?.lng ?? item?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new BadRequestException('定位坐标无效');
      }
      const recordedAt = new Date(String(item?.recorded_at ?? item?.recordedAt ?? ''));
      const recordedTime = recordedAt.getTime();
      if (!Number.isFinite(recordedTime)) throw new BadRequestException('定位采集时间无效');
      if (recordedTime > now + 5 * 60 * 1000) throw new BadRequestException('定位采集时间不能晚于服务器时间');
      if (recordedTime < now - maxAgeHours * 60 * 60 * 1000) {
        throw new BadRequestException(`定位点超过补传时效（${maxAgeHours} 小时）`);
      }
      const orderId = String(item?.order_id ?? item?.orderId ?? '').trim() || null;
      if (orderId && !orderTypes.has(orderId)) {
        throw new BadRequestException('定位点订单不属于当前骑手或已超过补传时效');
      }
      const optionalNumber = (value: unknown) => {
        if (value === undefined || value === null || value === '') return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
      };
      return {
        clientId,
        riderId: userId,
        orderId,
        orderType: orderId ? orderTypes.get(orderId) || null : null,
        lat,
        lng,
        accuracy: optionalNumber(item?.accuracy),
        speed: optionalNumber(item?.speed),
        heading: optionalNumber(item?.heading),
        recordedAt,
      };
    });

    const result = await this.prisma.riderLocationTrack.createMany({
      data: tracks,
      skipDuplicates: true,
    });
    const newest = tracks.reduce((latest, point) => (
      point.recordedAt >= latest.recordedAt ? point : latest
    ));
    await this.errandService.updateLocationIfNewer(
      userId,
      { lat: newest.lat, lng: newest.lng },
      newest.recordedAt,
    );
    return {
      success: true,
      inserted: result.count,
      accepted_client_ids: tracks.map((point) => point.clientId),
    };
  }

  async getProfile(userId: string) {
    await this.requireOfficialRider(userId);
    return this.errandService.getRiderInfo(userId);
  }

  async updateProfile(userId: string, dto: any) {
    await this.requireOfficialRider(userId);
    return this.errandService.updateRiderInfo(userId, dto);
  }

  async getStats(userId: string) {
    await this.requireOfficialRider(userId);
    return this.errandService.getOrderStats(userId);
  }

  async reportException(userId: string, orderId: string, dto: any) {
    await this.requireOfficialRider(userId);
    const type = String(dto?.type || '').trim();
    const descriptions: Record<string, string> = {
      merchant_delay: '商家未出餐或取货等待',
      cannot_contact: '无法联系用户',
      address_issue: '地址错误或无法进入',
      vehicle_issue: '车辆或设备故障',
      other: '其他配送异常',
    };
    if (!descriptions[type]) throw new BadRequestException('不支持的异常类型');
    const description = String(dto?.description || '').trim();
    if (description.length < 5 || description.length > 300) {
      throw new BadRequestException('异常说明需填写 5-300 个字');
    }
    const proofImages = Array.isArray(dto?.proof_images ?? dto?.proofImages)
      ? (dto.proof_images ?? dto.proofImages).filter(Boolean).map(String).slice(0, 3)
      : [];
    const [errand, shopOrder] = await Promise.all([
      this.prisma.errandOrder.findUnique({
        where: { id: orderId }, select: { id: true, riderId: true, status: true },
      }),
      this.prisma.order.findUnique({
        where: { id: orderId }, select: { id: true, riderId: true, status: true },
      }),
    ]);
    const order = errand || shopOrder;
    if (!order) throw new NotFoundException('订单不存在');
    if (order.riderId !== userId) throw new BadRequestException('订单未分配给当前骑手');
    const orderType = errand ? 'errand' : 'shop';
    const active = errand
      ? ['accepted', 'in_progress'].includes(String(order.status))
      : String(order.status) === 'SHIPPED';
    if (!active) throw new BadRequestException('当前订单状态不能上报配送异常');

    const existing = await this.prisma.deliveryRiskEvent.findFirst({
      where: { orderId, orderType, riderId: userId, eventType: type, handled: false },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return { success: true, duplicate: true, data: existing };

    const risk = await this.prisma.$transaction(async (tx) => {
      const created = await tx.deliveryRiskEvent.create({
        data: {
          orderId, orderType, riderId: userId, eventType: type,
          eventLevel: type === 'vehicle_issue' ? 'error' : 'warning',
          description, handled: false,
        },
      });
      await tx.deliveryOrderNode.create({
        data: {
          orderId, orderType, nodeType: 'exception', nodeLabel: descriptions[type],
          operatorId: userId, operatorType: 'rider', riderType: 'official',
          displayMode: 'live_map', proofImages: proofImages.length ? proofImages : undefined,
          remark: description,
        },
      });
      return created;
    });
    return { success: true, message: '异常已上报，平台将尽快处理', data: risk };
  }

  private async requireOfficialRider(userId: string) {
    const session = await this.buildSession(userId);
    if (!session.allowed) {
      throw new BadRequestException(session.message || '当前账号不能使用官方骑手 App');
    }
    return session;
  }

  private async recordPasswordFailure(credentialId: string) {
    const failed = await this.prisma.riderAppPasswordCredential.update({
      where: { id: credentialId },
      data: { failedAttempts: { increment: 1 } },
    });
    if (failed.failedAttempts >= 5) {
      await this.prisma.riderAppPasswordCredential.update({
        where: { id: credentialId },
        data: {
          lockedUntil: new Date(Date.now() + PASSWORD_LOCK_MINUTES * 60 * 1000),
        },
      });
    }
  }

  private async buildSession(userId: string) {
    const [user, rider] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, nickname: true, avatar: true, phone: true, status: true },
      }),
      this.prisma.regionRider.findUnique({ where: { userId } }),
    ]);
    if (!user) {
      return { allowed: false, message: '账号不存在，请重新登录', user: null, rider: null };
    }
    if (user.status !== 'ACTIVE') {
      return { allowed: false, message: '账号当前不可用，请联系管理员', user: null, rider: null };
    }

    const region = rider?.regionId
      ? await this.prisma.region.findUnique({
          where: { id: rider.regionId },
          select: { name: true },
        })
      : null;
    let message = '';
    if (!rider) {
      message = '尚未申请成为骑手，请先在小程序提交骑手申请';
    } else if (rider.verifyStatus !== 'approved') {
      message = rider.verifyStatus === 'rejected'
        ? '骑手申请未通过审核，请联系管理员'
        : '骑手申请审核中，请等待管理员审核';
    } else if (rider.riderType !== 'official') {
      message = '当前是兼职骑手账号，请联系管理员开通官方骑手后再使用 App';
    } else if (!rider.regionId) {
      message = '账号未绑定区域，请联系管理员分配所属区域';
    } else if (!region) {
      message = '骑手所属区域不存在，请联系管理员重新分配';
    }

    const allowed = Boolean(rider && !message);
    const sessionUser = {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      phone: user.phone,
    };
    return {
      allowed,
      message,
      user: sessionUser,
      rider: rider
        ? {
            id: rider.id,
            user_id: rider.userId,
            region_id: rider.regionId,
            region_name: region?.name || '',
            real_name: rider.realName,
            phone: rider.phone,
            rider_bio: rider.riderBio || '',
            status: rider.status,
            verify_status: rider.verifyStatus,
            rider_type: rider.riderType,
            is_official: rider.riderType === 'official',
            rating: rider.rating,
            balance: Number(rider.balance || 0),
            total_orders: rider.totalOrders,
            today_orders: rider.todayOrders,
          }
        : null,
    };
  }
}
