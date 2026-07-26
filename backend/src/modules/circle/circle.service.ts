import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class CircleService {
  constructor(private readonly prisma: PrismaService) {}

  private getCircleConfigDefaults(regionId = "") {
    return {
      regionId,
      enable_circle: 1,
      circle_default_layout: "single",
      allow_user_create_circle: 1,
      create_audit_type: "manual",
      circle_audit_type: "manual",
      default_circle_id: "",
      default_join_method: "free",
      circle_name_min_length: 2,
      circle_name_max_length: 20,
      circle_desc_max_length: 300,
      max_members_per_circle: 500,
      max_circles_per_user: 5,
      max_manage_circles_per_user: 3,
      allow_paid_circle: 0,
      min_join_price: 0,
      max_join_price: 999,
      paid_circle_requires_audit: 1,
      require_student_auth_create: 0,
      circle_icon_required: 0,
      circle_cover_required: 0,
      allow_circle_announcement: 1,
      allow_group_chat: 1,
      allow_private_circle: 1,
      owner_can_invite: 1,
      member_approval_required: 0,
      qrcode_filter_in_circle: 1,
      allow_circle_post: 1,
      circle_post_permission: "members",
      enable_topic_headers: 1,
      max_topic_headers: 5,
      max_topics_per_header: 20,
      default_topic_header_names: ["公告", "交流", "问答"],
      circle_notice: "加入圈子后可以参与圈内笔记、话题和同校交流。",
    };
  }

  private normalizeCircleConfigPayload(payload: any, regionId: string) {
    const merged: any = { ...this.getCircleConfigDefaults(regionId), ...(payload || {}), regionId };
    const flagKeys = [
      "enable_circle",
      "allow_user_create_circle",
      "allow_paid_circle",
      "paid_circle_requires_audit",
      "require_student_auth_create",
      "circle_icon_required",
      "circle_cover_required",
      "allow_circle_announcement",
      "allow_group_chat",
      "allow_private_circle",
      "owner_can_invite",
      "member_approval_required",
      "qrcode_filter_in_circle",
      "allow_circle_post",
      "enable_topic_headers",
    ];
    for (const key of flagKeys) merged[key] = merged[key] ? 1 : 0;
    const numericKeys = [
      "circle_name_min_length",
      "circle_name_max_length",
      "circle_desc_max_length",
      "max_members_per_circle",
      "max_circles_per_user",
      "max_manage_circles_per_user",
      "min_join_price",
      "max_join_price",
      "max_topic_headers",
      "max_topics_per_header",
    ];
    const defaults: any = this.getCircleConfigDefaults(regionId);
    for (const key of numericKeys) {
      const n = Number(merged[key]);
      merged[key] = Number.isFinite(n) ? n : defaults[key];
    }
    if (typeof merged.default_topic_header_names === "string") {
      merged.default_topic_header_names = merged.default_topic_header_names
        .split(/[,\n]/)
        .map((item: string) => item.trim())
        .filter(Boolean);
    }
    return merged;
  }

  private async resolveAdminConfigRegionId(regionId?: string) {
    if (regionId) return regionId;
    const region = await this.prisma.region.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!region) throw new BadRequestException('暂无区域，请先创建区域');
    return region.id;
  }

  private normalizeTags(value: any): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map((item) => String(item || '').trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value
        .split(/[,\n，]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  private normalizeJoinType(value: any): 'OPEN' | 'APPLY' | 'INVITE' {
    const joinTypeMap: Record<string, 'OPEN' | 'APPLY' | 'INVITE'> = {
      free: 'OPEN',
      open: 'OPEN',
      OPEN: 'OPEN',
      apply: 'APPLY',
      audit: 'APPLY',
      APPLY: 'APPLY',
      invite: 'INVITE',
      INVITE: 'INVITE',
    };
    return joinTypeMap[String(value || 'OPEN')] || 'OPEN';
  }

  private buildCircleMutationData(dto: any, options: { requireName?: boolean; regionId?: string; defaultMaxMembers?: number } = {}) {
    const data: any = {};
    if (dto.name !== undefined) {
      const name = String(dto.name || '').trim();
      if (options.requireName && !name) throw new BadRequestException('圈子名称不能为空');
      if (name) data.name = name;
    } else if (options.requireName) {
      throw new BadRequestException('圈子名称不能为空');
    }
    const regionId = options.regionId ?? dto.regionId ?? dto.region_id;
    if (regionId !== undefined) data.regionId = regionId ? String(regionId) : null;
    if (dto.icon !== undefined) data.icon = String(dto.icon || '');
    if (dto.cover !== undefined) data.cover = String(dto.cover || '');
    if (dto.description !== undefined) data.description = String(dto.description || '');
    if (dto.joinType !== undefined || dto.join_type !== undefined) {
      data.joinType = this.normalizeJoinType(dto.joinType ?? dto.join_type);
    }
    if (dto.isOfficial !== undefined) data.isOfficial = !!dto.isOfficial;
    if (dto.status !== undefined) data.status = String(dto.status || 'active');
    if (dto.maxMembers !== undefined || dto.max_members !== undefined || options.defaultMaxMembers !== undefined) {
      const maxMembers = Number(dto.maxMembers ?? dto.max_members ?? options.defaultMaxMembers);
      data.maxMembers = Number.isFinite(maxMembers) && maxMembers > 0 ? maxMembers : options.defaultMaxMembers ?? 500;
    }
    if (dto.tags !== undefined || dto.tagsInput !== undefined) data.tags = this.normalizeTags(dto.tags ?? dto.tagsInput);
    if (dto.paidJoin !== undefined || dto.paid_join !== undefined) data.paidJoin = !!(dto.paidJoin ?? dto.paid_join);
    if (dto.price !== undefined) data.price = dto.price === '' || dto.price === null ? null : Number(dto.price);
    if (dto.inviteCode !== undefined || dto.invite_code !== undefined) {
      data.inviteCode = String(dto.inviteCode ?? dto.invite_code ?? '');
    }
    if (dto.deadline !== undefined) data.deadline = dto.deadline ? new Date(dto.deadline) : null;
    return data;
  }

  private async getRegionCircleSettings(regionId: string) {
    if (!regionId) return this.getCircleConfigDefaults();
    const region = await this.prisma.region.findUnique({
      where: { id: regionId },
      select: { settings: true },
    });
    const settings = (region?.settings || {}) as any;
    return this.normalizeCircleConfigPayload(settings.circleConfig || {}, regionId);
  }

  async getList(query: any) {
    const regionId = query.region_id || query.regionId;
    if (regionId) {
      return this.getByRegion(String(regionId), query);
    }

    const { page = 1, limit = 20, user_id, is_pinned, my_circles, hot_circles } = query;
    const pageNum = Number(page) || 1;
    const take = Number(limit) || 20;
    const userId = typeof user_id === 'string' && user_id.trim() ? user_id.trim() : '';
    const where: any = { status: 'active' };

    if (is_pinned) where.isOfficial = true;
    if (my_circles && userId) {
      where.members = { some: { userId, role: 'OWNER' } };
    } else if (userId) {
      where.members = { some: { userId } };
    }

    const [list, total] = await Promise.all([
      this.prisma.circle.findMany({
        where,
        skip: (pageNum - 1) * take,
        take,
        orderBy: hot_circles ? [{ isOfficial: 'desc' }, { memberCount: 'desc' }] : { createdAt: 'desc' },
        include: {
          members: {
            take: 8,
            orderBy: { joinAt: 'asc' },
            include: { user: { select: { id: true, nickname: true, avatar: true } } },
          },
          _count: { select: { members: true } },
        },
      }),
      this.prisma.circle.count({ where }),
    ]);
    const joinedCircleIds = userId ? new Set(list.map((circle) => circle.id)) : undefined;
    const data = list.map((circle) => this.toMiniCircle(circle, userId, joinedCircleIds));

    return {
      data,
      list: data,
      total,
      page: pageNum,
      limit: take,
      region_settings: {
        circle_default_layout: 'single',
        allow_user_create_circle: true,
      },
    };
  }

  async getByRegion(regionId: string, query: any) {
    const { page = 1, limit = 20, user_id, is_pinned, my_circles, hot_circles } = query;
    const pageNum = Number(page) || 1;
    const take = Number(limit) || 20;
    const userId = typeof user_id === 'string' && user_id.trim() ? user_id.trim() : '';
    const where: any = { regionId, status: 'active' };
    if (is_pinned) where.isOfficial = true;
    if (my_circles && userId) {
      where.members = { some: { userId, role: 'OWNER' } };
    } else if (userId) {
      where.members = { some: { userId } };
    }
    const [list, total, regionSettings] = await Promise.all([
      this.prisma.circle.findMany({
        where,
        skip: (pageNum - 1) * take,
        take,
        orderBy: hot_circles ? [{ isOfficial: 'desc' }, { memberCount: 'desc' }] : { createdAt: 'desc' },
        include: {
          members: {
            take: 8,
            orderBy: { joinAt: 'asc' },
            include: { user: { select: { id: true, nickname: true, avatar: true } } },
          },
          _count: { select: { members: true } },
        },
      }),
      this.prisma.circle.count({ where }),
      this.getRegionCircleSettings(regionId),
    ]);
    const joinedCircleIds = userId ? new Set(list.map((circle) => circle.id)) : undefined;
    const data = list.map((circle) => this.toMiniCircle(circle, userId, joinedCircleIds));
    return {
      data,
      list: data,
      total,
      page: pageNum,
      limit: take,
      region_settings: regionSettings,
    };
  }

  private toMiniCircle(circle: any, userId = '', joinedCircleIds?: Set<string>) {
    const members = Array.isArray(circle.members) ? circle.members : [];
    const ownerMember = members.find((member: any) => member.role === 'OWNER') || members[0];
    const memberCount = Number(circle.memberCount ?? circle._count?.members ?? members.length ?? 0);
    const postCount = Number(circle.postCount ?? 0);
    const logo = circle.icon || circle.cover || '/static/logo.jpg';
    const isJoined = !!userId && (joinedCircleIds?.has(circle.id) || members.some((member: any) => member.userId === userId));
    const isOwner = !!userId && members.some((member: any) => member.userId === userId && member.role === 'OWNER');

    return {
      id: circle.id,
      name: circle.name,
      logo,
      icon: circle.icon || logo,
      avatar: logo,
      cover: circle.cover || logo,
      background_image: circle.cover || logo,
      description: circle.description || '',
      announcement: circle.description || '',
      region_id: circle.regionId,
      regionId: circle.regionId,
      join_type: circle.joinType,
      joinType: circle.joinType,
      is_official: circle.isOfficial ? 1 : 0,
      is_pinned: circle.isOfficial ? 1 : 0,
      is_banned: circle.status === 'active' ? 0 : 1,
      status: circle.status === 'active' ? '活跃' : '已解散',
      stats: {
        member_count: memberCount,
        post_count: postCount,
      },
      member_count: memberCount,
      post_count: postCount,
      recent_members: members.map((member: any) => ({
        id: member.user?.id || member.userId,
        nickname: member.user?.nickname || '',
        avatar: member.user?.avatar || '/static/logo.jpg',
      })),
      owner: ownerMember
        ? {
            id: ownerMember.user?.id || ownerMember.userId,
            nickname: ownerMember.user?.nickname || '管理员',
            avatar: ownerMember.user?.avatar || '/static/logo.jpg',
          }
        : null,
      is_joined: isJoined,
      isJoined,
      joined: isJoined,
      is_owner: isOwner,
      isOwner,
      audit_info: null,
      tags: circle.tags || [],
      created_at: circle.createdAt,
      createdAt: circle.createdAt,
    };
  }

  async getDetail(circleId: string, query: any = {}) {
    const userId = typeof query.user_id === 'string' && query.user_id.trim() ? query.user_id.trim() : '';
    const [circle, membership] = await Promise.all([
      this.prisma.circle.findUnique({
        where: { id: circleId },
        include: {
          members: {
            take: 12,
            orderBy: { joinAt: 'asc' },
            include: { user: { select: { id: true, nickname: true, avatar: true } } },
          },
          channels: true,
          topicGroups: { include: { topic: true } },
          _count: { select: { members: true, channels: true } },
        },
      }),
      userId ? this.prisma.circleMember.findUnique({ where: { circleId_userId: { circleId, userId } } }) : null,
    ]);
    if (!circle) throw new NotFoundException('圈子不存在');
    const miniCircle = this.toMiniCircle(circle, userId, membership ? new Set([circleId]) : undefined);
    return {
      ...miniCircle,
      channels: circle.channels || [],
      topic_headers: (circle.topicGroups || []).map((group: any) => ({
        id: group.id,
        topic_id: group.topicId,
        topicId: group.topicId,
        name: group.topic?.name || '',
        title: group.topic?.name || '',
        sort_order: group.sortOrder,
        sortOrder: group.sortOrder,
      })),
      channel_count: circle._count?.channels || 0,
      raw_status: circle.status,
    };
  }

  async create(userId: string, dto: any) {
    const regionId = dto.regionId || dto.region_id || null;
    const config = regionId ? await this.getRegionCircleSettings(String(regionId)) : this.getCircleConfigDefaults();
    if (!config.enable_circle) throw new ForbiddenException('当前区域未开启圈子功能');
    if (!config.allow_user_create_circle) throw new ForbiddenException('当前区域暂不允许用户创建圈子');

    const ownedCount = regionId
      ? await this.prisma.circle.count({
          where: {
            regionId: String(regionId),
            members: { some: { userId, role: 'OWNER' } },
          },
        })
      : 0;
    if (ownedCount >= Number(config.max_circles_per_user || 0)) {
      throw new BadRequestException(`每个用户最多创建 ${config.max_circles_per_user} 个圈子`);
    }

    const name = String(dto.name || '').trim();
    if (!name) throw new BadRequestException('圈子名称不能为空');
    if (name.length < Number(config.circle_name_min_length || 1)) {
      throw new BadRequestException(`圈子名称不能少于 ${config.circle_name_min_length} 个字`);
    }
    if (name.length > Number(config.circle_name_max_length || 20)) {
      throw new BadRequestException(`圈子名称不能超过 ${config.circle_name_max_length} 个字`);
    }

    const joinTypeMap: Record<string, 'OPEN' | 'APPLY' | 'INVITE'> = {
      free: 'OPEN',
      open: 'OPEN',
      apply: 'APPLY',
      audit: 'APPLY',
      invite: 'INVITE',
    };
    const joinTypeRaw = String(dto.joinType || dto.join_type || config.default_join_method || 'free').toLowerCase();
    const joinType = joinTypeMap[joinTypeRaw] || 'OPEN';
    const paidJoin = !!(dto.paidJoin ?? dto.paid_join);
    const price = Number(dto.price ?? 0);
    if (paidJoin) {
      if (!config.allow_paid_circle) throw new BadRequestException('当前区域未开启付费圈子');
      if (price < Number(config.min_join_price) || price > Number(config.max_join_price)) {
        throw new BadRequestException(`圈子加入价格需在 ${config.min_join_price} 到 ${config.max_join_price} 之间`);
      }
    }

    const circle = await this.prisma.circle.create({
      data: {
        name,
        icon: dto.icon || '',
        cover: dto.cover || '',
        description: dto.description || '',
        regionId: regionId ? String(regionId) : null,
        joinType,
        maxMembers: Number(dto.maxMembers ?? dto.max_members ?? config.max_members_per_circle ?? 500),
        tags: dto.tags ?? [],
        paidJoin,
        price: paidJoin ? price : null,
        memberCount: 1,
      },
    });
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
    if (circle.regionId) {
      const region = await this.prisma.region.findUnique({
        where: { id: circle.regionId },
        select: { groupChatEnabled: true },
      });
      if (region && region.groupChatEnabled === false) {
        throw new ForbiddenException('当前区域未开启群聊功能');
      }
    }
    const conversation = await this.prisma.conversation.create({
      data: { type: 'circle', title: circleId, avatar: circle.cover || circle.icon || null },
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
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit || query.pageSize) || 50));
    const [list, total] = await Promise.all([
      this.prisma.circleMember.findMany({
        where: { circleId },
        include: { user: { select: { id: true, nickname: true, avatar: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ role: 'asc' }, { joinAt: 'desc' }],
      }),
      this.prisma.circleMember.count({ where: { circleId } }),
    ]);
    return { list, total, page, limit };
  }

  async join(circleId: string, userId: string) {
    if (!userId) throw new BadRequestException('用户身份缺失，请重新登录');
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle) throw new NotFoundException('圈子不存在');
    if (circle.status && circle.status !== 'active') throw new BadRequestException('圈子已停用，无法加入');
    if (circle.memberCount >= circle.maxMembers) throw new BadRequestException('圈子人数已满');
    const exists = await this.prisma.circleMember.findUnique({ where: { circleId_userId: { circleId, userId } } });
    if (exists) {
      return {
        success: true,
        joined: true,
        isMember: true,
        role: exists.role,
        message: '已在圈子中',
      };
    }
    if (circle.paidJoin) {
      throw new BadRequestException('该圈子需要付费加入，请先完成支付');
    }
    await this.prisma.circleMember.create({ data: { circleId, userId } });
    await this.prisma.circle.update({ where: { id: circleId }, data: { memberCount: { increment: 1 } } });
    return {
      success: true,
      joined: true,
      isMember: true,
      role: 'MEMBER',
      message: '加入成功',
    };
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
    return {
      joined: !!member,
      isMember: !!member,
      is_member: !!member,
      role: member?.role || null,
      member_id: member?.id || null,
      memberId: member?.id || null,
    };
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
    const regionId = query.region_id || query.regionId;
    const where: any = { status: 'active' };
    if (regionId) where.regionId = String(regionId);

    const circles = await this.prisma.circle.findMany({
      where,
      take: 100,
      orderBy: [{ memberCount: 'desc' }, { postCount: 'desc' }, { createdAt: 'desc' }],
      select: { name: true, tags: true, memberCount: true, postCount: true },
    });

    const weights = new Map<string, number>();
    for (const circle of circles) {
      const base = Number(circle.memberCount || 0) + Number(circle.postCount || 0);
      for (const tag of this.normalizeTags(circle.tags)) {
        weights.set(tag, (weights.get(tag) || 0) + 10 + base);
      }
      if (circle.name) {
        weights.set(circle.name, Math.max(weights.get(circle.name) || 0, 1 + base));
      }
    }

    return {
      keywords: Array.from(weights.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([keyword]) => keyword)
        .slice(0, 10),
    };
  }

  // ======================== Admin 方法 ========================

  async getAdminCircles(query: any) {
    const { page = 1, limit, pageSize, regionId, keyword, status, joinType } = query;
    const pageNum = Number(page) || 1;
    const take = Number(pageSize || limit || 20);
    const where: any = {};
    if (regionId) where.regionId = regionId;
    if (status) where.status = status;
    if (joinType) where.joinType = joinType;
    if (keyword) where.OR = [{ name: { contains: keyword } }, { description: { contains: keyword } }];

    const [list, total] = await Promise.all([
      this.prisma.circle.findMany({
        where,
        skip: (pageNum - 1) * take,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          region: { select: { id: true, name: true } },
          _count: { select: { members: true } },
        },
      }),
      this.prisma.circle.count({ where }),
    ]);
    return {
      list: list.map((c: any) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        cover: c.cover,
        description: c.description,
        regionId: c.regionId,
        regionName: c.region?.name || null,
        joinType: c.joinType,
        memberCount: c.memberCount,
        postCount: c.postCount,
        isOfficial: c.isOfficial,
        status: c.status,
        createdAt: c.createdAt,
      })),
      total,
      page: pageNum,
      pageSize: take,
    };
  }

  async getAdminCirclesStats() {
    const [total, active, dissolved, totalMembers, totalPosts] = await Promise.all([
      this.prisma.circle.count(),
      this.prisma.circle.count({ where: { status: 'active' } }),
      this.prisma.circle.count({ where: { status: 'dissolved' } }),
      this.prisma.circle.aggregate({ _sum: { memberCount: true } }),
      this.prisma.circle.aggregate({ _sum: { postCount: true } }),
    ]);
    return {
      total,
      active,
      dissolved,
      totalMembers: totalMembers._sum.memberCount || 0,
      totalPosts: totalPosts._sum.postCount || 0,
    };
  }

  async getAdminCircleDetail(circleId: string) {
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
      include: {
        region: { select: { id: true, name: true } },
        _count: { select: { members: true, channels: true } },
      },
    });
    if (!circle) throw new Error('圈子不存在');
    return {
      id: circle.id,
      name: circle.name,
      icon: circle.icon,
      cover: circle.cover,
      description: circle.description,
      regionId: circle.regionId,
      regionName: circle.region?.name || null,
      joinType: circle.joinType,
      memberCount: circle.memberCount,
      postCount: circle.postCount,
      maxMembers: circle.maxMembers,
      isOfficial: circle.isOfficial,
      status: circle.status,
      tags: circle.tags,
      price: circle.price,
      paidJoin: circle.paidJoin,
      inviteCode: circle.inviteCode,
      deadline: circle.deadline,
      createdAt: circle.createdAt,
      channelCount: circle._count.channels,
    };
  }

  async adminUpdateCircle(circleId: string, dto: any) {
    const data = this.buildCircleMutationData(dto);
    return this.prisma.circle.update({ where: { id: circleId }, data });
  }

  async adminDissolveCircle(circleId: string) {
    await this.prisma.circle.update({ where: { id: circleId }, data: { status: 'dissolved' } });
    return { success: true };
  }

  async getAdminCircleMembers(circleId: string, query: any) {
    const { page = 1, limit, pageSize } = query;
    const pageNum = Number(page) || 1;
    const take = Number(pageSize || limit || 50);
    const [list, total] = await Promise.all([
      this.prisma.circleMember.findMany({
        where: { circleId },
        include: { user: { select: { id: true, nickname: true, avatar: true, phone: true } } },
        skip: (pageNum - 1) * take,
        take,
        orderBy: { joinAt: 'desc' },
      }),
      this.prisma.circleMember.count({ where: { circleId } }),
    ]);
    return { list, total, page: pageNum, pageSize: take };
  }

  async adminRemoveMember(memberId: string) {
    const member = await this.prisma.circleMember.findUnique({ where: { id: memberId } });
    if (!member) throw new NotFoundException('成员不存在');
    if (member.role === 'OWNER') throw new BadRequestException('无法移除群主');
    await this.prisma.circleMember.delete({ where: { id: memberId } });
    await this.prisma.circle.update({ where: { id: member.circleId }, data: { memberCount: { decrement: 1 } } });
    return { success: true };
  }

  async getAdminCircleConfig(regionId: string) {
    regionId = await this.resolveAdminConfigRegionId(regionId);
    const region = await this.prisma.region.findUnique({ where: { id: regionId } });
    if (!region) throw new NotFoundException('区域不存在');
    const settings: any = region.settings || {};
    return {
      ...this.normalizeCircleConfigPayload(settings.circleConfig || {}, regionId),
      regionName: region.name,
    };
  }

  async updateAdminCircleConfig(regionId: string, dto: any) {
    regionId = await this.resolveAdminConfigRegionId(regionId);
    const region = await this.prisma.region.findUnique({ where: { id: regionId } });
    if (!region) throw new NotFoundException('区域不存在');
    const settings: any = region.settings || {};
    settings.circleConfig = this.normalizeCircleConfigPayload({ ...settings.circleConfig, ...dto }, regionId);
    await this.prisma.region.update({ where: { id: regionId }, data: { settings } });
    return { success: true, data: { ...settings.circleConfig, regionName: region.name } };
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
    const regionId = dto.regionId || dto.region_id;
    if (!regionId) throw new BadRequestException('请选择区域');
    const region = await this.prisma.region.findUnique({
      where: { id: String(regionId) },
      select: { id: true, settings: true },
    });
    if (!region) throw new NotFoundException('区域不存在');

    const config = this.normalizeCircleConfigPayload((region.settings as any)?.circleConfig || {}, region.id);
    const maxMembers = Number(dto.maxMembers ?? dto.max_members ?? config.max_members_per_circle ?? 500);
    const data: any = {
      ...this.buildCircleMutationData(
        { ...dto, joinType: dto.joinType || dto.join_type || config.default_join_method },
        {
          requireName: true,
          regionId: region.id,
          defaultMaxMembers: Number.isFinite(maxMembers) ? maxMembers : Number(config.max_members_per_circle || 500),
        },
      ),
      memberCount: 0,
      postCount: 0,
    };
    if (!data.status) data.status = 'active';
    return this.prisma.circle.create({ data });
  }

  // ======================== Admin 删除社群 ========================

  async adminDeleteCircle(circleId: string) {
    await this.prisma.circle.delete({ where: { id: circleId } });
    return { success: true };
  }
}
