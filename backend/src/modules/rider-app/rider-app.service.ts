import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ErrandService } from '../errand/errand.service';

@Injectable()
export class RiderAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly errandService: ErrandService,
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

  private async requireOfficialRider(userId: string) {
    const session = await this.buildSession(userId);
    if (!session.allowed) {
      throw new BadRequestException(session.message || '当前账号不能使用官方骑手 App');
    }
    return session;
  }

  private async buildSession(userId: string) {
    const [user, rider] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, nickname: true, avatar: true, phone: true },
      }),
      this.prisma.regionRider.findUnique({ where: { userId } }),
    ]);
    if (!user) {
      return { allowed: false, message: '账号不存在，请重新登录', user: null, rider: null };
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
    }

    const allowed = Boolean(rider && !message);
    return {
      allowed,
      message,
      user,
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
