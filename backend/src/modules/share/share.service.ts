import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import {
  UpdateShareSettingsDto,
  ShareQueryDto,
  ShareInviteQueryDto,
  ShareRewardQueryDto,
} from './dto/share.admin.dto';

@Injectable()
export class ShareService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== 分享活动设置 ====================

  private parseList(value: any) {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    if (!value) return [];
    if (typeof value === 'string') {
      return value.split(/[\n,，\s]+/).map((item) => item.trim()).filter(Boolean);
    }
    return [];
  }

  private cleanSettingsDto(dto: UpdateShareSettingsDto) {
    const data: any = { ...(dto as any) };
    for (const key of ['inviterWhitelist', 'inviterBlacklist', 'inviteeBlacklist', 'blockedPhonePrefixes']) {
      if (key in data) data[key] = this.parseList(data[key]);
    }
    if (data.rewardReleaseMode) {
      const mode = String(data.rewardReleaseMode).trim().toLowerCase();
      data.rewardReleaseMode = ['immediate', 'manual', 'delayed', 'qualified'].includes(mode) ? mode : 'immediate';
    }
    return data;
  }

  private parseJsonObject(value: any) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
      const parsed = JSON.parse(String(value));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private async grantCoupon(tx: any, userId: string, couponId: any, reason: string) {
    const id = String(couponId || '').trim();
    if (!id) return null;
    const coupon = await tx.coupon.findUnique({ where: { id } });
    if (!coupon || coupon.status !== 'active') throw new BadRequestException(`${reason}优惠券不存在或已失效`);
    const now = new Date();
    if (coupon.endAt && now > coupon.endAt) throw new BadRequestException(`${reason}优惠券已过期`);
    if (coupon.receivedCount >= coupon.totalCount) throw new BadRequestException(`${reason}优惠券已领完`);
    const owned = await tx.couponReceive.count({ where: { couponId: id, userId } });
    if (owned >= coupon.limitPerUser) return null;
    const receive = await tx.couponReceive.create({ data: { couponId: id, userId } });
    await tx.coupon.update({ where: { id }, data: { receivedCount: { increment: 1 } } });
    return receive;
  }

  private async grantRewardCoupon(tx: any, reward: any) {
    const regionId = reward?.invite?.regionId;
    if (!regionId) return null;
    const config = await tx.config.findUnique({ where: { key: `share_invite_coupon_config_${regionId}` } }).catch(() => null);
    const value = this.parseJsonObject(config?.value);
    const couponId = reward.type === 'INVITER' ? value.inviterCouponId : value.inviteeCouponId;
    const reason = reward.type === 'INVITER' ? '邀请人奖励' : '新人奖励';
    return this.grantCoupon(tx, reward.userId, couponId, reason);
  }

  async getSettingsList(query: ShareQueryDto) {
    const { page = 1, pageSize = 20, regionId, status } = query;
    const where: any = {};
    if (regionId) where.regionId = regionId;

    const [list, total] = await Promise.all([
      this.prisma.shareSettings.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.shareSettings.count({ where }),
    ]);

    return { list, total, page, pageSize };
  }

  async getSettings(regionId: string) {
    const s = await this.prisma.shareSettings.findUnique({ where: { regionId } });
    if (!s) throw new NotFoundException('该区域暂无分享设置');
    return s;
  }

  async upsertSettings(regionId: string, dto: UpdateShareSettingsDto) {
    const data = this.cleanSettingsDto(dto);
    return this.prisma.shareSettings.upsert({
      where: { regionId },
      create: { ...data, regionId },
      update: data,
    });
  }

  async deleteSettings(regionId: string) {
    const s = await this.prisma.shareSettings.findUnique({ where: { regionId } });
    if (!s) throw new NotFoundException('设置不存在');
    return this.prisma.shareSettings.delete({ where: { regionId } });
  }

  // ==================== 邀请记录 ====================

  async getInviteList(query: ShareInviteQueryDto) {
    const { page = 1, pageSize = 20, inviterId, inviteeId, regionId, status, startDate, endDate } = query;
    const where: any = {};
    if (inviterId) where.inviterId = inviterId;
    if (inviteeId) where.inviteeId = inviteeId;
    if (regionId) where.regionId = regionId;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59');
    }

    const [list, total] = await Promise.all([
      this.prisma.shareInvite.findMany({
        where,
        include: {
          inviter: { select: { id: true, nickname: true, avatar: true } },
          invitee: { select: { id: true, nickname: true, avatar: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.shareInvite.count({ where }),
    ]);

    return { list, total, page, pageSize };
  }

  async getInvite(id: string) {
    const r = await this.prisma.shareInvite.findUnique({
      where: { id },
      include: {
        inviter: { select: { id: true, nickname: true, avatar: true } },
        invitee: { select: { id: true, nickname: true, avatar: true } },
      },
    });
    if (!r) throw new NotFoundException('邀请记录不存在');
    return r;
  }

  // ==================== 奖励记录 ====================

  async getRewardList(query: ShareRewardQueryDto) {
    const { page = 1, pageSize = 20, userId, type, status, startDate, endDate } = query;
    const where: any = {};
    if (userId) where.userId = userId;
    if (type) where.type = type;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59');
    }

    const [list, total] = await Promise.all([
      this.prisma.shareReward.findMany({
        where,
        include: {
          user: { select: { id: true, nickname: true, avatar: true } },
          invite: { select: { id: true, inviterId: true, inviteeId: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.shareReward.count({ where }),
    ]);

    return { list, total, page, pageSize };
  }

  async retryReward(id: string) {
    const reward = await this.prisma.shareReward.findUnique({ where: { id }, include: { invite: true } });
    if (!reward) throw new NotFoundException('奖励记录不存在');
    if (reward.status === 'SUCCESS') throw new BadRequestException('该奖励已发放成功');

    return this.prisma.$transaction(async (tx) => {
      const amount = Number(reward.amount || 0);
      let walletTx: any = null;
      if (amount > 0) {
        const wallet = await tx.wallet.upsert({
          where: { userId: reward.userId },
          create: { userId: reward.userId, balance: reward.amount, totalIn: reward.amount },
          update: { balance: { increment: reward.amount }, totalIn: { increment: reward.amount } },
        });
        walletTx = await tx.walletTransaction.create({
          data: {
            userId: reward.userId,
            type: 'REWARD',
            amount: reward.amount,
            balance: wallet.balance,
            description: `分享奖励发放 (奖励ID: ${reward.id})`,
            status: 'SUCCESS',
          },
        });
      }
      await this.grantRewardCoupon(tx, reward);
      const updated = await tx.shareReward.update({
        where: { id },
        data: {
          status: 'SUCCESS',
          relatedTransactionId: walletTx?.id || null,
          failedReason: null,
        },
      });
      if (reward.inviteId) {
        const pendingLeft = await tx.shareReward.count({
          where: { inviteId: reward.inviteId, status: { not: 'SUCCESS' } },
        });
        if (pendingLeft === 0) {
          await tx.shareInvite.update({
            where: { id: reward.inviteId },
            data: { status: 'SUCCESS', failedReason: null },
          });
        }
      }
      return updated;
    });
  }

  // ==================== 统计 ====================

  async getStatsOverview() {
    const [totalInvites, todayInvites, successInvites, failedInvites, totalReward] = await Promise.all([
      this.prisma.shareInvite.count(),
      this.prisma.shareInvite.count({
        where: { createdAt: { gte: new Date(new Date().toISOString().slice(0, 10)) } },
      }),
      this.prisma.shareInvite.count({ where: { status: 'SUCCESS' } }),
      this.prisma.shareInvite.count({ where: { status: 'FAILED' } }),
      this.prisma.shareReward.aggregate({
        where: { status: 'SUCCESS' },
        _sum: { amount: true },
      }),
    ]);

    return {
      totalInvites,
      todayInvites,
      successInvites,
      failedInvites,
      totalRewardAmount: totalReward._sum.amount || 0,
    };
  }
}
