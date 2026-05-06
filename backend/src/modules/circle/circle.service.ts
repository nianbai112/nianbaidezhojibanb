import { Injectable, NotFoundException, BadRequestException, ForbiddenException, NotImplementedException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class CircleService {
  constructor(private readonly prisma: PrismaService) {}

  async getByRegion(regionId: string, query: any) {
    const { page = 1, limit = 20, user_id, is_pinned, my_circles, hot_circles } = query;
    const where: any = { regionId, status: 'active' };
    if (is_pinned) where.isOfficial = true;
    const [list, total] = await Promise.all([
      this.prisma.circle.findMany({ where, skip: (page - 1) * limit, take: Number(limit), orderBy: { memberCount: 'desc' } }),
      this.prisma.circle.count({ where }),
    ]);
    return { list, total, page, limit };
  }

  async getDetail(circleId: string) {
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
      include: { members: { include: { user: { select: { id: true, nickname: true, avatar: true } } } }, channels: true, topicGroups: { include: { topic: true } } },
    });
    if (!circle) throw new NotFoundException('圈子不存在');
    return circle;
  }

  async create(userId: string, dto: any) {
    const circle = await this.prisma.circle.create({ data: { ...dto, memberCount: 1 } });
    await this.prisma.circleMember.create({ data: { circleId: circle.id, userId, role: 'OWNER' } });
    return circle;
  }

  async update(circleId: string, userId: string, dto: any) {
    const member = await this.prisma.circleMember.findUnique({ where: { circleId_userId: { circleId, userId } } });
    if (!member || (member.role !== 'OWNER' && member.role !== 'ADMIN')) throw new ForbiddenException('无权操作');
    return this.prisma.circle.update({ where: { id: circleId }, data: dto });
  }

  async inviteMember(circleId: string, userId: string, dto: any) {
    const { inviteeId } = dto;
    const exists = await this.prisma.circleMember.findUnique({ where: { circleId_userId: { circleId, userId: inviteeId } } });
    if (exists) throw new BadRequestException('该用户已在圈子中');
    await this.prisma.circleMember.create({ data: { circleId, userId: inviteeId, role: 'MEMBER' } });
    await this.prisma.circle.update({ where: { id: circleId }, data: { memberCount: { increment: 1 } } });
    return { success: true };
  }

  async getGroupChat(circleId: string, query: any) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { type: 'circle', title: circleId },
      include: { members: { include: { user: { select: { id: true, nickname: true, avatar: true } } } }, messages: { take: 50, orderBy: { createdAt: 'desc' } } },
    });
    if (!conversation) throw new NotFoundException('群聊不存在');
    return conversation;
  }

  async createGroupChat(circleId: string, userId: string, dto: any, query: any) {
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId }, include: { members: true } });
    if (!circle) throw new NotFoundException('圈子不存在');
    const conversation = await this.prisma.conversation.create({
      data: { type: 'circle', title: circle.name },
    });
    for (const member of circle.members) {
      await this.prisma.conversationMember.create({
        data: { conversationId: conversation.id, userId: member.userId },
      });
    }
    return conversation;
  }

  async getPendingMembers(circleId: string, query: any) {
    const { page = 1, limit = 50 } = query;
    return this.prisma.circleMember.findMany({
      where: { circleId, role: 'MEMBER' },
      include: { user: { select: { id: true, nickname: true, avatar: true } } },
      skip: (page - 1) * limit,
      take: Number(limit),
      orderBy: { joinAt: 'desc' },
    });
  }

  async auditMember(circleId: string, memberId: string, userId: string, dto: any) {
    const { status } = dto;
    const member = await this.prisma.circleMember.findUnique({ where: { id: memberId } });
    if (!member || member.circleId !== circleId) throw new NotFoundException('成员不存在');
    if (status === 'approved') {
      await this.prisma.circleMember.update({ where: { id: memberId }, data: { role: 'MEMBER' } });
    } else {
      await this.prisma.circleMember.delete({ where: { id: memberId } });
      await this.prisma.circle.update({ where: { id: circleId }, data: { memberCount: { decrement: 1 } } });
    }
    return { success: true };
  }

  async getMembers(circleId: string, query: any) {
    const { page = 1, limit = 50 } = query;
    const [list, total] = await Promise.all([
      this.prisma.circleMember.findMany({
        where: { circleId },
        include: { user: { select: { id: true, nickname: true, avatar: true } } },
        skip: (page - 1) * limit,
        take: Number(limit),
        orderBy: { role: 'asc', joinAt: 'desc' },
      }),
      this.prisma.circleMember.count({ where: { circleId } }),
    ]);
    return { list, total, page, limit };
  }

  async join(circleId: string, userId: string) {
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle) throw new NotFoundException('圈子不存在');
    const exists = await this.prisma.circleMember.findUnique({ where: { circleId_userId: { circleId, userId } } });
    if (exists) throw new BadRequestException('已在圈子中');
    await this.prisma.circleMember.create({ data: { circleId, userId } });
    await this.prisma.circle.update({ where: { id: circleId }, data: { memberCount: { increment: 1 } } });
    return { success: true };
  }

  async leave(circleId: string, targetUserId: string, userId: string) {
    const member = await this.prisma.circleMember.findUnique({ where: { circleId_userId: { circleId, userId: targetUserId } } });
    if (!member) throw new NotFoundException('不在该圈子中');
    if (member.role === 'OWNER') throw new ForbiddenException('群主不能退出');
    await this.prisma.circleMember.delete({ where: { id: member.id } });
    await this.prisma.circle.update({ where: { id: circleId }, data: { memberCount: { decrement: 1 } } });
    return { success: true };
  }

  async checkMember(circleId: string, userId: string) {
    const member = await this.prisma.circleMember.findUnique({ where: { circleId_userId: { circleId, userId } } });
    return { isMember: !!member, role: member?.role || null };
  }

  async getTopicHeaders(circleId: string, includeTopics: string) {
    return this.prisma.circleTopicGroup.findMany({ where: { circleId }, include: { topic: true } });
  }

  async batchCreateTopicHeaders(circleId: string, userId: string, dto: any) {
    const { items } = dto;
    if (items && Array.isArray(items)) {
      await this.prisma.circleTopicGroup.createMany({
        data: items.map((item: any) => ({
          circleId,
          topicId: item.topicId,
          sortOrder: item.sortOrder ?? 0,
        })),
      });
    }
    return { success: true };
  }

  async updateTopicHeader(circleId: string, headerId: string, userId: string, dto: any) {
    await this.prisma.circleTopicGroup.update({
      where: { id: headerId },
      data: { sortOrder: dto.sortOrder },
    });
    return { success: true };
  }

  async deleteTopicHeader(circleId: string, headerId: string, userId: string) {
    await this.prisma.circleTopicGroup.delete({ where: { id: headerId } });
    return { success: true };
  }

  async unbindTopic(circleId: string, headerId: string, topicId: string, userId: string) {
    await this.prisma.circleTopicGroup.deleteMany({ where: { circleId, topicId } });
    return { success: true };
  }

  async search(query: any) {
    const { keyword, page = 1, limit = 20 } = query;
    const where: any = {};
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { description: { contains: keyword } },
      ];
    }
    return this.prisma.circle.findMany({
      where,
      skip: (page - 1) * limit,
      take: Number(limit),
      orderBy: { memberCount: 'desc' },
    });
  }

  async getHotKeywords(query: any) {
    return { keywords: ['校园生活', '二手交易', '兼职', '失物招领', '社团活动'] };
  }

  // ======================== Admin 方法 ========================

  async getAdminCircles(query: any) {
    const { page = 1, limit = 20, regionId, keyword, status } = query;
    const where: any = {};
    if (regionId) where.regionId = regionId;
    if (status) where.status = status;
    if (keyword) where.OR = [{ name: { contains: keyword } }, { description: { contains: keyword } }];

    const [list, total] = await Promise.all([
      this.prisma.circle.findMany({
        where,
        skip: (page - 1) * limit,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { members: true } } },
      }),
      this.prisma.circle.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async adminUpdateCircle(circleId: string, dto: any) {
    return this.prisma.circle.update({ where: { id: circleId }, data: dto });
  }

  async adminDissolveCircle(circleId: string) {
    await this.prisma.circle.update({ where: { id: circleId }, data: { status: 'dissolved' } });
    return { success: true };
  }

  async getAdminCircleMembers(circleId: string, query: any) {
    const { page = 1, limit = 50 } = query;
    const [list, total] = await Promise.all([
      this.prisma.circleMember.findMany({
        where: { circleId },
        include: { user: { select: { id: true, nickname: true, avatar: true, phone: true } } },
        skip: (page - 1) * limit,
        take: Number(limit),
        orderBy: { joinAt: 'desc' },
      }),
      this.prisma.circleMember.count({ where: { circleId } }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  async adminRemoveMember(memberId: string) {
    const member = await this.prisma.circleMember.findUnique({ where: { id: memberId } });
    if (!member) throw new Error('成员不存在');
    if (member.role === 'OWNER') throw new Error('无法移除群主');
    await this.prisma.circleMember.delete({ where: { id: memberId } });
    await this.prisma.circle.update({ where: { id: member.circleId }, data: { memberCount: { decrement: 1 } } });
    return { success: true };
  }

  async getAdminCircleConfig(regionId: string) {
    if (!regionId) throw new Error('regionId is required');
    const region = await this.prisma.region.findUnique({ where: { id: regionId } });
    if (!region) throw new Error('Region not found');
    const settings: any = region.settings || {};
    return settings.circleConfig || {};
  }

  async updateAdminCircleConfig(regionId: string, dto: any) {
    if (!regionId) throw new Error('regionId is required');
    const region = await this.prisma.region.findUnique({ where: { id: regionId } });
    if (!region) throw new Error('Region not found');
    const settings: any = region.settings || {};
    settings.circleConfig = { ...settings.circleConfig, ...dto };
    await this.prisma.region.update({ where: { id: regionId }, data: { settings } });
    return settings.circleConfig;
  }

  // ======================== 购买记录 ========================

  async getAdminCirclePayments(query: any) {
    const { page = 1, limit = 20, circleId, status, userId } = query;
    const where: any = {};
    if (circleId) where.circleId = circleId;
    if (status) where.status = status;
    if (userId) where.userId = userId;

    const [list, total] = await Promise.all([
      this.prisma.circlePayment.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          circle: { select: { id: true, name: true, cover: true } },
          user: { select: { id: true, nickname: true, avatar: true, phone: true } },
        },
      }),
      this.prisma.circlePayment.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(limit) };
  }

  // ======================== Admin 创建社群 ========================

  async adminCreateCircle(dto: any) {
    const { price, paidJoin, inviteCode, deadline, ...rest } = dto;
    const data: any = { ...rest, memberCount: 0 };
    if (price !== undefined) data.price = price;
    if (paidJoin !== undefined) data.paidJoin = paidJoin;
    if (inviteCode !== undefined) data.inviteCode = inviteCode;
    if (deadline !== undefined) data.deadline = new Date(deadline);
    return this.prisma.circle.create({ data });
  }

  // ======================== Admin 删除社群 ========================

  async adminDeleteCircle(circleId: string) {
    await this.prisma.circle.delete({ where: { id: circleId } });
    return { success: true };
  }
}
