import { BadRequestException, ForbiddenException, GoneException, Injectable, NotFoundException, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { AdminDataScopeService } from '../../common/services/admin-data-scope.service';
import { parseChatMessageContent } from '../../common/utils/chat-message.util';
import { MessageGateway } from '../websocket/message.gateway';
import { WsNativeGateway } from '../websocket/ws-native.gateway';
import { NotificationChannelService } from './notification-channel.service';
import { WechatSubscribeService } from '../wechat/wechat-subscribe.service';
import {
  CreateNotificationDto,
  AdminBroadcastDto,
} from './dto/create-notification.dto';
import {
  NotificationQueryDto,
  MarkAllReadDto,
} from './dto/notification-query.dto';

type OfficialAssistantActionInput = {
  text?: string;
  type?: string;
  value?: string;
};

type OfficialAssistantMessageInput = {
  regionId?: string | null;
  category?: string;
  renderType?: string;
  title?: string;
  content?: string;
  summary?: string;
  imageUrl?: string;
  iconUrl?: string;
  tagText?: string;
  tagType?: string;
  status?: string;
  priority?: number | string;
  actions?: OfficialAssistantActionInput[] | string;
  actionText?: string;
  actionType?: string;
  actionValue?: string;
  extra?: Record<string, any>;
  publishedAt?: string | Date | null;
};

const INTERACTION_NOTIFICATION_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const OFFICIAL_ASSISTANT_NAME = '校园小助手';
const OFFICIAL_ASSISTANT_AVATAR = '/static/logo.png';
const OFFICIAL_CONVERSATION_STATUSES = new Set(['pending', 'processing', 'waiting_user', 'resolved', 'rejected', 'closed']);
const OFFICIAL_CONVERSATION_STATUS_TEXT: Record<string, string> = {
  pending: '待处理',
  processing: '处理中',
  waiting_user: '待用户补充',
  resolved: '已解决',
  rejected: '已驳回',
  closed: '已关闭',
};

type InteractionNotificationOptions = {
  actorId?: string;
  cooldownMs?: number;
  now?: Date;
};

@Injectable()
export class NotifyService {
  private retryDeliveryRunning = false;
  private readonly logger = new Logger(NotifyService.name);
  private readonly unreadCacheTtl = 45;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly wsGateway: MessageGateway,
    private readonly wsNative: WsNativeGateway,
    private readonly jwtService: JwtService,
    private readonly adminDataScope: AdminDataScopeService,
    @Optional() @Inject(forwardRef(() => NotificationChannelService))
    private readonly channelService?: NotificationChannelService,
    @Optional() private readonly wechatSubscribe?: WechatSubscribeService,
  ) {}

  private toPositiveInt(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private unreadCacheKey(userId: string, regionId?: string) {
    return `notify:unread:${userId}:${regionId || 'all'}`;
  }

  private async clearUnreadCache(userId: string) {
    await this.redis.delPattern(`notify:unread:${userId}:*`).catch(() => undefined);
  }

  private toDbNotificationType(type?: string) {
    const key = String(type || 'SYSTEM').trim().toLowerCase();
    const map: Record<string, string> = {
      system: 'SYSTEM',
      admin_broadcast: 'ADMIN_BROADCAST',
      announcement: 'ANNOUNCEMENT',
      reply: 'REPLY',
      comment: 'COMMENT',
      mention: 'MENTION',
      like: 'LIKE',
      follow: 'FOLLOW',
      squat: 'SQUAT',
      message: 'MESSAGE',
      order: 'ORDER',
      delivery: 'DELIVERY',
      refund: 'REFUND',
      wallet: 'WALLET',
      circle: 'CIRCLE',
      certification: 'CERTIFICATION',
      merchant: 'MERCHANT',
    };
    return map[key] || key.toUpperCase();
  }

  private getNotificationTypeFilter(type?: string) {
    if (!type) return undefined;
    const key = String(type).trim().toLowerCase();
    const groups: Record<string, string[]> = {
      system: [
        'SYSTEM',
        'ADMIN_BROADCAST',
        'ANNOUNCEMENT',
        'MESSAGE',
        'CIRCLE',
        'ORDER',
        'DELIVERY',
        'REFUND',
        'WALLET',
        'CERTIFICATION',
        'MERCHANT',
      ],
      comment: ['COMMENT', 'REPLY', 'MENTION'],
      message: ['MESSAGE', 'CIRCLE'],
      interaction: ['COMMENT', 'REPLY', 'MENTION', 'LIKE', 'FOLLOW', 'SQUAT'],
    };
    return groups[key] || [this.toDbNotificationType(key)];
  }

  private toClientNotificationType(type?: string) {
    const key = String(type || 'SYSTEM').toUpperCase();
    if (key === 'ADMIN_BROADCAST' || key === 'ANNOUNCEMENT') return 'system';
    if (key === 'REPLY') return 'reply';
    if (key === 'MENTION') return 'comment';
    if (key === 'CIRCLE') return 'message';
    return key.toLowerCase();
  }

  private notificationPreferenceField(type?: string) {
    const key = this.toDbNotificationType(type);
    if (key === 'LIKE') return 'notifyLike';
    if (['COMMENT', 'REPLY', 'MENTION'].includes(key)) return 'notifyComment';
    if (key === 'FOLLOW') return 'notifyFollow';
    if (key === 'SQUAT') return 'notifySquat';
    return '';
  }

  private getNotificationData(notification: any) {
    const data = notification?.data;
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  }

  private pickString(...values: unknown[]) {
    for (const value of values) {
      const text = String(value || '').trim();
      if (text) return text;
    }
    return '';
  }

  private getInteractionActorId(dto: CreateNotificationDto, options: InteractionNotificationOptions = {}) {
    const data = dto.data || {};
    return this.pickString(
      options.actorId,
      data.fromUserId,
      data.from_user_id,
      data.actorId,
      data.actor_id,
      data.senderId,
      data.sender_id,
      dto.linkType === 'user' ? dto.linkValue : '',
    );
  }

  private normalizeReviewAction(action: string) {
    const value = String(action || '').trim().toLowerCase();
    if (value === 'approve') {
      return {
        auditStatus: 'approved',
        postStatus: 'PUBLISHED',
        commentStatus: 'active',
        reason: '用户审核通过',
      };
    }
    if (value === 'reject') {
      return {
        auditStatus: 'rejected',
        postStatus: 'REJECTED',
        commentStatus: 'hidden',
        reason: '用户审核驳回',
      };
    }
    throw new BadRequestException('审核操作无效');
  }

  private resolveReviewTarget(notification: any) {
    const data = this.getNotificationData(notification);
    const linkType = String(notification?.linkType || '').trim().toLowerCase();
    const targetType = this.pickString(
      data.reviewTargetType,
      data.review_target_type,
      data.targetType,
      data.target_type,
      data.contentType,
      data.content_type,
      data.commentId || data.comment_id ? 'comment' : '',
      data.postId || data.post_id || linkType === 'post' ? 'post' : '',
      linkType === 'comment' ? 'comment' : '',
    ).toLowerCase();

    if (targetType === 'comment') {
      return {
        type: 'comment',
        id: this.pickString(
          data.reviewTargetId,
          data.review_target_id,
          data.commentId,
          data.comment_id,
          data.targetCommentId,
          data.target_comment_id,
          linkType === 'comment' ? notification?.linkValue : '',
        ),
      };
    }

    return {
      type: 'post',
      id: this.pickString(
        data.reviewTargetId,
        data.review_target_id,
        data.postId,
        data.post_id,
        data.targetPostId,
        data.target_post_id,
        data.targetId,
        data.target_id,
        linkType === 'post' ? notification?.linkValue : '',
      ),
    };
  }

  private isCountedComment(comment: any) {
    return !!comment && !comment.deletedAt && comment.status === 'active' && comment.auditStatus === 'approved';
  }

  private async updateCommentWithCounter(commentId: string, data: any) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.comment.findUnique({ where: { id: commentId } });
      if (!before) throw new NotFoundException('评论不存在');
      const after = await tx.comment.update({ where: { id: commentId }, data });
      const beforeCounted = this.isCountedComment(before);
      const afterCounted = this.isCountedComment(after);
      if (beforeCounted !== afterCounted) {
        if (afterCounted) {
          await tx.post.update({ where: { id: before.postId }, data: { commentCount: { increment: 1 } } });
        } else {
          await tx.post.updateMany({
            where: { id: before.postId, commentCount: { gt: 0 } },
            data: { commentCount: { decrement: 1 } },
          });
        }
      }
      return after;
    });
  }

  private normalizeImages(value: any): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map((item) => typeof item === 'string' ? item : item?.url || item?.src || item?.image || '').filter(Boolean);
    }
    if (typeof value === 'string') return [value].filter(Boolean);
    if (typeof value === 'object') {
      return this.normalizeImages(value.urls || value.images || value.list || value.image_urls || value.comment_images);
    }
    return [];
  }

  private formatUser(user: any) {
    if (!user) return null;
    return {
      id: user.id,
      uid: user.uid,
      public_uid: user.publicUid || user.uid,
      nickname: user.nickname || '该用户未设置昵称',
      name: user.nickname || '该用户未设置昵称',
      avatar: user.avatar || '/static/logo.png',
      type: user.userType || 1,
    };
  }

  private formatPost(post: any) {
    if (!post) return null;
    const firstMedia = Array.isArray(post.media) ? post.media[0] : null;
    const firstImage = firstMedia?.thumb || firstMedia?.url || '';
    return {
      id: post.id,
      title: post.title || '',
      content: post.content || '',
      user_id: post.userId,
      region_id: post.regionId,
      first_image: firstImage,
      cover: firstImage,
      image: firstImage,
      created_at: post.createdAt?.toISOString?.() || post.createdAt,
    };
  }

  private formatComment(comment: any, type?: string) {
    if (!comment) return null;
    const images = this.normalizeImages(comment.images);
    return {
      id: comment.id,
      comment_id: comment.id,
      post_id: comment.postId,
      parent_id: comment.parentId || '',
      parentId: comment.parentId || null,
      type: String(type || '').toUpperCase() === 'REPLY' || comment.parentId ? 'reply' : 'comment',
      content: comment.content || '',
      images,
      user_id: comment.userId,
      user: this.formatUser(comment.user),
      created_at: comment.createdAt?.toISOString?.() || comment.createdAt,
    };
  }

  private async getOfficialUser() {
    return this.prisma.user.upsert({
      where: { openid: 'lingmeng_official_message_account' },
      create: {
        openid: 'lingmeng_official_message_account',
        nickname: OFFICIAL_ASSISTANT_NAME,
        avatar: OFFICIAL_ASSISTANT_AVATAR,
        userType: 4,
      },
      update: {
        nickname: OFFICIAL_ASSISTANT_NAME,
        avatar: OFFICIAL_ASSISTANT_AVATAR,
        userType: 4,
      },
      select: { id: true, nickname: true, avatar: true },
    });
  }

  private async findOrCreateOfficialConversation(userId: string, officialUserId: string) {
    const profile = await this.prisma.userProfile.findUnique({ where: { userId }, select: { regionId: true } });
    const regionId = profile?.regionId || null;
    let conversation = await this.prisma.conversation.findFirst({
      where: {
        type: 'private',
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: officialUserId } } },
        ],
      },
    });
    if (conversation) {
      if (!conversation.regionId && regionId) {
        return this.prisma.conversation.update({ where: { id: conversation.id }, data: { regionId } });
      }
      return conversation;
    }

    conversation = await this.prisma.conversation.create({
      data: {
        type: 'private',
        regionId,
        title: OFFICIAL_ASSISTANT_NAME,
        avatar: OFFICIAL_ASSISTANT_AVATAR,
        members: {
          create: [
            { userId },
            { userId: officialUserId, role: 'admin', nickName: OFFICIAL_ASSISTANT_NAME },
          ],
        },
      },
    });
    return conversation;
  }

  private normalizeAssistantCategory(value?: string) {
    const key = String(value || 'campus').trim().toLowerCase();
    if (['campus', 'system', 'service'].includes(key)) return key;
    return 'campus';
  }

  private normalizeAssistantRenderType(value?: string) {
    const key = String(value || 'card').trim().toLowerCase();
    return key === 'text' ? 'text' : 'card';
  }

  private normalizeAssistantStatus(value?: string) {
    const key = String(value || 'published').trim().toLowerCase();
    if (['draft', 'published', 'offline'].includes(key)) return key;
    return 'published';
  }

  private getAssistantCategoryLabel(category?: string) {
    const labels: Record<string, string> = {
      campus: '校园通知',
      system: '系统通知',
      service: '官方客服',
    };
    return labels[this.normalizeAssistantCategory(category)] || '校园通知';
  }

  private normalizeAssistantActions(dto: OfficialAssistantMessageInput) {
    const rawActions = Array.isArray(dto.actions)
      ? dto.actions
      : typeof dto.actions === 'string'
        ? this.parseJsonArray(dto.actions)
        : [];
    const actionList = rawActions
      .map((item: any) => ({
        text: String(item?.text || '').trim(),
        type: String(item?.type || 'miniapp').trim() || 'miniapp',
        value: String(item?.value || '').trim(),
      }))
      .filter((item) => item.text && item.value);

    const actionText = String(dto.actionText || '').trim();
    const actionValue = String(dto.actionValue || '').trim();
    if (actionText && actionValue) {
      actionList.push({
        text: actionText,
        type: String(dto.actionType || 'miniapp').trim() || 'miniapp',
        value: actionValue,
      });
    }
    return actionList;
  }

  private parseJsonArray(value: string) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private parseAssistantPublishedAt(value: unknown, status: string) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === 'string' && value.trim()) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date;
    }
    return status === 'published' ? new Date() : null;
  }

  private formatOfficialAssistantMessage(item: any) {
    const category = this.normalizeAssistantCategory(item?.category);
    return {
      id: item.id,
      regionId: item.regionId || '',
      category,
      categoryLabel: this.getAssistantCategoryLabel(category),
      renderType: this.normalizeAssistantRenderType(item.renderType),
      title: item.title,
      content: item.content,
      summary: item.summary || '',
      imageUrl: item.imageUrl || '',
      iconUrl: item.iconUrl || '',
      tagText: item.tagText || this.getAssistantCategoryLabel(category),
      tagType: item.tagType || category,
      status: item.status || 'published',
      priority: item.priority || 0,
      actions: Array.isArray(item.actions) ? item.actions : [],
      extra: item.extra || {},
      publishedAt: item.publishedAt?.toISOString?.() || item.publishedAt || '',
      createdAt: item.createdAt?.toISOString?.() || item.createdAt || '',
      updatedAt: item.updatedAt?.toISOString?.() || item.updatedAt || '',
    };
  }

  async createOfficialAssistantMessage(adminId: string, dto: OfficialAssistantMessageInput) {
    const title = String(dto.title || '').trim();
    const content = String(dto.content || '').trim();
    if (!title) throw new BadRequestException('请填写标题');
    if (!content) throw new BadRequestException('请填写内容');
    const status = this.normalizeAssistantStatus(dto.status);
    const category = this.normalizeAssistantCategory(dto.category);
    const renderType = this.normalizeAssistantRenderType(dto.renderType);
    const actions = this.normalizeAssistantActions(dto);

    return this.prisma.officialAssistantMessage.create({
      data: {
        regionId: dto.regionId || null,
        category,
        renderType,
        title,
        content,
        summary: String(dto.summary || '').trim() || null,
        imageUrl: String(dto.imageUrl || '').trim() || null,
        iconUrl: String(dto.iconUrl || '').trim() || null,
        tagText: String(dto.tagText || '').trim() || this.getAssistantCategoryLabel(category),
        tagType: String(dto.tagType || '').trim() || category,
        status,
        priority: this.toPositiveInt(dto.priority, 0),
        actions: actions as any,
        extra: { ...(dto.extra || {}), operatorId: adminId } as any,
        createdBy: adminId,
        publishedAt: this.parseAssistantPublishedAt(dto.publishedAt, status),
      },
    });
  }

  async listOfficialAssistantMessages(query: {
    regionId?: string;
    category?: string;
    status?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = this.toPositiveInt(query.pageSize, 20);
    const where: any = {};
    if (query.regionId) {
      where.OR = [{ regionId: query.regionId }, { regionId: null }];
    }
    if (query.category) where.category = this.normalizeAssistantCategory(query.category);
    if (query.status) where.status = this.normalizeAssistantStatus(query.status);
    const keyword = String(query.keyword || '').trim();
    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
        { content: { contains: keyword } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.officialAssistantMessage.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ priority: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.officialAssistantMessage.count({ where }),
    ]);

    return {
      list: items.map((item) => this.formatOfficialAssistantMessage(item)),
      total,
      page,
      pageSize,
    };
  }

  async updateOfficialAssistantMessage(id: string, dto: OfficialAssistantMessageInput) {
    const data: any = {};
    if (dto.regionId !== undefined) data.regionId = dto.regionId || null;
    if (dto.category !== undefined) data.category = this.normalizeAssistantCategory(dto.category);
    if (dto.renderType !== undefined) data.renderType = this.normalizeAssistantRenderType(dto.renderType);
    if (dto.title !== undefined) {
      const title = String(dto.title || '').trim();
      if (!title) throw new BadRequestException('请填写标题');
      data.title = title;
    }
    if (dto.content !== undefined) {
      const content = String(dto.content || '').trim();
      if (!content) throw new BadRequestException('请填写内容');
      data.content = content;
    }
    if (dto.summary !== undefined) data.summary = String(dto.summary || '').trim() || null;
    if (dto.imageUrl !== undefined) data.imageUrl = String(dto.imageUrl || '').trim() || null;
    if (dto.iconUrl !== undefined) data.iconUrl = String(dto.iconUrl || '').trim() || null;
    if (dto.tagText !== undefined) data.tagText = String(dto.tagText || '').trim() || null;
    if (dto.tagType !== undefined) data.tagType = String(dto.tagType || '').trim() || null;
    if (dto.priority !== undefined) data.priority = this.toPositiveInt(dto.priority, 0);
    if (dto.actions !== undefined || dto.actionText !== undefined || dto.actionValue !== undefined) {
      data.actions = this.normalizeAssistantActions(dto) as any;
    }
    if (dto.extra !== undefined) data.extra = dto.extra as any;
    if (dto.status !== undefined) {
      const status = this.normalizeAssistantStatus(dto.status);
      data.status = status;
      if (status === 'published' && !dto.publishedAt) data.publishedAt = new Date();
    }
    if (dto.publishedAt !== undefined) {
      data.publishedAt = this.parseAssistantPublishedAt(dto.publishedAt, data.status || dto.status || 'draft');
    }
    return this.prisma.officialAssistantMessage.update({ where: { id }, data });
  }

  async deleteOfficialAssistantMessage(id: string) {
    await this.prisma.officialAssistantMessage.delete({ where: { id } });
    return { success: true };
  }

  async getOfficialAssistantTimeline(userId: string, query: {
    regionId?: string;
    category?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = this.toPositiveInt(query.pageSize, 20);
    const where: any = { status: 'published' };
    if (query.category) where.category = this.normalizeAssistantCategory(query.category);
    if (query.regionId) {
      where.OR = [{ regionId: query.regionId }, { regionId: null }];
    } else {
      where.regionId = null;
    }

    const [items, total] = await Promise.all([
      this.prisma.officialAssistantMessage.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ priority: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.officialAssistantMessage.count({ where }),
    ]);

    return {
      assistant: {
        name: '校园小助手',
        subtitle: '校园通知 · 系统消息 · 官方客服',
        avatar: OFFICIAL_ASSISTANT_AVATAR,
        official: true,
      },
      welcome: {
        title: '欢迎来到念白校园',
        content: '有新消息会告诉你！',
      },
      list: items.map((item) => this.formatOfficialAssistantMessage(item)),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
      userId,
    };
  }

  // ===========================================================================
  // 创建并分发通知（核心入口）
  // ===========================================================================

  async createAndDispatchInteraction(
    dto: CreateNotificationDto,
    options: InteractionNotificationOptions = {},
  ) {
    const actorId = this.getInteractionActorId(dto, options);
    const cooldownMs = Number(options.cooldownMs ?? INTERACTION_NOTIFICATION_COOLDOWN_MS);

    if (!actorId || !Number.isFinite(cooldownMs) || cooldownMs <= 0) {
      return this.createAndDispatch(dto);
    }

    const since = new Date((options.now || new Date()).getTime() - cooldownMs);
    const where: any = {
      userId: dto.userId,
      type: this.toDbNotificationType(dto.type) as any,
      createdAt: { gte: since },
    };
    if (dto.scene) where.scene = dto.scene;
    if (dto.linkType) where.linkType = dto.linkType;
    if (dto.linkValue) where.linkValue = dto.linkValue;

    const recent = await this.prisma.notification.findMany({
      where,
      select: { id: true, data: true, createdAt: true, isRead: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const existing = recent.find((item: any) => this.pickString(
      this.getNotificationData(item).fromUserId,
      this.getNotificationData(item).from_user_id,
      this.getNotificationData(item).actorId,
      this.getNotificationData(item).actor_id,
      this.getNotificationData(item).senderId,
      this.getNotificationData(item).sender_id,
      dto.linkType === 'user' ? dto.linkValue : '',
    ) === actorId);

    if (existing) {
      return { ...existing, deduped: true };
    }

    return this.createAndDispatch(dto);
  }

  private async deliverNotificationChannels(notification: any, channelMask: any) {
    const report: Record<string, any> = { inApp: { status: 'success' } };
    const unreadSummary = await this.getUnreadSummary(notification.userId, notification.regionId);

    if (channelMask.websocket) {
      const pushPayload = {
        event: 'notification',
        type: 'notification',
        data: {
          id: notification.id,
          type: this.toClientNotificationType(notification.type),
          scene: notification.scene,
          title: notification.title,
          content: notification.content,
          data: notification.data,
          linkType: notification.linkType,
          linkValue: notification.linkValue,
          createdAt: notification.createdAt?.toISOString(),
        },
      };
      const unreadPayload = { event: 'unreadSummary', data: unreadSummary };
      const errors: string[] = [];
      try {
        this.wsGateway.pushNotification(notification.userId, pushPayload);
        this.wsGateway.pushNotification(notification.userId, unreadPayload);
      } catch (error: any) {
        errors.push(`socket.io: ${error.message}`);
      }
      try {
        this.wsNative.pushToUser(notification.userId, pushPayload);
        this.wsNative.pushToUser(notification.userId, unreadPayload);
      } catch (error: any) {
        errors.push(`native: ${error.message}`);
      }
      report.websocket = errors.length >= 2
        ? { status: 'failed', error: errors.join('; ') }
        : { status: 'success', warning: errors.join('; ') || undefined };
    } else {
      report.websocket = { status: 'skipped' };
    }

    if (channelMask.email && this.channelService) {
      try {
        const enabled = await this.channelService.isChannelEnabled('email');
        const profile = enabled
          ? await this.prisma.userProfile.findUnique({
              where: { userId: notification.userId },
              select: { email: true },
            })
          : null;
        if (profile?.email) {
          await this.channelService.sendEmail(profile.email, notification.title, notification.content);
          report.email = { status: 'success' };
        } else {
          report.email = { status: 'skipped', reason: enabled ? 'no_recipient' : 'disabled' };
        }
      } catch (error: any) {
        report.email = { status: 'failed', error: error.message };
      }
    }

    if (channelMask.sms && this.channelService) {
      try {
        const enabled = await this.channelService.isChannelEnabled('sms');
        const user = enabled
          ? await this.prisma.user.findUnique({
              where: { id: notification.userId },
              select: { phone: true },
            })
          : null;
        if (user?.phone) {
          await this.channelService.sendSms(
            user.phone,
            `${notification.title}: ${notification.content}`.slice(0, 200),
          );
          report.sms = { status: 'success' };
        } else {
          report.sms = { status: 'skipped', reason: enabled ? 'no_recipient' : 'disabled' };
        }
      } catch (error: any) {
        report.sms = { status: 'failed', error: error.message };
      }
    }

    const takeawayTemplate = this.takeawayTemplateType(notification.scene);
    if ((channelMask.wechatSubscribe || takeawayTemplate) && this.wechatSubscribe) {
      const sent = await this.wechatSubscribe.sendSubscribeMessage({
        userId: notification.userId,
        templateType: takeawayTemplate || notification.scene || this.toDbNotificationType(notification.type).toLowerCase(),
        page: notification.linkValue || undefined,
        data: { ...(notification.data || {}), title: notification.title, content: notification.content },
      });
      report.wechat = sent.success ? { status: 'success' } : { status: 'skipped', reason: sent.error };
    } else if (channelMask.wechatSubscribe || channelMask.officialAccount) {
      report.wechat = { status: 'skipped', reason: 'wechat_service_unavailable' };
    }

    const statuses = Object.values(report).map((item: any) => item.status);
    const deliveryStatus = statuses.includes('failed') ? 'partial' : 'delivered';
    return { report, deliveryStatus };
  }

  private takeawayTemplateType(scene?: string | null) {
    const value = String(scene || '');
    if (value === 'shop_order_ready') return 'takeaway_rider_order';
    if (!value.startsWith('takeaway_')) return '';
    if (['takeaway_pickup_reminder', 'takeaway_delivery_reminder'].includes(value)) return 'takeaway_rider_order';
    if (['takeaway_accept_reminder', 'takeaway_rider_status'].includes(value)) return 'takeaway_merchant_order';
    return 'takeaway_order_status';
  }

  async createAndDispatch(dto: CreateNotificationDto) {
    const preferenceField = this.notificationPreferenceField(dto.type);
    if (preferenceField) {
      const settings = await this.prisma.userSettings.findUnique({
        where: { userId: dto.userId },
        select: { [preferenceField]: true },
      } as any);
      if (settings?.[preferenceField] === false) {
        return { skipped: true, reason: 'user_notification_preference' } as any;
      }
    }

    const defaultChannelMask = {
      inApp: true,
      websocket: true,
      wechatSubscribe: false,
      officialAccount: false,
      ...dto.channelMask,
    };
    const channelMask = this.channelService
      ? await this.channelService.resolveChannelMask(defaultChannelMask, this.toDbNotificationType(dto.type), dto.scene)
      : defaultChannelMask;

    // 1. 站内通知入库（必须成功）
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        regionId: dto.regionId || null,
        type: this.toDbNotificationType(dto.type) as any,
        scene: dto.scene || null,
        title: dto.title,
        content: dto.content,
        data: dto.data || undefined,
        linkType: dto.linkType || null,
        linkValue: dto.linkValue || null,
        channelMask: channelMask as any,
      },
    });

    // 2. 清理未读缓存并分发外部渠道
    await this.clearUnreadCache(dto.userId);
    const delivery = await this.deliverNotificationChannels(notification, channelMask);
    await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        deliveryStatus: delivery.deliveryStatus,
        deliveryReport: delivery.report,
        deliveryAttempts: { increment: 1 },
        lastDeliveryAt: new Date(),
      },
    });

    return { ...notification, ...delivery, deliveryAttempts: 1 };
  }

  // ===========================================================================
  // 获取通知中心列表（兼容新旧格式）
  // ===========================================================================

  async getCenterList(userId: string, query: NotificationQueryDto) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = this.toPositiveInt(query.pageSize, 20);
    const where: any = { userId, hiddenAt: null };
    const typeFilter = this.getNotificationTypeFilter(query.type);
    if (typeFilter) where.type = typeFilter.length === 1 ? typeFilter[0] : { in: typeFilter };
    if (['1', 'true'].includes(String(query.unreadOnly || '').toLowerCase())) where.isRead = false;
    if (query.regionId) {
      where.OR = [
        { regionId: query.regionId },
        { regionId: null },
      ];
    }

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...where, isRead: false } }),
    ]);

    const fromUserIds = new Set<string>();
    const postIds = new Set<string>();
    const commentIds = new Set<string>();

    items.forEach((item: any) => {
      const data = this.getNotificationData(item);
      const fromUserId = this.pickString(data.fromUserId, data.from_user_id, data.actorId, data.senderId, item.linkType === 'user' ? item.linkValue : '');
      const postId = this.pickString(data.postId, data.post_id, data.targetPostId, item.linkType === 'post' ? item.linkValue : '');
      const commentId = this.pickString(data.commentId, data.comment_id, data.targetCommentId);
      if (fromUserId) fromUserIds.add(fromUserId);
      if (postId) postIds.add(postId);
      if (commentId) commentIds.add(commentId);
    });

    const [users, posts, comments] = await Promise.all([
      fromUserIds.size
        ? this.prisma.user.findMany({
            where: { id: { in: [...fromUserIds] } },
            select: { id: true, uid: true, publicUid: true, nickname: true, avatar: true, userType: true },
          })
        : [],
      postIds.size
        ? this.prisma.post.findMany({
            where: { id: { in: [...postIds] }, deletedAt: null },
            select: {
              id: true,
              userId: true,
              regionId: true,
              title: true,
              content: true,
              createdAt: true,
              media: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true, thumb: true, type: true } },
            },
          })
        : [],
      commentIds.size
        ? this.prisma.comment.findMany({
            where: { id: { in: [...commentIds] }, deletedAt: null },
            select: {
              id: true,
              postId: true,
              userId: true,
              parentId: true,
              content: true,
              images: true,
              createdAt: true,
              user: { select: { id: true, uid: true, publicUid: true, nickname: true, avatar: true, userType: true } },
            },
          })
        : [],
    ]);

    const userMap = new Map(users.map((item: any) => [item.id, item]));
    const postMap = new Map(posts.map((item: any) => [item.id, item]));
    const commentMap = new Map(comments.map((item: any) => [item.id, item]));

    const formatted = items.map((n: any) => {
      const data = this.getNotificationData(n);
      const clientType = this.toClientNotificationType(n.type);
      const fromUserId = this.pickString(data.fromUserId, data.from_user_id, data.actorId, data.senderId, n.linkType === 'user' ? n.linkValue : '');
      const postId = this.pickString(data.postId, data.post_id, data.targetPostId, n.linkType === 'post' ? n.linkValue : '');
      const commentId = this.pickString(data.commentId, data.comment_id, data.targetCommentId);
      const otherUser = this.formatUser(userMap.get(fromUserId));
      const post = this.formatPost(postMap.get(postId));
      const comment = this.formatComment(commentMap.get(commentId), n.type);
      const targetStatus = commentId && !comment
        ? 'comment_deleted'
        : postId && !post
          ? 'post_deleted'
          : fromUserId && !otherUser
            ? 'user_unavailable'
            : 'available';
      return {
        id: n.id,
        notification_id: n.id,
        notification_type: clientType,
        notification_title: n.title,
        notification_content: n.content,
        type: clientType,
        scene: n.scene,
        title: n.title,
        content: n.content,
        data,
        linkType: n.linkType,
        linkValue: n.linkValue,
        isRead: n.isRead,
        is_read: n.isRead,
        readAt: n.readAt,
        notification_time: n.createdAt?.toISOString(),
        createdAt: n.createdAt?.toISOString(),
        updatedAt: n.updatedAt?.toISOString(),
        other_user: otherUser,
        otherUser,
        post,
        comment,
        post_id: postId,
        comment_id: commentId,
        from_user_id: fromUserId,
        target_status: targetStatus,
        target_available: targetStatus === 'available',
      };
    });

    return {
      notifications: formatted,
      list: formatted,
      total,
      unreadCount,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    };
  }

  // ===========================================================================
  // 获取未读汇总
  // ===========================================================================

  async getUnreadSummary(userId: string, regionId?: string) {
    const cacheKey = this.unreadCacheKey(userId, regionId);
    const cached = await this.redis.getJson<any>(cacheKey).catch(() => null);
    if (cached) return cached;

    const where: any = { userId, isRead: false, hiddenAt: null };
    if (regionId) {
      where.OR = [
        { regionId },
        { regionId: null },
      ];
    }

    const chatWhere: any = { userId, unreadCount: { gt: 0 } };
    if (regionId) {
      chatWhere.conversation = {
        OR: [
          { regionId },
          { regionId: null },
        ],
      };
    }

    const [notifications, chatMembers] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        select: { type: true },
      }),
      this.prisma.conversationMember.findMany({
        where: chatWhere,
        select: {
          unreadCount: true,
          conversation: { select: { type: true } },
        },
      }),
    ]);

    const counts: Record<string, number> = {
      like: 0,
      comment: 0,
      reply: 0,
      follow: 0,
      squat: 0,
      message: 0,
      privateChat: 0,
      groupChat: 0,
      system: 0,
      order: 0,
      delivery: 0,
      refund: 0,
      certification: 0,
      merchant: 0,
      announcement: 0,
      systemChat: 0,
      interaction: 0,
    };

    for (const n of notifications) {
      const key = this.toClientNotificationType(n.type);
      if (key in counts) counts[key]++;
      else if (key === 'wallet') counts.system++;
    }

    let chatUnread = 0;
    for (const member of chatMembers) {
      const unread = member.unreadCount || 0;
      chatUnread += unread;
      if (member.conversation?.type === 'group') {
        counts.groupChat += unread;
      } else {
        counts.privateChat += unread;
      }
    }

    counts.message += chatUnread;
    const notificationUnread = notifications.length;
    counts.interaction = counts.comment
      + counts.reply
      + counts.like
      + counts.follow
      + counts.squat;
    counts.systemChat = notificationUnread - counts.interaction + chatUnread;
    const total = counts.systemChat + counts.interaction;

    const result = {
      total,
      unreadCount: total,
      totalUnread: total,
      notificationUnread,
      chatUnread,
      unreadCounts: counts,
    };
    await this.redis.setJson(cacheKey, result, this.unreadCacheTtl).catch(() => undefined);
    return result;
  }

  // ===========================================================================
  // 标记已读
  // ===========================================================================

  async markRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('通知不存在');
    }
    if (!notification.isRead) {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { isRead: true, readAt: new Date() },
      });
      await this.clearUnreadCache(userId);
    }
    return { success: true };
  }

  async markAllRead(userId: string, query: MarkAllReadDto) {
    const where: any = { userId, isRead: false, hiddenAt: null };
    if (query.type) {
      const typeFilter = this.getNotificationTypeFilter(query.type);
      if (typeFilter) where.type = typeFilter.length === 1 ? typeFilter[0] : { in: typeFilter };
    }
    if (query.regionId) {
      where.OR = [{ regionId: query.regionId }, { regionId: null }];
    }

    const result = await this.prisma.notification.updateMany({
      where,
      data: { isRead: true, readAt: new Date() },
    });

    await this.clearUnreadCache(userId);
    return { success: true, affected: result.count };
  }

  async batchAction(userId: string, rawIds?: string[], action?: 'read' | 'hide') {
    const ids = [...new Set((Array.isArray(rawIds) ? rawIds : []).map(String).filter(Boolean))];
    if (!ids.length || ids.length > 100 || !['read', 'hide'].includes(String(action))) {
      throw new BadRequestException('请选择 1-100 条通知并指定有效操作');
    }
    const now = new Date();
    const result = await this.prisma.notification.updateMany({
      where: { id: { in: ids }, userId, hiddenAt: null },
      data: action === 'hide'
        ? { hiddenAt: now, isRead: true, readAt: now }
        : { isRead: true, readAt: now },
    });
    await this.clearUnreadCache(userId);
    return { success: true, affected: result.count };
  }

  async retryNotificationDelivery(notificationId: string, operatorId?: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) throw new NotFoundException('通知不存在');
    if (operatorId) {
      const accessibleUserIds = await this.getAccessibleUserIds(operatorId);
      if (accessibleUserIds !== null && !accessibleUserIds.includes(notification.userId)) {
        throw new ForbiddenException('无权操作该区域通知');
      }
    }
    const channelMask = (notification.channelMask || { inApp: true, websocket: true }) as any;
    const previousReport = (notification.deliveryReport || {}) as Record<string, any>;
    const failedChannels = ['websocket', 'email', 'sms'].filter(
      channel => previousReport[channel]?.status === 'failed',
    );
    if (Object.keys(previousReport).length && !failedChannels.length) {
      return { success: true, notification, message: '没有需要重试的失败渠道' };
    }
    const retryMask = Object.keys(previousReport).length
      ? {
          inApp: true,
          websocket: failedChannels.includes('websocket'),
          email: failedChannels.includes('email'),
          sms: failedChannels.includes('sms'),
          wechatSubscribe: false,
          officialAccount: false,
        }
      : channelMask;
    const delivery = await this.deliverNotificationChannels(notification, retryMask);
    const mergedReport = { ...previousReport };
    (failedChannels.length ? failedChannels : Object.keys(delivery.report)).forEach(channel => {
      if (delivery.report[channel]) mergedReport[channel] = delivery.report[channel];
    });
    const deliveryStatus = Object.values(mergedReport).some(
      (item: any) => item?.status === 'failed',
    ) ? 'partial' : 'delivered';
    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        deliveryStatus,
        deliveryReport: mergedReport,
        deliveryAttempts: { increment: 1 },
        lastDeliveryAt: new Date(),
      },
    });
    return { success: true, notification: updated };
  }

  @Interval(60_000)
  async retryFailedNotificationDeliveries() {
    if (this.retryDeliveryRunning) return { processed: 0 };
    this.retryDeliveryRunning = true;
    try {
      return (await this.redis.withLock('notify:retry-failed-deliveries', 55, async () => {
        const notifications = await this.prisma.notification.findMany({
        where: {
          deliveryStatus: 'partial',
          deliveryAttempts: { lt: 3 },
          lastDeliveryAt: { lt: new Date(Date.now() - 5 * 60_000) },
        },
        select: { id: true },
        orderBy: { lastDeliveryAt: 'asc' },
        take: 50,
      });
        let processed = 0;
        for (const notification of notifications) {
          try {
            await this.retryNotificationDelivery(notification.id);
            processed += 1;
          } catch (error: any) {
            this.logger.warn(`通知自动重试失败 ${notification.id}: ${error.message}`);
          }
        }
        return { processed };
      })) || { processed: 0 };
    } finally {
      this.retryDeliveryRunning = false;
    }
  }

  // ===========================================================================
  // 删除通知
  // ===========================================================================

  async deleteNotification(userId: string, notificationId: string) {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { hiddenAt: new Date(), isRead: true, readAt: new Date() },
    });
    await this.clearUnreadCache(userId);
    return { success: true };
  }

  async reviewNotification(userId: string, notificationId: string, action: string) {
    void userId;
    void notificationId;
    void action;
    throw new GoneException('通知确认不能审核内容，请使用后台专用审核流程');
  }

  // ===========================================================================
  // 后台群发
  // ===========================================================================

  async getAdminNotifications(operatorId: string, query: any) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = Math.min(this.toPositiveInt(query.pageSize, 20), 100);
    const where: any = {};
    const accessibleUserIds = await this.getAccessibleUserIds(operatorId);
    if (query.userId) {
      const userId = String(query.userId);
      where.userId = accessibleUserIds === null || accessibleUserIds.includes(userId) ? userId : { in: [] };
    } else if (accessibleUserIds !== null) {
      where.userId = { in: accessibleUserIds };
    }
    if (query.regionId) where.regionId = String(query.regionId);
    if (query.type) where.type = this.toDbNotificationType(query.type) as any;
    if (query.readStatus === 'read') where.isRead = true;
    if (query.readStatus === 'unread') where.isRead = false;
    if (query.hiddenStatus === 'hidden') where.hiddenAt = { not: null };
    if (query.hiddenStatus === 'visible') where.hiddenAt = null;
    if (query.deliveryStatus) where.deliveryStatus = String(query.deliveryStatus);
    const [list, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        include: { user: { select: { id: true, nickname: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async adminBroadcast(adminId: string, dto: AdminBroadcastDto) {
    const defaultChannelMask = {
      inApp: true,
      websocket: true,
      wechatSubscribe: false,
      officialAccount: false,
      ...dto.channelMask,
    };
    const channelMask = this.channelService
      ? await this.channelService.resolveChannelMask(defaultChannelMask, 'ADMIN_BROADCAST', 'admin_broadcast')
      : defaultChannelMask;

    let userIds: string[] = [];
    const accessibleUserIds = await this.getAccessibleUserIds(adminId);

    if (dto.regionId) {
      await this.adminDataScope.assertRegionAccess(adminId, dto.regionId, '无权向该区域发送通知');
      // AUD-P1-022: 使用 regionId 精确匹配（此前错误使用 region 名称字段查询）
      const profiles = await this.prisma.userProfile.findMany({
        where: {
          regionId: dto.regionId,
          ...(accessibleUserIds === null ? {} : { userId: { in: accessibleUserIds } }),
        },
        select: { userId: true },
      });
      userIds = profiles.map((p) => p.userId);
    } else if (accessibleUserIds !== null) {
      userIds = accessibleUserIds;
    } else {
      const users = await this.prisma.user.findMany({
        select: { id: true },
      });
      userIds = users.map((u) => u.id);
    }

    if (userIds.length === 0) {
      return { success: true, taskId: null, createdCount: 0 };
    }

    const data = userIds.map((userId) => ({
      userId,
      regionId: dto.regionId || null,
      type: 'ADMIN_BROADCAST' as any,
      scene: 'admin_broadcast',
      title: dto.title,
      content: dto.content,
      data: dto.data || { operatorId: adminId },
      linkType: dto.linkType || null,
      linkValue: dto.linkValue || null,
      channelMask: channelMask as any,
      deliveryStatus: 'delivered',
      deliveryReport: {
        inApp: { status: 'success' },
        websocket: channelMask.websocket ? { status: 'attempted' } : { status: 'skipped' },
        ...(channelMask.wechatSubscribe
          ? { wechat: { status: 'queued', detail: 'see_wechat_message_logs' } }
          : {}),
      },
      deliveryAttempts: 1,
      lastDeliveryAt: new Date(),
    }));

    const result = await this.prisma.notification.createMany({ data });
    await Promise.all(userIds.map((userId) => this.clearUnreadCache(userId)));

    // 实时推送给在线用户（Socket.IO + 原生 WebSocket）
    if (channelMask.websocket) {
      const pushPayload = {
        event: 'notification',
        type: 'notification',
        data: {
          type: 'system',
          title: dto.title,
          content: dto.content,
          linkType: dto.linkType,
          linkValue: dto.linkValue,
          createdAt: new Date().toISOString(),
        },
      };

      for (const userId of userIds) {
        try {
          this.wsGateway.pushNotification(userId, pushPayload);
        } catch {
          // 推送失败不影响主流程
        }
        try {
          this.wsNative.pushToUser(userId, pushPayload);
        } catch {
          // 推送失败不影响主流程
        }
      }
    }

    return { success: true, createdCount: result.count };
  }

  // ===========================================================================
  // 订阅授权上报
  // ===========================================================================

  async recordSubscribeConsent(dto: {
    userId: string;
    templateType: string;
    templateId: string;
    status: string;
    sourceScene?: string;
  }) {
    await this.prisma.wechatSubscribeConsent.upsert({
      where: {
        userId_templateType: {
          userId: dto.userId,
          templateType: dto.templateType,
        },
      },
      create: {
        userId: dto.userId,
        templateType: dto.templateType,
        templateId: dto.templateId,
        status: dto.status,
        sourceScene: dto.sourceScene,
      },
      update: {
        templateId: dto.templateId,
        status: dto.status,
        sourceScene: dto.sourceScene,
      },
    });
    return { success: true };
  }

  // ===========================================================================
  // 微信发送日志
  // ===========================================================================

  async getWechatMessageLogs(query: {
    userId?: string;
    platformType?: string;
    templateType?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }, operatorId?: string) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = this.toPositiveInt(query.pageSize, 20);
    const where: any = {};
    if (query.userId) where.userId = query.userId;
    if (query.platformType) where.platformType = query.platformType;
    if (query.templateType) where.templateType = query.templateType;
    if (query.status) where.status = query.status;

    // 按管理员数据范围裁剪
    if (operatorId) {
      const accessibleUserIds = await this.getAccessibleUserIds(operatorId);
      if (accessibleUserIds !== null) {
        where.userId = where.userId
          ? { in: accessibleUserIds.filter(id => id === where.userId) }
          : { in: accessibleUserIds };
      }
    }

    const [list, total] = await Promise.all([
      this.prisma.wechatMessageLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.wechatMessageLog.count({ where }),
    ]);

    // 脱敏处理
    const maskedList = list.map(item => ({
      ...item,
      openid: this.maskOpenid(item.openid),
      payload: item.payload ? '[已隐藏]' : null,
    }));

    return { list: maskedList, total, page, pageSize };
  }

  async retryWechatMessage(logId: string) {
    const log = await this.prisma.wechatMessageLog.findUnique({
      where: { id: logId },
    });
    if (!log) throw new NotFoundException('日志不存在');
    if (log.status === 'success') return { success: true, message: '该消息已发送成功' };

    // 更新状态为 pending
    await this.prisma.wechatMessageLog.update({
      where: { id: logId },
      data: { status: 'pending', errorCode: null, errorMessage: null },
    });

    return { success: true, message: '已标记为待发送，等待发送服务处理' };
  }

  // ===========================================================================
  // WebSocket 在线会话
  // ===========================================================================

  async getRealtimeSessions(query: {
    platform?: string;
    online?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = this.toPositiveInt(query.pageSize, 50);
    const staleBefore = new Date(Date.now() - 90 * 1000);
    await this.prisma.realtimeSession.updateMany({
      where: {
        online: true,
        lastSeenAt: { lt: staleBefore },
      },
      data: { online: false },
    });

    const where: any = {};
    if (query.platform) where.platform = query.platform;
    if (query.online === 'true') where.online = true;
    if (query.online === 'false') where.online = false;

    const [list, total, onlineCount, adminOnlineCount, miniappOnlineCount, riderAppOnlineCount] = await Promise.all([
      this.prisma.realtimeSession.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { lastSeenAt: 'desc' },
      }),
      this.prisma.realtimeSession.count({ where }),
      this.prisma.realtimeSession.count({ where: { online: true } }),
      this.prisma.realtimeSession.count({ where: { online: true, platform: 'admin' } }),
      this.prisma.realtimeSession.count({ where: { online: true, platform: 'miniapp' } }),
      this.prisma.realtimeSession.count({ where: { online: true, platform: 'rider_app' } }),
    ]);

    const userIds = Array.from(new Set(list.map((item) => item.userId).filter(Boolean))) as string[];
    const adminIds = Array.from(new Set(list.map((item) => item.adminId).filter(Boolean))) as string[];
    const [users, admins, riders] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, nickname: true, avatar: true, phone: true, openid: true, userType: true },
        })
        : Promise.resolve([]),
      adminIds.length
        ? this.prisma.adminAccount.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, username: true, realName: true, avatar: true, phone: true, email: true },
        })
        : Promise.resolve([]),
      userIds.length
        ? this.prisma.regionRider.findMany({
          where: { userId: { in: userIds } },
          select: {
            userId: true, realName: true, phone: true, regionId: true,
            status: true, verifyStatus: true, riderType: true,
          },
        })
        : Promise.resolve([]),
    ]);
    const userMap = new Map(users.map((item) => [item.id, item]));
    const adminMap = new Map(admins.map((item) => [item.id, item]));
    const riderMap = new Map(riders.map((item) => [item.userId, item]));
    const regionIds = Array.from(new Set(riders.map((item) => item.regionId).filter(Boolean))) as string[];
    const regions = regionIds.length
      ? await this.prisma.region.findMany({ where: { id: { in: regionIds } }, select: { id: true, name: true } })
      : [];
    const regionMap = new Map(regions.map((item) => [item.id, item.name]));

    return {
      list: list.map((item) => {
        const user = item.userId ? userMap.get(item.userId) : null;
        const admin = item.adminId ? adminMap.get(item.adminId) : null;
        const rider = item.userId ? riderMap.get(item.userId) : null;
        const targetId = item.userId || item.adminId || '';
        return {
          ...item,
          socketLive: this.wsNative.isSocketLive(item.socketId),
          liveSocketCount: targetId ? this.wsNative.getLiveSocketCount(targetId) : 0,
          rider: rider
            ? {
              realName: rider.realName,
              phone: this.maskPhone(rider.phone),
              regionId: rider.regionId,
              regionName: regionMap.get(rider.regionId) || '',
              status: rider.status,
              verifyStatus: rider.verifyStatus,
              riderType: rider.riderType,
            }
            : null,
          actor: user
            ? {
              id: user.id,
              name: item.platform === 'rider_app' ? (rider?.realName || user.nickname || '未命名骑手') : (user.nickname || '未命名用户'),
              avatar: user.avatar || '',
              subtitle: rider?.phone ? this.maskPhone(rider.phone) : user.phone ? this.maskPhone(user.phone) : '',
              type: item.platform === 'rider_app' ? '官方骑手' : user.userType === 4 ? '机器人用户' : '小程序用户',
            }
            : admin
              ? {
                id: admin.id,
                name: admin.realName || admin.username,
                avatar: admin.avatar || '',
                subtitle: admin.phone ? this.maskPhone(admin.phone) : '',
                type: '后台管理员',
              }
              : {
                id: targetId,
                name: targetId || '未知连接',
                avatar: '',
                subtitle: '',
                type: item.platform === 'admin' ? '后台管理员' : item.platform === 'rider_app' ? '官方骑手' : '小程序用户',
              },
        };
      }),
      total,
      page,
      pageSize,
      stats: {
        onlineCount,
        adminOnlineCount,
        miniappOnlineCount,
        riderAppOnlineCount,
      },
    };
  }

  private async countRedisKeys(pattern: string) {
    const client = this.redis.getClient();
    let cursor = '0';
    let count = 0;
    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = nextCursor;
      count += keys.length;
    } while (cursor !== '0');
    return count;
  }

  async getRealtimeStatus() {
    const localConnections = this.wsNative.getOnlineCount();
    const localUsers = this.wsNative.getOnlineUserIds().length;
    const pushChannel = this.wsNative.getPushChannel();
    const instanceId = this.wsNative.getInstanceId();
    const dbOnlineCount = await this.prisma.realtimeSession.count({ where: { online: true } });

    let redisOk = false;
    let redisMessage = 'Redis 未连接';
    let redisOnlineSockets = 0;
    let redisOnlineUsers = 0;
    try {
      await this.redis.getClient().ping();
      redisOk = true;
      redisMessage = 'Redis 连接正常';
      [redisOnlineSockets, redisOnlineUsers] = await Promise.all([
        this.countRedisKeys('lm:ws:native:socket:*'),
        this.countRedisKeys('lm:ws:native:user:*'),
      ]);
    } catch (err: any) {
      redisMessage = err?.message || 'Redis 连接失败';
    }

    return {
      websocket: {
        enabled: true,
        nativePath: '/ws-native',
        publicPath: '/api/ws-native',
        localConnections,
        localUsers,
        dbOnlineCount,
        instanceId,
      },
      redis: {
        ok: redisOk,
        message: redisMessage,
        onlineSockets: redisOnlineSockets,
        onlineUsers: redisOnlineUsers,
        pushChannel,
        onlineSocketKeyPattern: 'lm:ws:native:socket:*',
        onlineUserKeyPattern: 'lm:ws:native:user:*',
      },
      nginx: {
        expectedApiWebSocketPath: '/api/ws-native',
        backendNativePath: '/ws-native',
        note: '客户只需要配置 https://域名/api；Nginx 需将 /api/ws-native 转发到后端 /ws-native。',
      },
      limits: {
        connect: '同一 IP 60 秒最多 60 次连接',
        send: '普通用户 10 秒最多 20 条消息，管理员 10 秒最多 60 条',
        operation: '订阅/进群/退群等操作 10 秒最多 80 次',
        maxMessageLength: 5000,
      },
      checkedAt: new Date().toISOString(),
    };
  }

  createRealtimeWsTestToken(adminId: string) {
    const token = this.jwtService.sign(
      {
        sub: adminId,
        isAdmin: true,
        purpose: 'realtime-ws-probe',
      },
      { expiresIn: '2m' },
    );
    return {
      token,
      expiresIn: 120,
      publicPath: '/api/ws-native',
      nativePath: '/ws-native',
    };
  }

  async testPushToUser(userId: string, message: string, operatorId?: string) {
    if (operatorId) {
      const accessibleUserIds = await this.getAccessibleUserIds(operatorId);
      if (accessibleUserIds !== null && !accessibleUserIds.includes(userId)) {
        throw new ForbiddenException('无权向该区域用户发送消息');
      }
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('用户不存在');

    const official = await this.getOfficialUser();
    const conversation = await this.findOrCreateOfficialConversation(userId, official.id);
    const result = await this.replyOfficialConversation(conversation.id, message, undefined, operatorId);
    return {
      ...result,
      officialUserId: official.id,
      conversationId: conversation.id,
    };
  }

  private async assertOfficialConversationAccess(conversationId: string, officialUserId: string, operatorId: string) {
    const member = await this.prisma.conversationMember.findFirst({
      where: {
        conversationId,
        userId: { not: officialUserId },
        conversation: { type: 'private', members: { some: { userId: officialUserId } } },
      },
      select: { userId: true },
    });
    if (!member) throw new NotFoundException('官方会话不存在');
    const accessibleUserIds = await this.getAccessibleUserIds(operatorId);
    if (accessibleUserIds !== null && !accessibleUserIds.includes(member.userId)) {
      throw new ForbiddenException('无权访问该区域官方会话');
    }
  }

  async getOfficialConversations(operatorId: string, query: { keyword?: string; status?: string; page?: number; pageSize?: number }) {
    const official = await this.getOfficialUser();
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = this.toPositiveInt(query.pageSize, 20);
    const where: any = {
      type: 'private',
      AND: [
        { members: { some: { userId: official.id } } },
      ],
    };
    const accessibleUserIds = await this.getAccessibleUserIds(operatorId);
    if (accessibleUserIds !== null) {
      where.AND.push({ members: { some: { userId: { in: accessibleUserIds } } } });
    }
    const keyword = String(query.keyword || '').trim();
    const status = String(query.status || '').trim();
    if (OFFICIAL_CONVERSATION_STATUSES.has(status)) where.serviceStatus = status;
    if (keyword) {
      where.AND.push({
        members: {
          some: {
            userId: { not: official.id },
            user: {
              OR: [
                { nickname: { contains: keyword } },
                { phone: { contains: keyword } },
                { openid: { contains: keyword } },
              ],
            },
          },
        },
      });
    }

    const [items, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        include: {
          members: {
            include: {
              user: { select: { id: true, nickname: true, avatar: true, phone: true, openid: true, userType: true } },
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { lastMsgTime: 'desc' },
      }),
      this.prisma.conversation.count({ where }),
    ]);

    const userIds = items.flatMap((conversation) => conversation.members.filter((member) => member.userId !== official.id).map((member) => member.userId));
    const tickets = userIds.length ? await (this.prisma as any).assistantTicket.findMany({ where: { userId: { in: userIds } }, orderBy: { updatedAt: 'desc' } }) : [];
    const latestTicketByUser = new Map<string, any>();
    tickets.forEach((ticket: any) => { if (!latestTicketByUser.has(ticket.userId)) latestTicketByUser.set(ticket.userId, ticket); });
    const list = items.map((conversation) => {
      const officialMember = conversation.members.find((member) => member.userId === official.id);
      const otherMember = conversation.members.find((member) => member.userId !== official.id);
      const user = otherMember?.user;
      const ticket = user ? latestTicketByUser.get(user.id) : null;
      return {
        id: conversation.id,
        conversationId: conversation.id,
        userId: user?.id || '',
        user: user
          ? {
            id: user.id,
            name: user.nickname || user.phone || user.openid || '未命名用户',
            avatar: user.avatar || '',
            subtitle: user.phone || user.openid || '',
            type: user.userType === 4 ? '机器人用户' : '小程序用户',
          }
          : null,
        lastMessage: parseChatMessageContent(conversation.lastMessage || '').previewText,
        rawLastMessage: conversation.lastMessage || '',
        lastMsgTime: conversation.lastMsgTime?.toISOString?.() || conversation.updatedAt?.toISOString?.(),
        unreadCount: officialMember?.unreadCount || 0,
        blocked: conversation.isBlocked,
        serviceStatus: conversation.serviceStatus || 'pending',
        serviceHandlerId: conversation.serviceHandlerId || '',
        serviceHandledAt: conversation.serviceHandledAt?.toISOString?.() || null,
        ticket: ticket ? { id: ticket.id, ticketNo: ticket.ticketNo, title: parseChatMessageContent(ticket.content || '').previewText.slice(0, 24), category: ticket.category || 'other', status: ticket.status } : null,
      };
    });

    return { list, total, page, pageSize, official };
  }

  async getOfficialConversationMessages(conversationId: string, query: { page?: number; pageSize?: number }, operatorId?: string) {
    const official = await this.getOfficialUser();
    if (operatorId) await this.assertOfficialConversationAccess(conversationId, official.id, operatorId);
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = this.toPositiveInt(query.pageSize, 30);
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        type: 'private',
        members: { some: { userId: official.id } },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, nickname: true, avatar: true, phone: true, openid: true, userType: true } },
          },
        },
      },
    });
    if (!conversation) throw new NotFoundException('官方会话不存在');
    await this.prisma.conversationMember.updateMany({
      where: { conversationId, userId: official.id },
      data: { unreadCount: 0 },
    });
    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId, isRecalled: false },
        include: { sender: { select: { id: true, nickname: true, avatar: true, userType: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.message.count({ where: { conversationId, isRecalled: false } }),
    ]);
    const userMember = conversation.members.find((member) => member.userId !== official.id);
    const messages = items.reverse().map((message) => {
      const parsed = parseChatMessageContent(message.content, message.type);
      return {
        id: message.id,
        senderId: message.senderId,
        senderName: message.sender.nickname || (message.senderId === official.id ? OFFICIAL_ASSISTANT_NAME : '用户'),
        senderAvatar: message.sender.avatar || '',
        isOfficial: message.senderId === official.id,
        content: parsed.previewText,
        rawContent: message.content,
        type: parsed.messageType,
        renderType: parsed.renderType,
        typeLabel: parsed.typeLabel,
        previewText: parsed.previewText,
        mediaUrl: parsed.mediaUrl || '',
        posterUrl: parsed.posterUrl || '',
        duration: parsed.duration,
        location: parsed.location || null,
        file: parsed.file || null,
        order: parsed.order || null,
        createdAt: message.createdAt?.toISOString?.(),
      };
    });
    return {
      conversationId,
      messages,
      total,
      page,
      pageSize,
      user: userMember?.user
        ? {
          id: userMember.user.id,
          name: userMember.user.nickname || userMember.user.phone || userMember.user.openid || '未命名用户',
          avatar: userMember.user.avatar || '',
          subtitle: userMember.user.phone || userMember.user.openid || '',
        }
        : null,
      official,
    };
  }

  async replyOfficialConversation(conversationId: string, content: string, handlerId?: string, operatorId?: string) {
    const official = await this.getOfficialUser();
    if (operatorId) await this.assertOfficialConversationAccess(conversationId, official.id, operatorId);
    const message = String(content || '').trim();
    if (!message) throw new BadRequestException('消息内容不能为空');
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        type: 'private',
        members: { some: { userId: official.id } },
      },
      include: { members: true },
    });
    if (!conversation) throw new NotFoundException('官方会话不存在');
    if (conversation.isBlocked) throw new BadRequestException('该会话已被禁用');
    const receiver = conversation.members.find((member) => member.userId !== official.id);
    if (!receiver) throw new BadRequestException('会话缺少接收用户');

    const saved = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: official.id,
        type: 'TEXT',
        content: message,
      },
    });
    await Promise.all([
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessage: message,
          lastMsgTime: saved.createdAt,
          ...(handlerId ? { serviceStatus: 'processing', serviceHandlerId: handlerId, serviceHandledAt: null } : {}),
        },
      }),
      this.prisma.conversationMember.updateMany({
        where: { conversationId, userId: receiver.userId },
        data: { unreadCount: { increment: 1 } },
      }),
    ]);
    const activeTicket = await (this.prisma as any).assistantTicket.findFirst({
      where: { userId: receiver.userId, status: { in: ['pending', 'processing', 'waiting_user'] } },
      orderBy: { updatedAt: 'desc' },
    });
    if (activeTicket) {
      await (this.prisma as any).assistantTicketReply.create({ data: { ticketId: activeTicket.id, senderType: 'admin', senderId: handlerId || official.id, content: message } });
      await (this.prisma as any).assistantTicket.update({ where: { id: activeTicket.id }, data: { latestReply: message, unreadForUser: true, ...(handlerId ? { status: 'processing', handlerId } : {}) } });
    }
    await this.clearUnreadCache(receiver.userId);
    const unreadSummary = await this.getUnreadSummary(receiver.userId);
    const unreadPayload = { event: 'unreadSummary', type: 'unreadSummary', data: unreadSummary };
    const deliveredCount = this.wsNative.pushToUser(receiver.userId, {
      event: 'message',
      type: 'message',
      conversationId,
      messageId: saved.id,
      senderId: official.id,
      receiverId: receiver.userId,
      message,
      messageType: 'text',
      sender_avatar: official.avatar,
      sender_nickname: official.nickname,
      timestamp: saved.createdAt.toISOString(),
    });
    this.wsGateway.pushNotification(receiver.userId, unreadPayload);
    this.wsNative.pushToUser(receiver.userId, unreadPayload);
    return {
      success: true,
      messageId: saved.id,
      deliveredCount,
      message: deliveredCount > 0 ? '官方回复已发送' : '官方回复已保存，用户当前离线',
    };
  }

  async updateOfficialConversationStatus(conversationId: string, status: string, handlerId: string, content?: string) {
    const normalizedStatus = String(status || '').trim();
    if (!OFFICIAL_CONVERSATION_STATUSES.has(normalizedStatus)) {
      throw new BadRequestException('无效的咨询状态');
    }
    const statusText = OFFICIAL_CONVERSATION_STATUS_TEXT[normalizedStatus];
    const resolution = String(content || '').trim();
    if (['waiting_user', 'resolved', 'rejected'].includes(normalizedStatus) && !resolution) {
      throw new BadRequestException('请填写给用户的处理说明后再更新状态');
    }
    await this.replyOfficialConversation(
      conversationId,
      resolution || `你的咨询状态已更新为：${statusText}`,
      handlerId,
      handlerId,
    );
    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        serviceStatus: normalizedStatus,
        serviceHandlerId: handlerId,
        serviceHandledAt: ['resolved', 'rejected'].includes(normalizedStatus) ? new Date() : null,
      },
    });
    const userMember = await this.prisma.conversationMember.findFirst({ where: { conversationId, userId: { not: (await this.getOfficialUser()).id } } });
    if (userMember) {
      const ticketStatus = normalizedStatus === 'rejected' ? 'closed' : normalizedStatus;
      const ticket = await (this.prisma as any).assistantTicket.findFirst({ where: { userId: userMember.userId, status: { in: ['pending', 'processing', 'waiting_user'] } }, orderBy: { updatedAt: 'desc' } });
      if (ticket) await (this.prisma as any).assistantTicket.update({ where: { id: ticket.id }, data: { status: ticketStatus, handlerId, unreadForUser: true } });
    }
    return { success: true, status: normalizedStatus, statusText, conversation: updated };
  }

  // ===========================================================================
  // 通知总览统计
  // ===========================================================================

  async getNotifyStats(operatorId?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 按管理员数据范围裁剪通知统计
    const scopeWhere: any = {};
    if (operatorId) {
      const accessibleUserIds = await this.getAccessibleUserIds(operatorId);
      if (accessibleUserIds !== null) {
        scopeWhere.userId = { in: accessibleUserIds };
      }
    }

    const externalScope = scopeWhere.userId ? { userId: scopeWhere.userId } : {};
    const [
      total,
      todayNotifications,
      unread,
      hidden,
      partial,
      pending,
      exhausted,
      todayWechatSuccess,
      todayWechatFailed,
      onlineCount,
    ] = await Promise.all([
      this.prisma.notification.count({ where: scopeWhere }),
      this.prisma.notification.count({ where: { ...scopeWhere, createdAt: { gte: today } } }),
      this.prisma.notification.count({ where: { ...scopeWhere, isRead: false, hiddenAt: null } }),
      this.prisma.notification.count({ where: { ...scopeWhere, hiddenAt: { not: null } } }),
      this.prisma.notification.count({ where: { ...scopeWhere, deliveryStatus: 'partial' } }),
      this.prisma.notification.count({ where: { ...scopeWhere, deliveryStatus: 'pending' } }),
      this.prisma.notification.count({ where: { ...scopeWhere, deliveryStatus: 'partial', deliveryAttempts: { gte: 3 } } }),
      this.prisma.wechatMessageLog.count({ where: { ...externalScope, status: 'success', sentAt: { gte: today } } }),
      this.prisma.wechatMessageLog.count({ where: { ...externalScope, status: 'failed', createdAt: { gte: today } } }),
      this.prisma.realtimeSession.count({ where: { ...externalScope, online: true } }),
    ]);

    return {
      total,
      today: todayNotifications,
      unread,
      hidden,
      partial,
      pending,
      exhausted,
      todayNotifications,
      todayWechatMessages: todayWechatSuccess,
      todayWechatFailed,
      onlineCount,
    };
  }

  // ===========================================================================
  // 订阅授权记录
  // ===========================================================================

  async getSubscribeConsents(
    query: {
      userId?: string;
      templateType?: string;
      status?: string;
      page?: number;
      pageSize?: number;
    },
    operatorId?: string,
  ) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = this.toPositiveInt(query.pageSize, 20);
    const where: any = {};
    if (query.userId) where.userId = query.userId;
    if (query.templateType) where.templateType = query.templateType;
    if (query.status) where.status = query.status;

    // AUD-P1-171: 按管理员数据范围裁剪（通过用户区域关联）
    if (operatorId) {
      const accessibleUserIds = await this.getAccessibleUserIds(operatorId);
      if (accessibleUserIds !== null) {
        where.userId = where.userId
          ? { in: accessibleUserIds.filter(id => id === where.userId) }
          : { in: accessibleUserIds };
      }
    }

    const [list, total] = await Promise.all([
      this.prisma.wechatSubscribeConsent.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.wechatSubscribeConsent.count({ where }),
    ]);

    // AUD-P1-171: 脱敏处理
    const maskedList = list.map(item => ({
      ...item,
      templateId: this.maskString(item.templateId),
    }));

    return { list: maskedList, total, page, pageSize };
  }

  // ===========================================================================
  // 公众号绑定管理
  // ===========================================================================

  async getOfficialBindings(
    query: {
      userId?: string;
      subscribe?: boolean;
      page?: number;
      pageSize?: number;
    },
    operatorId?: string,
  ) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = this.toPositiveInt(query.pageSize, 20);
    const where: any = {};
    if (query.userId) where.userId = query.userId;
    if (query.subscribe !== undefined) where.subscribe = query.subscribe;

    // AUD-P1-171: 按管理员数据范围裁剪
    if (operatorId) {
      const accessibleUserIds = await this.getAccessibleUserIds(operatorId);
      if (accessibleUserIds !== null) {
        where.userId = where.userId
          ? { in: accessibleUserIds.filter(id => id === where.userId) }
          : { in: accessibleUserIds };
      }
    }

    const [list, total] = await Promise.all([
      this.prisma.wechatOfficialBinding.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.wechatOfficialBinding.count({ where }),
    ]);

    // AUD-P1-171: OpenID/UnionID 脱敏
    const maskedList = list.map(item => ({
      ...item,
      officialOpenid: this.maskOpenid(item.officialOpenid),
      unionid: item.unionid ? this.maskOpenid(item.unionid) : null,
    }));

    return { list: maskedList, total, page, pageSize };
  }

  async deleteOfficialBinding(id: string, operatorId?: string, ip?: string) {
    const binding = await this.prisma.wechatOfficialBinding.findUnique({ where: { id } });
    if (!binding) throw new NotFoundException('绑定记录不存在');

    // AUD-P1-171: 检查管理员是否有权限操作该绑定
    if (operatorId) {
      const accessibleUserIds = await this.getAccessibleUserIds(operatorId);
      if (accessibleUserIds !== null && !accessibleUserIds.includes(binding.userId)) {
        throw new BadRequestException('无权操作该用户的绑定');
      }
    }

    await this.prisma.wechatOfficialBinding.delete({ where: { id } });

    // AUD-P1-171: 写操作日志
    if (operatorId) {
      await this.prisma.adminOperationLog.create({
        data: {
          accountId: operatorId,
          action: 'UNBIND_WECHAT',
          module: 'notification',
          targetId: id,
          targetType: 'wechat_official_binding',
          detail: {
            userId: binding.userId,
            openid: this.maskOpenid(binding.officialOpenid),
          },
          ip: ip || null,
        },
      }).catch(() => {});
    }

    return { success: true };
  }

  /**
   * AUD-P1-171: 获取管理员可访问的用户 ID 列表
   * 返回 null 表示超级管理员，可访问所有用户
   */
  private async getAccessibleUserIds(operatorId: string): Promise<string[] | null> {
    try {
      const ctx = await this.adminDataScope.getAdminContext(operatorId);

      // 超级管理员可访问所有用户
      if (ctx.isSuperAdmin) return null;

      // 如果没有区域限制，返回空数组（无权限）
      if (ctx.regionIds.length === 0) return [];

      // 获取这些区域内的用户
      const users = await this.prisma.user.findMany({
        where: {
          profile: {
            regionId: { in: ctx.regionIds },
          },
        },
        select: { id: true },
      });

      return users.map(u => u.id);
    } catch {
      return [];
    }
  }

  /**
   * AUD-P1-171: OpenID 脱敏
   */
  private maskOpenid(openid: string | null): string {
    if (!openid) return '';
    if (openid.length <= 8) return '***';
    return openid.slice(0, 4) + '****' + openid.slice(-4);
  }

  /**
   * AUD-P1-171: 通用字符串脱敏
   */
  private maskString(value: string | null): string {
    if (!value) return '';
    if (value.length <= 6) return '***';
    return value.slice(0, 3) + '***' + value.slice(-3);
  }

  /**
   * 手机号脱敏
   */
  private maskPhone(phone: string | null): string {
    if (!phone) return '';
    if (phone.length < 7) return '***';
    return phone.slice(0, 3) + '****' + phone.slice(-4);
  }

  // ===========================================================================
  // 区域推送 & 全站广播
  // ===========================================================================

  async pushToRegion(regionId: string, payload: any) {
    this.wsNative.pushToRegion(regionId, payload);
    return { success: true };
  }

  async broadcastToAll(payload: any) {
    this.wsNative.broadcast(payload);
    return { success: true };
  }
}
