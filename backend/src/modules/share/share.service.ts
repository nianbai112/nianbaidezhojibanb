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
    return this.prisma.shareSettings.upsert({
      where: { regionId },
      create: { ...(dto as any), regionId },
      update: dto as any,
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
    const reward = await this.prisma.shareReward.findUnique({ where: { id } });
    if (!reward) throw new NotFoundException('奖励记录不存在');
    if (reward.status === 'SUCCESS') throw new BadRequestException('该奖励已发放成功');

    // Grant balance to user via wallet transaction
    const tx = await this.prisma.walletTransaction.create({
      data: {
        userId: reward.userId,
        type: 'REWARD',
        amount: reward.amount,
        balance: 0,
        description: `分享奖励补发 (奖励ID: ${reward.id})`,
        status: 'SUCCESS',
      },
    });

    // Update reward status
    return this.prisma.shareReward.update({
      where: { id },
      data: {
        status: 'SUCCESS',
        relatedTransactionId: tx.id,
        failedReason: null,
      },
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
