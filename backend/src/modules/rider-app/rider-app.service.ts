import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AuthService } from '../auth/auth.service';

/**
 * 官方骑手 App 的登录与会话服务。
 * 登录复用小程序微信登录（同一 User 体系），在此之上校验骑手资质：
 * 已申请骑手 → 审核通过 → 后台设为官方(riderType=official) → 已绑定区域。
 */
@Injectable()
export class RiderAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async loginWechat(dto: { code: string }) {
    if (!dto?.code) throw new BadRequestException('缺少微信登录 code');
    const login = await this.authService.wxMiniLogin({ code: dto.code });
    const session = await this.buildSession(login.id);
    return {
      token: login.token,
      accessToken: login.accessToken,
      refreshToken: login.refreshToken,
      ...session,
    };
  }

  async loginPhone(_dto: { phone?: string; code?: string }) {
    throw new BadRequestException('手机号登录暂未开通，请使用微信一键登录');
  }

  async getSession(userId: string) {
    return this.buildSession(userId);
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

    let regionName = '';
    if (rider?.regionId) {
      const region = await this.prisma.region.findUnique({
        where: { id: rider.regionId },
        select: { name: true },
      });
      regionName = region?.name || '';
    }

    let allowed = false;
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
    } else {
      allowed = true;
    }

    return {
      allowed,
      message,
      user: {
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar,
        phone: user.phone,
      },
      rider: rider
        ? {
            id: rider.id,
            user_id: rider.userId,
            region_id: rider.regionId,
            region_name: regionName,
            real_name: rider.realName,
            phone: rider.phone,
            rider_bio: rider.riderBio || '',
            status: rider.status,
            verify_status: rider.verifyStatus,
            rider_type: rider.riderType,
            is_official: rider.riderType === 'official',
            rating: rider.rating,
            balance: rider.balance,
            total_orders: rider.totalOrders,
            today_orders: rider.todayOrders,
          }
        : null,
    };
  }
}
