import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AdminDataScopeService } from '../../common/services/admin-data-scope.service';
import { UserAccessPolicyService } from '../../common/services/user-access-policy.service';

@Injectable()
export class CircleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminDataScope: AdminDataScopeService,
    private readonly userAccess: UserAccessPolicyService,
  ) {}

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

  private async resolveAdminConfigRegionId(regionId?: string, operatorId?: string) {
    const scopedRegionId = await this.adminDataScope.resolveRegionId(operatorId, regionId);
    if (scopedRegionId) return scopedRegionId;
    if (operatorId && !regionId) {
      const scope = await this.adminDataScope.getAdminContext(operatorId);
      if (!scope.isSuperAdmin) throw new BadRequestException('请选择要配置的区域');
    }
    const region = await this.prisma.region.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!region) throw new BadRequestException('暂无区域，请先创建区域');
    return region.id;
  }

  private async getAdminCircleForScope(circleId: string, operatorId?: string) {
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
      select: { id: true, name: true, regionId: true, status: true },
    });
    if (!circle) throw new NotFoundException('圈子不存在');
    await this.adminDataScope.assertRegionAccess(operatorId, circle.regionId);
    return circle;
  }

  private async logAdminCircleOperation(
    operatorId: string | undefined,
    action: string,
    circle: { id: string; name?: string | null; regionId?: string | null },
    detail: any = {},
    ip?: string,
  ) {
    if (!operatorId) return;
    try {
      await this.prisma.adminOperationLog.create({
        data: {
          accountId: operatorId,
          action,
          module: 'circle',
          targetId: circle.id,
          targetType: 'circle',
          detail: {
            regionId: circle.regionId || null,
            circleName: circle.name || '',
            ...detail,
          },
          ip: ip || null,
        },
      });
    } catch {
      // 操作日志失败不影响主流程。
    }
  }

  private normalizeTopicHeader(header: any) {
    const topics = (header.topics || header.topicGroups || []).map((item: any) => {
      const group = item.topic ? item : { ...item, topic: item };
      const topic = group.topic || {};
      return {
        id: topic.id || group.topicId || group.id,
        topic_id: topic.id || group.topicId || group.id,
        topicId: topic.id || group.topicId || group.id,
        header_id: header.id,
        headerId: header.id,
        bind_id: group.id,
        bindId: group.id,
        name: topic.name || group.name || group.title || '',
        title: topic.name || group.name || group.title || '',
        logo: topic.cover || group.logo || group.icon || '',
        cover: topic.cover || group.logo || group.icon || '',
        description: topic.description || group.description || '',
        post_count: Number(topic.postCount || group.post_count || 0),
        postCount: Number(topic.postCount || group.post_count || 0),
        sort_order: Number(group.sortOrder ?? group.sort_order ?? 0),
        sortOrder: Number(group.sortOrder ?? group.sort_order ?? 0),
        status: topic.status || group.status || 'active',
      };
    });
    topics.sort((a: any, b: any) => a.sort_order - b.sort_order);
    return {
      id: header.id,
      title: header.title || header.name || '',
      name: header.title || header.name || '',
      description: header.description || '',
      sort_order: Number(header.sortOrder ?? header.sort_order ?? 0),
      sortOrder: Number(header.sortOrder ?? header.sort_order ?? 0),
      is_active: header.isActive === false ? 0 : 1,
      isActive: header.isActive !== false,
      topics,
    };
  }

  private async ensureDefaultTopicHeaders(circleId: string, regionId?: string | null) {
    const existing = await this.prisma.circleTopicHeader.count({ where: { circleId } });
    if (existing > 0) return;
    const config = await this.getRegionCircleSettings(regionId || '');
    const names = Array.isArray(config.default_topic_header_names)
      ? config.default_topic_header_names
      : ['公告', '交流', '问答'];
    const uniqueNames = names.map((item: any) => String(item || '').trim()).filter(Boolean);
    if (!uniqueNames.length) return;
    await this.prisma.circleTopicHeader.createMany({
      data: uniqueNames.slice(0, Number(config.max_topic_headers || 5)).map((title: string, index: number) => ({
        circleId,
        title,
        sortOrder: index + 1,
      })),
      skipDuplicates: true,
    });
  }

  private async assertCircleTopicManager(circleId: string, userId?: string) {
    if (!userId) throw new ForbiddenException('请先登录');
    const member = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId } },
      select: { role: true, status: true },
    });
    if (!member || !this.isReadableMemberStatus(member.status) || !['OWNER', 'ADMIN'].includes(member.role)) {
      throw new ForbiddenException('只有圈主或管理员可以管理话题');
    }
    return member;
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
    const raw = String(value || 'OPEN').trim();
    const joinTypeMap: Record<string, 'OPEN' | 'APPLY' | 'INVITE'> = {
      free: 'OPEN',
      open: 'OPEN',
      normal: 'OPEN',
      OPEN: 'OPEN',
      apply: 'APPLY',
      approval: 'APPLY',
      audit: 'APPLY',
      APPLY: 'APPLY',
      invite: 'INVITE',
      invite_only: 'INVITE',
      closed: 'INVITE',
      close: 'INVITE',
      INVITE: 'INVITE',
    };
    return joinTypeMap[raw] || joinTypeMap[raw.toLowerCase()] || 'OPEN';
  }

  private normalizeCircleStatus(value: any, fallback: 'active' | 'pending' | 'disabled' | 'dissolved' = 'active') {
    const raw = String(value || '').trim();
    const normalized = raw.toLowerCase();
    const statusMap: Record<string, 'active' | 'pending' | 'disabled' | 'dissolved'> = {
      active: 'active',
      open: 'active',
      normal: 'active',
      enabled: 'active',
      '活跃': 'active',
      '正常': 'active',
      '正常开放': 'active',
      pending: 'pending',
      review: 'pending',
      auditing: 'pending',
      '待审核': 'pending',
      disabled: 'disabled',
      inactive: 'disabled',
      off: 'disabled',
      closed: 'disabled',
      banned: 'disabled',
      '不活跃': 'disabled',
      '已禁用': 'disabled',
      '封禁': 'disabled',
      dissolved: 'dissolved',
      deleted: 'dissolved',
      '解散': 'dissolved',
      '已解散': 'dissolved',
    };
    return statusMap[raw] || statusMap[normalized] || fallback;
  }

  private activeCircleStatusWhere() {
    return { in: ['active', '活跃', '正常', '正常开放'] };
  }

  private isAuditEnabled(value: any) {
    const normalized = String(value || '').trim().toLowerCase();
    return !['', 'none', 'auto', 'off', 'close', 'closed', 'disabled', 'direct', 'approve'].includes(normalized);
  }

  private isTruthyFlag(value: any) {
    if (value === true || value === 1) return true;
    return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
  }

  private isReadableMemberStatus(status: any) {
    return ['active', 'muted'].includes(String(status || 'active'));
  }

  private isMuted(member: any) {
    return member?.status === 'muted' && member?.muteEndAt && new Date(member.muteEndAt).getTime() > Date.now();
  }

  private toPublicUser(user: any) {
    if (!user) return null;
    return {
      id: user.id,
      userId: user.id,
      uid: user.uid,
      nickname: user.nickname || '灵萌用户',
      avatar: user.avatar || '',
      phone: user.phone || '',
      status: user.status,
    };
  }

  private getCircleOwnerMember(circle: any) {
    const members = Array.isArray(circle?.members) ? circle.members : [];
    return members.find((member: any) => member.role === 'OWNER') || members[0] || null;
  }

  private memberStatusText(status: any) {
    const map: Record<string, string> = {
      pending: '待审核',
      active: '正常',
      muted: '已禁言',
      banned: '已拉黑',
      rejected: '已拒绝',
    };
    return map[String(status || 'active')] || '正常';
  }

  private circleAuditText(status: any) {
    const map: Record<string, string> = {
      pending: '待审核',
      approved: '已通过',
      rejected: '已拒绝',
    };
    return map[String(status || 'approved')] || '已通过';
  }

  private circleStatusText(status: any) {
    const rawStatus = this.normalizeCircleStatus(status, 'disabled');
    const map: Record<string, string> = {
      active: '已开放',
      pending: '审核中',
      disabled: '已封禁',
      dissolved: '已解散',
    };
    return map[rawStatus] || '已封禁';
  }

  private resolveCircleListStatus(rawStatus: any, auditStatus: any, auditReason?: string | null) {
    const normalizedStatus = this.normalizeCircleStatus(rawStatus, 'disabled');
    const normalizedAuditStatus = String(auditStatus || 'approved').trim().toLowerCase();
    const reason = String(auditReason || '').trim();

    if (normalizedStatus === 'pending' || normalizedAuditStatus === 'pending') {
      return { status: 'pending', text: '审核中', reason: reason || '等待运营者审核' };
    }
    if (normalizedAuditStatus === 'rejected') {
      return { status: 'rejected', text: '审核被拒', reason: reason || '运营审核未通过' };
    }
    if (normalizedStatus === 'disabled') {
      return { status: 'disabled', text: '已封禁', reason: reason || '圈子已被平台封禁' };
    }
    if (normalizedStatus === 'dissolved') {
      return { status: 'dissolved', text: '已解散', reason: reason || '圈子已解散' };
    }
    return { status: 'approved', text: '已通过', reason };
  }

  private getMuteEndAt(days: any) {
    const normalizedDays = Math.max(1, Math.min(365, Math.floor(Number(days) || 7)));
    return new Date(Date.now() + normalizedDays * 24 * 60 * 60 * 1000);
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
    if (dto.joinType !== undefined || dto.join_type !== undefined || dto.joinPermission !== undefined || dto.join_permission !== undefined) {
      data.joinType = this.normalizeJoinType(dto.joinType ?? dto.join_type ?? dto.joinPermission ?? dto.join_permission);
    }
    if (dto.isOfficial !== undefined || dto.is_pinned !== undefined) data.isOfficial = !!(dto.isOfficial ?? dto.is_pinned);
    if (dto.status !== undefined || dto.is_banned !== undefined) {
      data.status = Number(dto.is_banned || 0) === 1
        ? 'disabled'
        : this.normalizeCircleStatus(dto.status, 'active');
    }
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
    if (dto.ownerUserId !== undefined || dto.owner_user_id !== undefined) {
      const ownerUserId = String(dto.ownerUserId ?? dto.owner_user_id ?? '').trim();
      data.ownerUserId = ownerUserId || null;
    }
    if (dto.auditStatus !== undefined || dto.audit_status !== undefined) {
      data.auditStatus = String(dto.auditStatus ?? dto.audit_status ?? 'approved');
    }
    if (dto.auditReason !== undefined || dto.audit_reason !== undefined) {
      data.auditReason = String(dto.auditReason ?? dto.audit_reason ?? '');
    }
    if (dto.announcement !== undefined) data.announcement = String(dto.announcement || '');
    if (dto.rules !== undefined) data.rules = String(dto.rules || '');
    if (dto.riskScore !== undefined || dto.risk_score !== undefined) {
      const riskScore = Number(dto.riskScore ?? dto.risk_score);
      data.riskScore = Number.isFinite(riskScore) ? Math.max(0, Math.min(100, Math.round(riskScore))) : 0;
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
    const isOwnerList = this.isTruthyFlag(my_circles) && !!userId;
    const where: any = isOwnerList ? {} : { status: this.activeCircleStatusWhere(), auditStatus: 'approved' };

    if (is_pinned) where.isOfficial = true;
    if (isOwnerList) {
      where.OR = [
        { ownerUserId: userId },
        { members: { some: { userId, role: 'OWNER', status: { in: ['active', 'muted'] } } } },
      ];
    } else if (userId) {
      where.members = { some: { userId, status: { in: ['active', 'muted'] } } };
    }

    const [list, total] = await Promise.all([
      this.prisma.circle.findMany({
        where,
        skip: (pageNum - 1) * take,
        take,
        orderBy: hot_circles ? [{ isOfficial: 'desc' }, { memberCount: 'desc' }] : { createdAt: 'desc' },
        include: {
          members: {
            where: { status: { in: ['active', 'muted'] } },
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
    const isOwnerList = this.isTruthyFlag(my_circles) && !!userId;
    const where: any = isOwnerList ? { regionId } : { regionId, status: this.activeCircleStatusWhere(), auditStatus: 'approved' };
    if (is_pinned) where.isOfficial = true;
    if (isOwnerList) {
      where.OR = [
        { ownerUserId: userId },
        { members: { some: { userId, role: 'OWNER', status: { in: ['active', 'muted'] } } } },
      ];
    } else if (userId) {
      where.members = { some: { userId, status: { in: ['active', 'muted'] } } };
    }
    const [list, total, regionSettings] = await Promise.all([
      this.prisma.circle.findMany({
        where,
        skip: (pageNum - 1) * take,
        take,
        orderBy: hot_circles ? [{ isOfficial: 'desc' }, { memberCount: 'desc' }] : { createdAt: 'desc' },
        include: {
          members: {
            where: { status: { in: ['active', 'muted'] } },
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
    const members = (Array.isArray(circle.members) ? circle.members : []).filter((member: any) => this.isReadableMemberStatus(member.status));
    const ownerMember = this.getCircleOwnerMember(circle);
    const rawStatus = this.normalizeCircleStatus(circle.status, 'disabled');
    const memberCount = Number(circle.memberCount ?? circle._count?.members ?? members.length ?? 0);
    const postCount = Number(circle.postCount ?? 0);
    const logo = circle.icon || circle.cover || '/static/logo.jpg';
    const currentMember = userId ? members.find((member: any) => member.userId === userId) : null;
    const isJoined = !!userId && (joinedCircleIds?.has(circle.id) || !!currentMember);
    const isOwner = !!userId && (currentMember?.role === 'OWNER' || String(circle.ownerUserId || '') === String(userId));
    const canViewAuditStatus = isOwner;
    const auditInfo = this.resolveCircleListStatus(rawStatus, circle.auditStatus, circle.auditReason);
    const joinPermissionMap: Record<string, string> = {
      OPEN: 'open',
      APPLY: 'audit',
      INVITE: 'closed',
    };
    const joinPermission = joinPermissionMap[String(circle.joinType || 'OPEN')] || 'open';
    const owner = ownerMember
      ? {
          id: ownerMember.user?.id || ownerMember.userId,
          user_id: ownerMember.user?.id || ownerMember.userId,
          userId: ownerMember.user?.id || ownerMember.userId,
          nickname: ownerMember.user?.nickname || '圈主',
          avatar: ownerMember.user?.avatar || '/static/logo.jpg',
        }
      : null;

    return {
      id: circle.id,
      name: circle.name,
      logo,
      icon: circle.icon || logo,
      avatar: logo,
      cover: circle.cover || logo,
      background_image: circle.cover || logo,
      description: circle.description || '',
      announcement: circle.announcement || circle.description || '',
      rules: circle.rules || '',
      region_id: circle.regionId,
      regionId: circle.regionId,
      join_type: circle.joinType,
      joinType: circle.joinType,
      join_permission: joinPermission,
      joinPermission,
      is_official: circle.isOfficial ? 1 : 0,
      is_pinned: circle.isOfficial ? 1 : 0,
      is_banned: rawStatus === 'active' ? 0 : 1,
      status: rawStatus === 'active' ? '活跃' : rawStatus === 'pending' ? '待审核' : rawStatus === 'disabled' ? '已封禁' : '已解散',
      status_text: this.circleStatusText(rawStatus),
      statusText: this.circleStatusText(rawStatus),
      circle_status_text: this.circleStatusText(rawStatus),
      raw_status: rawStatus,
      owner_id: owner?.id || null,
      owner_user_id: owner?.id || null,
      ownerUserId: owner?.id || null,
      audit_status: canViewAuditStatus ? circle.auditStatus || 'approved' : '',
      auditStatus: canViewAuditStatus ? circle.auditStatus || 'approved' : '',
      audit_status_text: canViewAuditStatus ? this.circleAuditText(circle.auditStatus) : '',
      audit_reason: canViewAuditStatus ? circle.auditReason || '' : '',
      auditReason: canViewAuditStatus ? circle.auditReason || '' : '',
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
      owner,
      owner_info: owner,
      ownerInfo: owner,
      is_joined: isJoined,
      isJoined,
      joined: isJoined,
      is_owner: isOwner,
      isOwner,
      member_status: currentMember?.status || null,
      member_status_text: currentMember ? this.memberStatusText(currentMember.status) : '',
      audit_info: canViewAuditStatus ? auditInfo : null,
      tags: circle.tags || [],
      last_active_at: circle.lastActiveAt,
      created_at: circle.createdAt,
      createdAt: circle.createdAt,
    };
  }

  async getMyManagedCircles(userId: string, query: any = {}) {
    if (!userId) throw new BadRequestException('用户身份缺失，请重新登录');
    const regionId = String(query.region_id || query.regionId || '').trim();
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit || query.pageSize) || 20));
    const where: any = {
      status: { not: 'dissolved' },
      members: {
        some: {
          userId,
          role: 'OWNER',
          status: { in: ['active', 'muted'] },
        },
      },
    };
    if (regionId) where.regionId = regionId;

    const [list, total] = await Promise.all([
      this.prisma.circle.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          members: {
            where: { role: 'OWNER' },
            take: 1,
            include: { user: { select: { id: true, nickname: true, avatar: true } } },
          },
          _count: { select: { members: true } },
        },
      }),
      this.prisma.circle.count({ where }),
    ]);
    const data = list.map((circle) => this.toMiniCircle(circle, userId, new Set([circle.id])));
    return {
      success: true,
      data,
      list: data,
      total,
      page,
      limit,
      has_manage_permission: total > 0,
      hasManagePermission: total > 0,
    };
  }

  async getDetail(circleId: string, query: any = {}) {
    const userId = typeof query.user_id === 'string' && query.user_id.trim() ? query.user_id.trim() : '';
    const [circle, membership] = await Promise.all([
      this.prisma.circle.findUnique({
        where: { id: circleId },
        include: {
          members: {
            where: { status: { in: ['active', 'muted'] } },
            take: 12,
            orderBy: { joinAt: 'asc' },
            include: { user: { select: { id: true, nickname: true, avatar: true } } },
          },
          channels: true,
          topicHeaders: {
            include: { topics: { include: { topic: true } } },
            orderBy: { sortOrder: 'asc' },
          },
          _count: { select: { members: true, channels: true } },
        },
      }),
      userId ? this.prisma.circleMember.findUnique({ where: { circleId_userId: { circleId, userId } } }) : null,
    ]);
    if (!circle) throw new NotFoundException('圈子不存在');
    // AUD-P1-028: 已解散圈子公开详情返回404
    if (circle.status === 'dissolved' && !query.user_id && !query.userId) {
      throw new NotFoundException('圈子不存在');
    }
    const miniCircle = this.toMiniCircle(circle, userId, membership ? new Set([circleId]) : undefined);
    return {
      ...miniCircle,
      channels: circle.channels || [],
      topic_headers: (circle.topicHeaders || []).map((header: any) => this.normalizeTopicHeader(header)),
      topicHeaders: (circle.topicHeaders || []).map((header: any) => this.normalizeTopicHeader(header)),
      channel_count: circle._count?.channels || 0,
      raw_status: circle.status,
      current_member: membership
        ? {
            id: membership.id,
            role: membership.role,
            status: membership.status,
            status_text: this.memberStatusText(membership.status),
            mute_end_at: membership.muteEndAt,
            mute_reason: membership.muteReason,
          }
        : null,
    };
  }

  async create(userId: string, dto: any) {
    const regionId = dto.regionId || dto.region_id || null;
    await this.userAccess.assertStudentProtectedAction(userId, regionId, '创建圈子');
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
      approval: 'APPLY',  // AUD-P1-097: 支持后台配置的 approval 值
      audit: 'APPLY',
      invite: 'INVITE',
    };
    const joinTypeRaw = String(dto.joinType || dto.join_type || config.default_join_method || 'free').toLowerCase();
    const joinType = joinTypeMap[joinTypeRaw] || 'OPEN';
    const paidJoin = !!(dto.paidJoin ?? dto.paid_join) || joinTypeRaw === 'paid';  // AUD-P1-097: 支持默认付费配置
    const price = Number(dto.price ?? 0);
    if (paidJoin) {
      if (!config.allow_paid_circle) throw new BadRequestException('当前区域未开启付费圈子');
      if (price < Number(config.min_join_price) || price > Number(config.max_join_price)) {
        throw new BadRequestException(`圈子加入价格需在 ${config.min_join_price} 到 ${config.max_join_price} 之间`);
      }
    }
    const needsAudit = this.isAuditEnabled(config.create_audit_type || config.circle_audit_type || 'manual');

    const circle = await this.prisma.circle.create({
      data: {
        name,
        icon: dto.icon || '',
        cover: dto.cover || '',
        description: dto.description || '',
        announcement: dto.announcement || '',
        rules: dto.rules || '',
        regionId: regionId ? String(regionId) : null,
        ownerUserId: userId,
        joinType,
        maxMembers: Number(dto.maxMembers ?? dto.max_members ?? config.max_members_per_circle ?? 500),
        tags: dto.tags ?? [],
        paidJoin,
        price: paidJoin ? price : null,
        memberCount: 1,
        status: needsAudit ? 'pending' : 'active',
        auditStatus: needsAudit ? 'pending' : 'approved',
        auditReason: needsAudit ? '等待运营者审核' : '',
      },
    });
    await this.prisma.circleMember.create({ data: { circleId: circle.id, userId, role: 'OWNER', status: 'active' } });
    await this.ensureDefaultTopicHeaders(circle.id, circle.regionId);
    return {
      ...circle,
      need_audit: needsAudit,
      message: needsAudit ? '圈子已提交，等待运营者审核' : '圈子创建成功',
    };
  }

  async update(circleId: string, userId: string, dto: any) {
    const member = await this.prisma.circleMember.findUnique({ where: { circleId_userId: { circleId, userId } } });
    if (!member || !this.isReadableMemberStatus(member.status) || (member.role !== 'OWNER' && member.role !== 'ADMIN')) {
      throw new ForbiddenException('无权操作');
    }
    return this.prisma.circle.update({ where: { id: circleId }, data: this.buildCircleMutationData(dto) });
  }

  async inviteMember(circleId: string, userId: string, dto: any) {
    const { inviteeId } = dto;
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId }, select: { id: true, regionId: true } });
    if (!circle) throw new NotFoundException('圈子不存在');
    await this.userAccess.assertStudentProtectedAction(userId, circle.regionId, '邀请圈子成员');
    const operator = await this.prisma.circleMember.findUnique({ where: { circleId_userId: { circleId, userId } } });
    if (!operator || !this.isReadableMemberStatus(operator.status) || !['OWNER', 'ADMIN'].includes(operator.role)) {
      throw new ForbiddenException('无权邀请成员');
    }
    const exists = await this.prisma.circleMember.findUnique({ where: { circleId_userId: { circleId, userId: inviteeId } } });
    if (exists) throw new BadRequestException('该用户已在圈子中');
    await this.prisma.circleMember.create({ data: { circleId, userId: inviteeId, role: 'MEMBER', status: 'active', operatorId: userId } });
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
    await this.userAccess.assertStudentProtectedAction(userId, circle.regionId, '创建圈子群聊');
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
    for (const member of circle.members.filter((item: any) => this.isReadableMemberStatus(item.status))) {
      await this.prisma.conversationMember.create({
        data: { conversationId: conversation.id, userId: member.userId },
      });
    }
    return conversation;
  }

  async getPendingMembers(circleId: string, query: any, userId?: string) {
    if (userId) {
      const operator = await this.prisma.circleMember.findUnique({ where: { circleId_userId: { circleId, userId } } });
      if (!operator || !this.isReadableMemberStatus(operator.status) || !['OWNER', 'ADMIN'].includes(operator.role)) {
        throw new ForbiddenException('无权查看加入申请');
      }
    }
    const { page = 1, limit = 50 } = query;
    const pageNum = Number(page) || 1;
    const take = Number(limit) || 50;
    const list = await this.prisma.circleMember.findMany({
      where: { circleId, status: 'pending' },
      include: { user: { select: { id: true, nickname: true, avatar: true } } },
      skip: (pageNum - 1) * take,
      take,
      orderBy: { joinAt: 'desc' },
    });
    return list.map((item: any) => ({
      ...item,
      user_id: item.userId,
      status_text: this.memberStatusText(item.status),
    }));
  }

  async auditMember(circleId: string, memberOrUserId: string, userId: string, dto: any) {
    const { status } = dto;
    const operator = await this.prisma.circleMember.findUnique({ where: { circleId_userId: { circleId, userId } } });
    if (!operator || !this.isReadableMemberStatus(operator.status) || !['OWNER', 'ADMIN'].includes(operator.role)) {
      throw new ForbiddenException('无权审核加入申请');
    }
    const member = await this.prisma.circleMember.findFirst({
      where: {
        circleId,
        OR: [{ id: memberOrUserId }, { userId: memberOrUserId }],
      },
    });
    if (!member || member.circleId !== circleId) throw new NotFoundException('成员不存在');
    if (status === 'approved') {
      await this.prisma.circleMember.update({
        where: { id: member.id },
        data: { role: 'MEMBER', status: 'active', auditedAt: new Date(), auditReason: dto.reason || '', operatorId: userId },
      });
      if (member.status === 'pending') {
        await this.prisma.circle.update({ where: { id: circleId }, data: { memberCount: { increment: 1 } } });
      }
    } else {
      await this.prisma.circleMember.delete({ where: { id: member.id } });
      if (this.isReadableMemberStatus(member.status)) {
        await this.prisma.circle.updateMany({ where: { id: circleId, memberCount: { gt: 0 } }, data: { memberCount: { decrement: 1 } } });
      }
    }
    return { success: true };
  }

  async getMembers(circleId: string, query: any) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit || query.pageSize) || 50));
    const [list, total] = await Promise.all([
      this.prisma.circleMember.findMany({
        where: { circleId, status: { in: ['active', 'muted'] } },
        include: { user: { select: { id: true, nickname: true, avatar: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ role: 'asc' }, { joinAt: 'desc' }],
      }),
      this.prisma.circleMember.count({ where: { circleId, status: { in: ['active', 'muted'] } } }),
    ]);
    return { list, total, page, limit };
  }

  async join(circleId: string, userId: string) {
    if (!userId) throw new BadRequestException('用户身份缺失，请重新登录');
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle) throw new NotFoundException('圈子不存在');
    await this.userAccess.assertStudentProtectedAction(userId, circle.regionId, '加入圈子');
    if (circle.status && this.normalizeCircleStatus(circle.status, 'disabled') !== 'active') throw new BadRequestException('圈子未开放，无法加入');
    if (circle.auditStatus && circle.auditStatus !== 'approved') throw new BadRequestException('圈子还未通过审核，暂不能加入');
    if (circle.memberCount >= circle.maxMembers) throw new BadRequestException('圈子人数已满');
    const exists = await this.prisma.circleMember.findUnique({ where: { circleId_userId: { circleId, userId } } });
    if (exists) {
      if (exists.status === 'pending') {
        return {
          success: true,
          joined: false,
          isMember: false,
          pending: true,
          role: exists.role,
          status: exists.status,
          message: '加入申请已提交，等待圈主审核',
        };
      }
      if (exists.status === 'banned') {
        throw new ForbiddenException('你已被移出该圈子，暂不能重新加入');
      }
      return {
        success: true,
        joined: this.isReadableMemberStatus(exists.status),
        isMember: this.isReadableMemberStatus(exists.status),
        role: exists.role,
        status: exists.status,
        message: '已在圈子中',
      };
    }
    if (circle.paidJoin) {
      throw new BadRequestException('该圈子需要付费加入，请先完成支付');
    }
    if (circle.joinType === 'INVITE') {
      throw new BadRequestException('该圈子为邀请制，请联系圈主邀请加入');
    }
    const needApproval = circle.joinType === 'APPLY';
    await this.prisma.circleMember.create({ data: { circleId, userId, status: needApproval ? 'pending' : 'active' } });
    if (!needApproval) {
      await this.prisma.circle.update({ where: { id: circleId }, data: { memberCount: { increment: 1 } } });
    }
    return {
      success: true,
      joined: !needApproval,
      isMember: !needApproval,
      pending: needApproval,
      role: 'MEMBER',
      status: needApproval ? 'pending' : 'active',
      message: needApproval ? '加入申请已提交，等待圈主审核' : '加入成功',
    };
  }

  async leave(circleId: string, targetUserId: string, userId: string) {
    const member = await this.prisma.circleMember.findUnique({ where: { circleId_userId: { circleId, userId: targetUserId } } });
    if (!member) throw new NotFoundException('不在该圈子中');
    if (member.role === 'OWNER') throw new ForbiddenException('群主不能退出');
    await this.prisma.circleMember.delete({ where: { id: member.id } });
    if (this.isReadableMemberStatus(member.status)) {
      await this.prisma.circle.updateMany({ where: { id: circleId, memberCount: { gt: 0 } }, data: { memberCount: { decrement: 1 } } });
    }
    return { success: true };
  }

  async checkMember(circleId: string, userId: string) {
    const member = await this.prisma.circleMember.findUnique({ where: { circleId_userId: { circleId, userId } } });
    const isMember = !!member && this.isReadableMemberStatus(member.status);
    return {
      joined: isMember,
      isMember,
      is_member: isMember,
      pending: member?.status === 'pending',
      is_pending: member?.status === 'pending',
      role: member?.role || null,
      status: member?.status || null,
      status_text: member ? this.memberStatusText(member.status) : '',
      member_id: member?.id || null,
      memberId: member?.id || null,
    };
  }

  async getTopicHeaders(circleId: string, includeTopics: string) {
    await this.ensureDefaultTopicHeaders(circleId);
    const withTopics = String(includeTopics || 'true') !== 'false';
    const headers = await this.prisma.circleTopicHeader.findMany({
      where: { circleId },
      include: withTopics ? { topics: { include: { topic: true } } } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const data = headers.map((header: any) => this.normalizeTopicHeader(header));
    return { success: true, data, list: data };
  }

  async createCircleTopic(circleId: string, userId: string, dto: any, options: { skipPermission?: boolean } = {}) {
    if (!options.skipPermission) await this.assertCircleTopicManager(circleId, userId);
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId }, select: { id: true, regionId: true, icon: true } });
    if (!circle) throw new NotFoundException('圈子不存在');
    await this.userAccess.assertStudentProtectedAction(userId, circle.regionId, '创建圈子话题');
    await this.ensureDefaultTopicHeaders(circleId, circle.regionId);
    const topicName = String(dto?.title || dto?.name || '').trim();
    if (!topicName) throw new BadRequestException('请输入话题名称');

    const config = await this.getRegionCircleSettings(circle.regionId || '');
    const maxTopics = Number(config.max_topics_per_header || 20);
    let headerId = String(dto?.headerId || dto?.header_id || '').trim();
    let header = headerId
      ? await this.prisma.circleTopicHeader.findFirst({ where: { id: headerId, circleId } })
      : null;
    if (!header) {
      header = await this.prisma.circleTopicHeader.findFirst({
        where: { circleId, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      headerId = header?.id || '';
    }
    if (!header || !headerId) throw new BadRequestException('请先创建话题分栏');

    const existingCount = await this.prisma.circleTopicGroup.count({ where: { circleId, headerId } });
    const existingGroup = await this.prisma.circleTopicGroup.findFirst({
      where: { circleId, topic: { name: topicName } },
      include: { topic: true },
    });
    if (!existingGroup && existingCount >= maxTopics) {
      throw new BadRequestException(`每个分栏最多可添加${maxTopics}个话题`);
    }

    const topic = await this.prisma.$transaction(async (tx) => {
      const item = await tx.topic.upsert({
        where: { name: topicName },
        create: {
          name: topicName,
          description: dto?.description || null,
          cover: dto?.logo || dto?.icon || dto?.cover || circle.icon || null,
          status: 'active',
        },
        update: {
          description: dto?.description || undefined,
          cover: dto?.logo || dto?.icon || dto?.cover || undefined,
          status: 'active',
        },
      });
      await tx.circleTopicGroup.upsert({
        where: { circleId_topicId: { circleId, topicId: item.id } },
        create: {
          circleId,
          headerId,
          topicId: item.id,
          sortOrder: Number(dto?.sortOrder ?? dto?.sort_order ?? existingCount + 1),
        },
        update: {
          headerId,
          sortOrder: Number(dto?.sortOrder ?? dto?.sort_order ?? existingGroup?.sortOrder ?? existingCount + 1),
        },
      });
      return item;
    });
    const data = {
      id: topic.id,
      topic_id: topic.id,
      topicId: topic.id,
      header_id: headerId,
      headerId,
      name: topic.name,
      title: topic.name,
      logo: topic.cover || circle.icon || '',
      cover: topic.cover || circle.icon || '',
      description: topic.description || '',
      post_count: Number(topic.postCount || 0),
      postCount: Number(topic.postCount || 0),
      status: topic.status,
    };
    return { success: true, data, topic: data };
  }

  async batchCreateTopicHeaders(circleId: string, userId: string, dto: any, options: { skipPermission?: boolean } = {}) {
    if (!options.skipPermission) await this.assertCircleTopicManager(circleId, userId);
    const headers = Array.isArray(dto?.headers) ? dto.headers : Array.isArray(dto?.items) ? dto.items : [];
    if (!headers.length) throw new BadRequestException('请至少添加一个话题分栏');
    const circle = await this.prisma.circle.findUnique({ where: { id: circleId }, select: { id: true, regionId: true } });
    if (!circle) throw new NotFoundException('圈子不存在');
    const config = await this.getRegionCircleSettings(circle.regionId || '');
    const maxHeaders = Number(config.max_topic_headers || 5);
    const maxTopics = Number(config.max_topics_per_header || 20);

    await this.prisma.$transaction(async (tx) => {
      for (const [headerIndex, rawHeader] of headers.slice(0, maxHeaders).entries()) {
        const title = String(rawHeader.title || rawHeader.name || '').trim();
        if (!title) continue;
        const header = await tx.circleTopicHeader.upsert({
          where: { circleId_title: { circleId, title } },
          create: {
            circleId,
            title,
            description: rawHeader.description || null,
            sortOrder: Number(rawHeader.sortOrder ?? rawHeader.sort_order ?? headerIndex + 1),
            isActive: rawHeader.isActive !== undefined || rawHeader.is_active !== undefined
              ? Boolean(rawHeader.isActive ?? rawHeader.is_active !== 0)
              : true,
          },
          update: {
            description: rawHeader.description || null,
            sortOrder: Number(rawHeader.sortOrder ?? rawHeader.sort_order ?? headerIndex + 1),
            isActive: rawHeader.isActive !== undefined || rawHeader.is_active !== undefined
              ? Boolean(rawHeader.isActive ?? rawHeader.is_active !== 0)
              : true,
          },
        });
        const topics = Array.isArray(rawHeader.topics) ? rawHeader.topics : [];
        for (const [topicIndex, rawTopic] of topics.slice(0, maxTopics).entries()) {
          const topicName = String(rawTopic.title || rawTopic.name || '').trim();
          if (!topicName) continue;
          const topic = rawTopic.topicId || rawTopic.topic_id
            ? await tx.topic.update({
                where: { id: String(rawTopic.topicId || rawTopic.topic_id) },
                data: {
                  name: topicName,
                  description: rawTopic.description || undefined,
                  cover: rawTopic.logo || rawTopic.icon || rawTopic.cover || undefined,
                  status: rawTopic.status || undefined,
                },
              })
            : await tx.topic.upsert({
                where: { name: topicName },
                create: {
                  name: topicName,
                  description: rawTopic.description || null,
                  cover: rawTopic.logo || rawTopic.icon || rawTopic.cover || null,
                  status: rawTopic.status || 'active',
                },
                update: {
                  description: rawTopic.description || undefined,
                  cover: rawTopic.logo || rawTopic.icon || rawTopic.cover || undefined,
                  status: rawTopic.status || undefined,
                },
              });
          await tx.circleTopicGroup.upsert({
            where: { circleId_topicId: { circleId, topicId: topic.id } },
            create: {
              circleId,
              headerId: header.id,
              topicId: topic.id,
              sortOrder: Number(rawTopic.sortOrder ?? rawTopic.sort_order ?? topicIndex + 1),
            },
            update: {
              headerId: header.id,
              sortOrder: Number(rawTopic.sortOrder ?? rawTopic.sort_order ?? topicIndex + 1),
            },
          });
        }
      }
    });
    return this.getTopicHeaders(circleId, 'true');
  }

  async updateTopicHeader(circleId: string, headerId: string, userId: string, dto: any, options: { skipPermission?: boolean } = {}) {
    if (!options.skipPermission) await this.assertCircleTopicManager(circleId, userId);
    const header = await this.prisma.circleTopicHeader.findFirst({ where: { id: headerId, circleId } });
    if (!header) throw new NotFoundException('话题分栏不存在');
    await this.prisma.circleTopicHeader.update({
      where: { id: headerId },
      data: {
        title: dto.title ?? dto.name ?? header.title,
        description: dto.description !== undefined ? dto.description || null : header.description,
        sortOrder: dto.sortOrder ?? dto.sort_order ?? header.sortOrder,
        isActive: dto.isActive !== undefined || dto.is_active !== undefined
          ? Boolean(dto.isActive ?? dto.is_active !== 0)
          : header.isActive,
      },
    });
    return this.getTopicHeaders(circleId, 'true');
  }

  async deleteTopicHeader(circleId: string, headerId: string, userId: string, options: { skipPermission?: boolean } = {}) {
    if (!options.skipPermission) await this.assertCircleTopicManager(circleId, userId);
    await this.prisma.$transaction([
      this.prisma.circleTopicGroup.deleteMany({ where: { circleId, headerId } }),
      this.prisma.circleTopicHeader.deleteMany({ where: { id: headerId, circleId } }),
    ]);
    return { success: true };
  }

  async unbindTopic(circleId: string, headerId: string, topicId: string, userId: string, options: { skipPermission?: boolean } = {}) {
    if (!options.skipPermission) await this.assertCircleTopicManager(circleId, userId);
    await this.prisma.circleTopicGroup.deleteMany({ where: { circleId, headerId, topicId } });
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

  async getAdminCircles(query: any, operatorId?: string) {
    const { page = 1, limit, pageSize, regionId, keyword, status, joinType } = query;
    const pageNum = Number(page) || 1;
    const take = Number(pageSize || limit || 20);
    const where: any = {
      ...(await this.adminDataScope.regionFieldWhere('regionId', operatorId, regionId)),
    };
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
          members: {
            where: { role: 'OWNER' },
            take: 1,
            include: { user: { select: { id: true, uid: true, nickname: true, avatar: true, phone: true, status: true } } },
          },
          _count: { select: { members: true } },
        },
      }),
      this.prisma.circle.count({ where }),
    ]);
    const circleIds = list.map((item: any) => item.id);
    const pendingRows = circleIds.length
      ? await this.prisma.circleMember.groupBy({
          by: ['circleId'],
          where: { circleId: { in: circleIds }, status: 'pending' },
          _count: { _all: true },
        })
      : [];
    const pendingMap = new Map(pendingRows.map((item: any) => [item.circleId, item._count?._all || 0]));
    return {
      list: list.map((c: any) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        cover: c.cover,
        description: c.description,
        announcement: c.announcement,
        rules: c.rules,
        regionId: c.regionId,
        regionName: c.region?.name || null,
        ownerUserId: c.ownerUserId,
        owner: this.toPublicUser(c.members?.[0]?.user),
        joinType: c.joinType,
        memberCount: c.memberCount,
        postCount: c.postCount,
        pendingMemberCount: pendingMap.get(c.id) || 0,
        isOfficial: c.isOfficial,
        status: c.status,
        auditStatus: c.auditStatus,
        auditReason: c.auditReason,
        auditStatusText: this.circleAuditText(c.auditStatus),
        riskScore: c.riskScore || 0,
        lastActiveAt: c.lastActiveAt,
        paidJoin: c.paidJoin,
        price: c.price,
        maxMembers: c.maxMembers,
        tags: c.tags,
        inviteCode: c.inviteCode,
        createdAt: c.createdAt,
      })),
      total,
      page: pageNum,
      pageSize: take,
    };
  }

  async getAdminCirclesStats(operatorId?: string) {
    const where = await this.adminDataScope.regionFieldWhere('regionId', operatorId);
    const [total, active, dissolved, pendingAudit, disabled, pendingJoinApplications, totalMembers, totalPosts, paidRevenue] = await Promise.all([
      this.prisma.circle.count({ where }),
      this.prisma.circle.count({ where: { ...where, status: 'active' } }),
      this.prisma.circle.count({ where: { ...where, status: 'dissolved' } }),
      this.prisma.circle.count({ where: { ...where, auditStatus: 'pending' } }),
      this.prisma.circle.count({ where: { ...where, status: 'disabled' } }),
      this.prisma.circleMember.count({ where: { status: 'pending', circle: { is: where } } }),
      this.prisma.circle.aggregate({ where, _sum: { memberCount: true } }),
      this.prisma.circle.aggregate({ where, _sum: { postCount: true } }),
      this.prisma.circlePayment.aggregate({ where: { status: 'paid', circle: { is: where } }, _sum: { amount: true } }),
    ]);
    return {
      total,
      active,
      dissolved,
      disabled,
      pendingAudit,
      pendingJoinApplications,
      totalMembers: totalMembers._sum.memberCount || 0,
      totalPosts: totalPosts._sum.postCount || 0,
      paidRevenue: Number(paidRevenue._sum.amount || 0),
    };
  }

  async getAdminCircleOperationsOverview(query: any, operatorId?: string) {
    const regionId = query?.regionId || query?.region_id;
    const where = await this.adminDataScope.regionFieldWhere('regionId', operatorId, regionId);
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
    const inactiveBefore = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [
      stats,
      todayPosts,
      weekPosts,
      pendingReports,
      inactiveCircles,
      hotCircles,
      riskyCircles,
      recentOperations,
    ] = await Promise.all([
      this.getAdminCirclesStats(operatorId),
      this.prisma.post.count({ where: { circleId: { not: null }, createdAt: { gte: today }, circle: { is: where } } }),
      this.prisma.post.count({ where: { circleId: { not: null }, createdAt: { gte: weekAgo }, circle: { is: where } } }),
      this.prisma.report.count({
        where: {
          status: 'pending',
          OR: [
            { targetType: 'circle', targetId: { not: '' } },
            { targetType: 'post', post: { is: { circleId: { not: null }, circle: { is: where } } } },
          ],
        },
      }).catch(() => 0),
      this.prisma.circle.findMany({
        where: {
          ...where,
          status: 'active',
          OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: inactiveBefore } }],
        },
        take: 8,
        orderBy: [{ lastActiveAt: 'asc' }, { createdAt: 'asc' }],
        include: { region: { select: { name: true } } },
      }),
      this.prisma.circle.findMany({
        where,
        take: 8,
        orderBy: [{ postCount: 'desc' }, { memberCount: 'desc' }],
        include: {
          region: { select: { name: true } },
          members: {
            where: { role: 'OWNER' },
            take: 1,
            include: { user: { select: { id: true, uid: true, nickname: true, avatar: true, phone: true, status: true } } },
          },
        },
      }),
      this.prisma.circle.findMany({
        where: { ...where, OR: [{ riskScore: { gt: 0 } }, { status: { in: ['disabled', 'pending'] } }, { auditStatus: { not: 'approved' } }] },
        take: 8,
        orderBy: [{ riskScore: 'desc' }, { updatedAt: 'desc' }],
        include: { region: { select: { name: true } } },
      }),
      this.prisma.adminOperationLog.findMany({
        where: { module: 'circle' },
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: { account: { select: { username: true, realName: true } } },
      }).catch(() => []),
    ]);

    const serializeCircle = (circle: any) => ({
      id: circle.id,
      name: circle.name,
      icon: circle.icon,
      cover: circle.cover,
      regionName: circle.region?.name || '',
      memberCount: circle.memberCount || 0,
      postCount: circle.postCount || 0,
      status: circle.status,
      auditStatus: circle.auditStatus,
      riskScore: circle.riskScore || 0,
      lastActiveAt: circle.lastActiveAt,
      owner: this.toPublicUser(circle.members?.[0]?.user),
      createdAt: circle.createdAt,
    });

    return {
      ...stats,
      todayPosts,
      weekPosts,
      pendingReports,
      inactiveCount: inactiveCircles.length,
      inactiveCircles: inactiveCircles.map(serializeCircle),
      hotCircles: hotCircles.map(serializeCircle),
      riskyCircles: riskyCircles.map(serializeCircle),
      recentOperations: recentOperations.map((item: any) => ({
        id: item.id,
        action: item.action,
        targetId: item.targetId,
        targetType: item.targetType,
        detail: item.detail,
        operatorName: item.account?.realName || item.account?.username || '管理员',
        createdAt: item.createdAt,
      })),
    };
  }

  async getAdminCircleDetail(circleId: string, operatorId?: string) {
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
      include: {
        region: { select: { id: true, name: true } },
        members: {
          where: { role: { in: ['OWNER', 'ADMIN'] } },
          include: { user: { select: { id: true, uid: true, nickname: true, avatar: true, phone: true, status: true } } },
          orderBy: { role: 'asc' },
        },
        _count: { select: { members: true, channels: true } },
      },
    });
    if (!circle) throw new Error('圈子不存在');
    await this.adminDataScope.assertRegionAccess(operatorId, circle.regionId);
    return {
      id: circle.id,
      name: circle.name,
      icon: circle.icon,
      cover: circle.cover,
      description: circle.description,
      announcement: circle.announcement,
      rules: circle.rules,
      regionId: circle.regionId,
      regionName: circle.region?.name || null,
      ownerUserId: circle.ownerUserId,
      owner: this.toPublicUser(this.getCircleOwnerMember(circle)?.user),
      managers: (circle.members || []).map((member: any) => ({
        id: member.id,
        userId: member.userId,
        role: member.role,
        status: member.status,
        statusText: this.memberStatusText(member.status),
        user: this.toPublicUser(member.user),
      })),
      joinType: circle.joinType,
      memberCount: circle.memberCount,
      postCount: circle.postCount,
      maxMembers: circle.maxMembers,
      isOfficial: circle.isOfficial,
      status: circle.status,
      auditStatus: circle.auditStatus,
      auditReason: circle.auditReason,
      auditStatusText: this.circleAuditText(circle.auditStatus),
      riskScore: circle.riskScore || 0,
      lastActiveAt: circle.lastActiveAt,
      tags: circle.tags,
      price: circle.price,
      paidJoin: circle.paidJoin,
      inviteCode: circle.inviteCode,
      deadline: circle.deadline,
      createdAt: circle.createdAt,
      channelCount: circle._count.channels,
    };
  }

  async adminUpdateCircle(circleId: string, dto: any, operatorId?: string, ip?: string) {
    const before = await this.getAdminCircleForScope(circleId, operatorId);
    const data = this.buildCircleMutationData(dto);
    const updated = await this.prisma.circle.update({ where: { id: circleId }, data });
    await this.logAdminCircleOperation(operatorId, 'UPDATE', before, { beforeStatus: before.status, changes: data }, ip);
    return updated;
  }

  async getAdminCircleAuditList(query: any, operatorId?: string) {
    const { page = 1, limit, pageSize, regionId, keyword } = query;
    const pageNum = Number(page) || 1;
    const take = Number(pageSize || limit || 20);
    const where: any = {
      ...(await this.adminDataScope.regionFieldWhere('regionId', operatorId, regionId)),
      OR: [{ auditStatus: 'pending' }, { status: 'pending' }],
    };
    if (keyword) {
      where.AND = [{ OR: [{ name: { contains: keyword } }, { description: { contains: keyword } }] }];
    }
    const [list, total] = await Promise.all([
      this.prisma.circle.findMany({
        where,
        skip: (pageNum - 1) * take,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          region: { select: { id: true, name: true } },
          members: {
            where: { role: 'OWNER' },
            take: 1,
            include: { user: { select: { id: true, uid: true, nickname: true, avatar: true, phone: true, status: true } } },
          },
        },
      }),
      this.prisma.circle.count({ where }),
    ]);

    return {
      list: list.map((circle: any) => ({
        id: circle.id,
        name: circle.name,
        icon: circle.icon,
        cover: circle.cover,
        description: circle.description,
        announcement: circle.announcement,
        rules: circle.rules,
        regionId: circle.regionId,
        regionName: circle.region?.name || '',
        ownerUserId: circle.ownerUserId,
        owner: this.toPublicUser(circle.members?.[0]?.user),
        joinType: circle.joinType,
        status: circle.status,
        auditStatus: circle.auditStatus,
        auditReason: circle.auditReason,
        auditStatusText: this.circleAuditText(circle.auditStatus),
        memberCount: circle.memberCount,
        postCount: circle.postCount,
        paidJoin: circle.paidJoin,
        price: circle.price,
        createdAt: circle.createdAt,
      })),
      total,
      page: pageNum,
      pageSize: take,
    };
  }

  async adminAuditCircle(circleId: string, dto: any, operatorId?: string, ip?: string) {
    const circle = await this.getAdminCircleForScope(circleId, operatorId);
    const status = String(dto.status || dto.action || '').toLowerCase();
    const approved = ['approved', 'approve', 'pass', '通过'].includes(status);
    const rejected = ['rejected', 'reject', 'deny', '拒绝', '驳回'].includes(status);
    if (!approved && !rejected) throw new BadRequestException('请选择通过或拒绝');
    const reason = String(dto.reason || dto.auditReason || '').trim();
    const data = approved
      ? { auditStatus: 'approved', auditReason: reason || '运营审核通过', status: 'active' }
      : { auditStatus: 'rejected', auditReason: reason || '运营审核不通过', status: 'disabled' };
    const updated = await this.prisma.circle.update({ where: { id: circleId }, data });
    await this.logAdminCircleOperation(operatorId, approved ? 'AUDIT_APPROVE' : 'AUDIT_REJECT', circle, { reason: data.auditReason }, ip);
    return { success: true, data: updated };
  }

  async getAdminCirclePosts(circleId: string, query: any, operatorId?: string) {
    await this.getAdminCircleForScope(circleId, operatorId);
    const { page = 1, limit, pageSize, status, auditStatus, keyword } = query;
    const pageNum = Number(page) || 1;
    const take = Number(pageSize || limit || 20);
    const where: any = { circleId };
    if (status) where.status = status;
    if (auditStatus) where.auditStatus = auditStatus;
    if (keyword) where.OR = [{ title: { contains: keyword } }, { content: { contains: keyword } }];
    const [list, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        skip: (pageNum - 1) * take,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, uid: true, nickname: true, avatar: true, phone: true, status: true } },
          media: true,
          reports: true,
          _count: { select: { comments: true, likes: true, favorites: true } },
        },
      }),
      this.prisma.post.count({ where }),
    ]);
    return {
      list: list.map((post: any) => ({
        id: post.id,
        title: post.title,
        content: post.content,
        type: post.type,
        status: post.status,
        auditStatus: post.auditStatus,
        auditReason: post.auditReason,
        userId: post.userId,
        user: this.toPublicUser(post.user),
        images: (post.media || []).filter((m: any) => m.type === 'IMAGE').map((m: any) => m.url),
        media: post.media || [],
        viewCount: post.viewCount,
        likeCount: post.likeCount,
        commentCount: post.commentCount,
        favoriteCount: post.favoriteCount,
        reportCount: post.reports?.length || 0,
        isTop: post.isTop,
        isEssence: post.isEssence,
        createdAt: post.createdAt,
      })),
      total,
      page: pageNum,
      pageSize: take,
    };
  }

  async getAdminCircleReports(circleId: string, query: any, operatorId?: string) {
    await this.getAdminCircleForScope(circleId, operatorId);
    const { page = 1, limit = 20, status } = query;
    const pageNum = Number(page) || 1;
    const take = Number(limit) || 20;
    const posts = await this.prisma.post.findMany({
      where: { circleId },
      select: { id: true },
    });
    const postIds = posts.map((item) => item.id);
    const comments = postIds.length
      ? await this.prisma.comment.findMany({ where: { postId: { in: postIds } }, select: { id: true } })
      : [];
    const commentIds = comments.map((item) => item.id);
    const where: any = {
      OR: [
        { targetType: 'circle', targetId: circleId },
        { targetType: 'post', targetId: { in: postIds.length ? postIds : ['__none__'] } },
        { targetType: 'comment', targetId: { in: commentIds.length ? commentIds : ['__none__'] } },
      ],
    };
    if (status) where.status = status;
    const [list, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        skip: (pageNum - 1) * take,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: { select: { id: true, uid: true, nickname: true, avatar: true, phone: true, status: true } },
          reported: { select: { id: true, uid: true, nickname: true, avatar: true, phone: true, status: true } },
        },
      }),
      this.prisma.report.count({ where }),
    ]);
    return {
      list: list.map((report: any) => ({
        id: report.id,
        targetType: report.targetType,
        targetId: report.targetId,
        reason: report.reason,
        detail: report.detail,
        status: report.status,
        result: report.result,
        reporter: this.toPublicUser(report.reporter),
        reported: this.toPublicUser(report.reported),
        createdAt: report.createdAt,
        handledAt: report.handledAt,
      })),
      total,
      page: pageNum,
      pageSize: take,
    };
  }

  async adminDissolveCircle(circleId: string, operatorId?: string, ip?: string) {
    const circle = await this.getAdminCircleForScope(circleId, operatorId);
    await this.prisma.circle.update({ where: { id: circleId }, data: { status: 'dissolved' } });
    await this.logAdminCircleOperation(operatorId, 'DISSOLVE', circle, { beforeStatus: circle.status }, ip);
    return { success: true };
  }

  async getAdminCircleMembers(circleId: string, query: any, operatorId?: string) {
    await this.getAdminCircleForScope(circleId, operatorId);
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
    return {
      list: list.map((member: any) => ({
        ...member,
        statusText: this.memberStatusText(member.status),
        user: this.toPublicUser(member.user),
      })),
      total,
      page: pageNum,
      pageSize: take,
    };
  }

  private async getAdminCircleMemberForScope(memberId: string, operatorId?: string) {
    const member = await this.prisma.circleMember.findUnique({
      where: { id: memberId },
      include: {
        circle: { select: { id: true, name: true, regionId: true, ownerUserId: true } },
        user: { select: { id: true, uid: true, nickname: true, avatar: true, phone: true, status: true } },
      },
    });
    if (!member) throw new NotFoundException('成员不存在');
    await this.adminDataScope.assertRegionAccess(operatorId, member.circle?.regionId);
    return member;
  }

  async adminUpdateMemberRole(memberId: string, dto: any, operatorId?: string, ip?: string) {
    const member = await this.getAdminCircleMemberForScope(memberId, operatorId);
    const role = String(dto.role || '').toUpperCase();
    if (!['ADMIN', 'MEMBER'].includes(role)) throw new BadRequestException('只能设置为管理员或普通成员，圈主请使用转让圈主');
    if (member.role === 'OWNER') throw new BadRequestException('圈主不能直接改角色，请先转让圈主');
    const updated = await this.prisma.circleMember.update({ where: { id: memberId }, data: { role: role as any, operatorId } });
    await this.logAdminCircleOperation(operatorId, 'UPDATE_MEMBER_ROLE', member.circle, { memberId, userId: member.userId, role }, ip);
    return { success: true, data: updated };
  }

  async adminMuteMember(memberId: string, dto: any, operatorId?: string, ip?: string) {
    const member = await this.getAdminCircleMemberForScope(memberId, operatorId);
    if (member.role === 'OWNER') throw new BadRequestException('圈主不能被禁言，请先转让圈主');
    const reason = String(dto.reason || '圈子违规禁言').trim();
    const muteEndAt = this.getMuteEndAt(dto.days);
    const updated = await this.prisma.circleMember.update({
      where: { id: memberId },
      data: { status: 'muted', muteEndAt, muteReason: reason, operatorId },
    });
    await this.logAdminCircleOperation(operatorId, 'MUTE_MEMBER', member.circle, { memberId, userId: member.userId, reason, muteEndAt }, ip);
    return { success: true, data: updated };
  }

  async adminUnmuteMember(memberId: string, operatorId?: string, ip?: string) {
    const member = await this.getAdminCircleMemberForScope(memberId, operatorId);
    const updated = await this.prisma.circleMember.update({
      where: { id: memberId },
      data: { status: 'active', muteEndAt: null, muteReason: null, operatorId },
    });
    await this.logAdminCircleOperation(operatorId, 'UNMUTE_MEMBER', member.circle, { memberId, userId: member.userId }, ip);
    return { success: true, data: updated };
  }

  async adminBanMember(memberId: string, dto: any, operatorId?: string, ip?: string) {
    const member = await this.getAdminCircleMemberForScope(memberId, operatorId);
    if (member.role === 'OWNER') throw new BadRequestException('圈主不能被拉黑，请先转让圈主');
    const wasCounted = this.isReadableMemberStatus(member.status);
    const reason = String(dto.reason || '圈子违规拉黑').trim();
    const updated = await this.prisma.circleMember.update({
      where: { id: memberId },
      data: { status: 'banned', muteEndAt: null, muteReason: reason, auditReason: reason, operatorId },
    });
    if (wasCounted) {
      await this.prisma.circle.updateMany({ where: { id: member.circleId, memberCount: { gt: 0 } }, data: { memberCount: { decrement: 1 } } });
    }
    await this.logAdminCircleOperation(operatorId, 'BAN_MEMBER', member.circle, { memberId, userId: member.userId, reason }, ip);
    return { success: true, data: updated };
  }

  async adminTransferOwner(circleId: string, dto: any, operatorId?: string, ip?: string) {
    const circle = await this.getAdminCircleForScope(circleId, operatorId);
    const targetMemberId = String(dto.memberId || dto.member_id || '').trim();
    const targetUserId = String(dto.userId || dto.user_id || '').trim();
    if (!targetMemberId && !targetUserId) throw new BadRequestException('请选择新圈主');
    const target = await this.prisma.circleMember.findFirst({
      where: {
        circleId,
        status: { in: ['active', 'muted'] },
        OR: [{ id: targetMemberId || '__none__' }, { userId: targetUserId || '__none__' }],
      },
    });
    if (!target) throw new NotFoundException('新圈主必须是圈内正常成员');
    await this.prisma.$transaction(async (tx) => {
      await tx.circleMember.updateMany({ where: { circleId, role: 'OWNER' }, data: { role: 'ADMIN', operatorId } });
      await tx.circleMember.update({ where: { id: target.id }, data: { role: 'OWNER', status: 'active', operatorId } });
      await tx.circle.update({ where: { id: circleId }, data: { ownerUserId: target.userId } });
    });
    await this.logAdminCircleOperation(operatorId, 'TRANSFER_OWNER', circle, { newOwnerUserId: target.userId, memberId: target.id }, ip);
    return { success: true };
  }

  async adminRemoveMember(memberId: string, operatorId?: string, ip?: string) {
    const member = await this.getAdminCircleMemberForScope(memberId, operatorId);
    if (member.role === 'OWNER') throw new BadRequestException('无法移除群主');
    const wasCounted = this.isReadableMemberStatus(member.status);
    await this.prisma.circleMember.delete({ where: { id: memberId } });
    if (wasCounted) {
      await this.prisma.circle.updateMany({ where: { id: member.circleId, memberCount: { gt: 0 } }, data: { memberCount: { decrement: 1 } } });
    }
    await this.logAdminCircleOperation(operatorId, 'REMOVE_MEMBER', member.circle, { memberId, userId: member.userId, role: member.role }, ip);
    return { success: true };
  }

  async getAdminCircleConfig(regionId: string, operatorId?: string) {
    regionId = await this.resolveAdminConfigRegionId(regionId, operatorId);
    const region = await this.prisma.region.findUnique({ where: { id: regionId } });
    if (!region) throw new NotFoundException('区域不存在');
    const settings: any = region.settings || {};
    return {
      ...this.normalizeCircleConfigPayload(settings.circleConfig || {}, regionId),
      regionName: region.name,
    };
  }

  async updateAdminCircleConfig(regionId: string, dto: any, operatorId?: string, ip?: string) {
    regionId = await this.resolveAdminConfigRegionId(regionId, operatorId);
    const region = await this.prisma.region.findUnique({ where: { id: regionId } });
    if (!region) throw new NotFoundException('区域不存在');
    const settings: any = region.settings || {};
    settings.circleConfig = this.normalizeCircleConfigPayload({ ...settings.circleConfig, ...dto }, regionId);
    await this.prisma.region.update({ where: { id: regionId }, data: { settings } });
    if (operatorId) {
      await this.prisma.adminOperationLog.create({
        data: {
          accountId: operatorId,
          action: 'UPDATE_CONFIG',
          module: 'circle',
          targetId: regionId,
          targetType: 'region',
          detail: { regionId, regionName: region.name, config: settings.circleConfig },
          ip: ip || null,
        },
      }).catch(() => undefined);
    }
    return { success: true, data: { ...settings.circleConfig, regionName: region.name } };
  }

  // ======================== 购买记录 ========================

  async getAdminCirclePayments(query: any, operatorId?: string) {
    const { page = 1, limit = 20, circleId, status, userId, regionId } = query;
    const where: any = {};
    if (circleId) where.circleId = circleId;
    if (circleId) await this.getAdminCircleForScope(circleId, operatorId);
    if (!circleId) {
      const circleRegionWhere = await this.adminDataScope.regionFieldWhere('regionId', operatorId, regionId);
      if (Object.keys(circleRegionWhere).length) where.circle = { is: circleRegionWhere };
    }
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

  async getAdminCircleTopicHeaders(circleId: string, operatorId?: string) {
    await this.getAdminCircleForScope(circleId, operatorId);
    return this.getTopicHeaders(circleId, 'true');
  }

  async adminSaveCircleTopicHeaders(circleId: string, dto: any, operatorId?: string, ip?: string) {
    const circle = await this.getAdminCircleForScope(circleId, operatorId);
    const result = await this.batchCreateTopicHeaders(circleId, operatorId || '', dto, { skipPermission: true });
    await this.logAdminCircleOperation(operatorId, 'SAVE_TOPIC_HEADERS', circle, { count: (dto?.headers || dto?.items || []).length }, ip);
    return result;
  }

  async adminUpdateCircleTopicHeader(circleId: string, headerId: string, dto: any, operatorId?: string, ip?: string) {
    const circle = await this.getAdminCircleForScope(circleId, operatorId);
    const result = await this.updateTopicHeader(circleId, headerId, operatorId || '', dto, { skipPermission: true });
    await this.logAdminCircleOperation(operatorId, 'UPDATE_TOPIC_HEADER', circle, { headerId, dto }, ip);
    return result;
  }

  async adminDeleteCircleTopicHeader(circleId: string, headerId: string, operatorId?: string, ip?: string) {
    const circle = await this.getAdminCircleForScope(circleId, operatorId);
    const result = await this.deleteTopicHeader(circleId, headerId, operatorId || '', { skipPermission: true });
    await this.logAdminCircleOperation(operatorId, 'DELETE_TOPIC_HEADER', circle, { headerId }, ip);
    return result;
  }

  async adminUnbindCircleTopic(circleId: string, headerId: string, topicId: string, operatorId?: string, ip?: string) {
    const circle = await this.getAdminCircleForScope(circleId, operatorId);
    const result = await this.unbindTopic(circleId, headerId, topicId, operatorId || '', { skipPermission: true });
    await this.logAdminCircleOperation(operatorId, 'UNBIND_TOPIC', circle, { headerId, topicId }, ip);
    return result;
  }

  // ======================== Admin 创建社群 ========================

  async adminCreateCircle(dto: any, operatorId?: string, ip?: string) {
    const regionId = dto.regionId || dto.region_id;
    if (!regionId) throw new BadRequestException('请选择区域');
    await this.adminDataScope.assertRegionAccess(operatorId, String(regionId));
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
      auditStatus: 'approved',
    };
    if (!data.status) data.status = 'active';
    const circle = await this.prisma.circle.create({ data });
    const ownerUserId = String(dto.ownerUserId || dto.owner_user_id || '').trim();
    if (ownerUserId) {
      await this.prisma.circleMember.create({
        data: { circleId: circle.id, userId: ownerUserId, role: 'OWNER', status: 'active', operatorId },
      });
      await this.prisma.circle.update({ where: { id: circle.id }, data: { ownerUserId, memberCount: 1 } });
    }
    await this.ensureDefaultTopicHeaders(circle.id, circle.regionId);
    await this.logAdminCircleOperation(operatorId, 'CREATE', circle, { source: 'admin' }, ip);
    return circle;
  }

  // ======================== Admin 删除社群 ========================

  async adminDeleteCircle(circleId: string, operatorId?: string, ip?: string) {
    const circle = await this.getAdminCircleForScope(circleId, operatorId);
    await this.prisma.circle.delete({ where: { id: circleId } });
    await this.logAdminCircleOperation(operatorId, 'DELETE', circle, { beforeStatus: circle.status }, ip);
    return { success: true };
  }
}
