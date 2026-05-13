import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { MessageGateway } from '../websocket/message.gateway';
import { WsNativeGateway } from '../websocket/ws-native.gateway';
import {
  CreateNotificationDto,
  AdminBroadcastDto,
} from './dto/create-notification.dto';
import {
  NotificationQueryDto,
  MarkAllReadDto,
} from './dto/notification-query.dto';

@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly wsGateway: MessageGateway,
    private readonly wsNative: WsNativeGateway,
  ) {}

  private toPositiveInt(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private toDbNotificationType(type?: string) {
    const key = String(type || 'SYSTEM').trim().toLowerCase();
    const map: Record<string, string> = {
      system: 'SYSTEM',
      admin_broadcast: 'ADMIN_BROADCAST',
      announcement: 'ANNOUNCEMENT',
      reply: 'REPLY',
      comment: 'COMMENT',
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
      system: ['SYSTEM', 'ADMIN_BROADCAST', 'ANNOUNCEMENT'],
      comment: ['COMMENT', 'REPLY'],
      message: ['MESSAGE', 'CIRCLE'],
    };
    return groups[key] || [this.toDbNotificationType(key)];
  }

  private toClientNotificationType(type?: string) {
    const key = String(type || 'SYSTEM').toUpperCase();
    if (key === 'ADMIN_BROADCAST' || key === 'ANNOUNCEMENT') return 'system';
    if (key === 'REPLY') return 'comment';
    if (key === 'CIRCLE') return 'message';
    return key.toLowerCase();
  }

  private async getOfficialUser() {
    return this.prisma.user.upsert({
      where: { openid: 'lingmeng_official_message_account' },
      create: {
        openid: 'lingmeng_official_message_account',
        nickname: '官方推送消息',
        avatar: '/static/logo.jpg',
        userType: 4,
      },
      update: {
        nickname: '官方推送消息',
        avatar: '/static/logo.jpg',
        userType: 4,
      },
      select: { id: true, nickname: true, avatar: true },
    });
  }

  private async findOrCreateOfficialConversation(userId: string, officialUserId: string) {
    let conversation = await this.prisma.conversation.findFirst({
      where: {
        type: 'private',
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: officialUserId } } },
        ],
      },
    });
    if (conversation) return conversation;

    conversation = await this.prisma.conversation.create({
      data: {
        type: 'private',
        title: '官方推送消息',
        avatar: '/static/logo.jpg',
        members: {
          create: [
            { userId },
            { userId: officialUserId, role: 'admin', nickName: '官方推送消息' },
          ],
        },
      },
    });
    return conversation;
  }

  // ===========================================================================
  // 创建并分发通知（核心入口）
  // ===========================================================================

  async createAndDispatch(dto: CreateNotificationDto) {
    const channelMask = {
      inApp: true,
      websocket: true,
      wechatSubscribe: false,
      officialAccount: false,
      ...dto.channelMask,
    };

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

    // 2. 计算未读数
    const unreadSummary = await this.getUnreadSummary(dto.userId, dto.regionId);

    // 3. WebSocket 推送（Socket.IO + 原生 WebSocket 双推）
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

      try {
        this.wsGateway.pushNotification(dto.userId, pushPayload);
        this.wsGateway.pushNotification(dto.userId, unreadPayload);
      } catch (err: any) {
        this.logger.warn(`Socket.IO push failed: ${err.message}`);
      }

      try {
        this.wsNative.pushToUser(dto.userId, pushPayload);
        this.wsNative.pushToUser(dto.userId, unreadPayload);
      } catch (err: any) {
        this.logger.warn(`Native WS push failed: ${err.message}`);
      }
    }

    return notification;
  }

  // ===========================================================================
  // 获取通知中心列表（兼容新旧格式）
  // ===========================================================================

  async getCenterList(userId: string, query: NotificationQueryDto) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = this.toPositiveInt(query.pageSize, 20);
    const where: any = { userId };
    const typeFilter = this.getNotificationTypeFilter(query.type);
    if (typeFilter) where.type = typeFilter.length === 1 ? typeFilter[0] : { in: typeFilter };
    if (query.regionId) {
      where.OR = [
        { regionId: query.regionId },
        { regionId: null },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);

    const formatted = items.map((n) => ({
      id: n.id,
      notification_id: n.id,
      notification_type: this.toClientNotificationType(n.type),
      notification_title: n.title,
      notification_content: n.content,
      type: this.toClientNotificationType(n.type),
      scene: n.scene,
      title: n.title,
      content: n.content,
      data: n.data,
      linkType: n.linkType,
      linkValue: n.linkValue,
      isRead: n.isRead,
      is_read: n.isRead,
      readAt: n.readAt,
      notification_time: n.createdAt?.toISOString(),
      createdAt: n.createdAt?.toISOString(),
      updatedAt: n.updatedAt?.toISOString(),
    }));

    return {
      notifications: formatted,
      list: formatted,
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    };
  }

  // ===========================================================================
  // 获取未读汇总
  // ===========================================================================

  async getUnreadSummary(userId: string, regionId?: string) {
    const where: any = { userId, isRead: false };
    if (regionId) where.regionId = regionId;

    const notifications = await this.prisma.notification.findMany({
      where,
      select: { type: true },
    });

    const counts: Record<string, number> = {
      like: 0,
      comment: 0,
      reply: 0,
      follow: 0,
      squat: 0,
      message: 0,
      system: 0,
      order: 0,
      delivery: 0,
      refund: 0,
      certification: 0,
      merchant: 0,
      announcement: 0,
    };

    for (const n of notifications) {
      const key = this.toClientNotificationType(n.type);
      if (key in counts) counts[key]++;
      else if (key === 'wallet') counts.system++;
    }

    const total = notifications.length;

    return {
      total,
      unreadCount: total,
      unreadCounts: counts,
    };
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
    }
    return { success: true };
  }

  async markAllRead(userId: string, query: MarkAllReadDto) {
    const where: any = { userId, isRead: false };
    if (query.type) where.type = query.type;
    if (query.regionId) where.regionId = query.regionId;

    const result = await this.prisma.notification.updateMany({
      where,
      data: { isRead: true, readAt: new Date() },
    });

    return { success: true, affected: result.count };
  }

  // ===========================================================================
  // 删除通知
  // ===========================================================================

  async deleteNotification(userId: string, notificationId: string) {
    await this.prisma.notification.deleteMany({
      where: { id: notificationId, userId },
    });
    return { success: true };
  }

  // ===========================================================================
  // 后台群发
  // ===========================================================================

  async adminBroadcast(adminId: string, dto: AdminBroadcastDto) {
    const channelMask = {
      inApp: true,
      websocket: true,
      wechatSubscribe: false,
      officialAccount: false,
      ...dto.channelMask,
    };

    let userIds: string[] = [];

    if (dto.regionId) {
      const profiles = await this.prisma.userProfile.findMany({
        where: { region: dto.regionId },
        select: { userId: true },
      });
      userIds = profiles.map((p) => p.userId);
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
    }));

    const result = await this.prisma.notification.createMany({ data });

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
  }) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = this.toPositiveInt(query.pageSize, 20);
    const where: any = {};
    if (query.userId) where.userId = query.userId;
    if (query.platformType) where.platformType = query.platformType;
    if (query.templateType) where.templateType = query.templateType;
    if (query.status) where.status = query.status;

    const [list, total] = await Promise.all([
      this.prisma.wechatMessageLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.wechatMessageLog.count({ where }),
    ]);

    return { list, total, page, pageSize };
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

    const [list, total, onlineCount, adminOnlineCount, miniappOnlineCount] = await Promise.all([
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
    ]);

    const userIds = Array.from(new Set(list.map((item) => item.userId).filter(Boolean))) as string[];
    const adminIds = Array.from(new Set(list.map((item) => item.adminId).filter(Boolean))) as string[];
    const [users, admins] = await Promise.all([
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
    ]);
    const userMap = new Map(users.map((item) => [item.id, item]));
    const adminMap = new Map(admins.map((item) => [item.id, item]));

    return {
      list: list.map((item) => {
        const user = item.userId ? userMap.get(item.userId) : null;
        const admin = item.adminId ? adminMap.get(item.adminId) : null;
        const targetId = item.userId || item.adminId || '';
        return {
          ...item,
          socketLive: this.wsNative.isSocketLive(item.socketId),
          liveSocketCount: targetId ? this.wsNative.getLiveSocketCount(targetId) : 0,
          actor: user
            ? {
              id: user.id,
              name: user.nickname || user.phone || user.openid || '未命名用户',
              avatar: user.avatar || '',
              subtitle: user.phone || user.openid || '',
              type: user.userType === 4 ? '机器人用户' : '小程序用户',
            }
            : admin
              ? {
                id: admin.id,
                name: admin.realName || admin.username,
                avatar: admin.avatar || '',
                subtitle: admin.phone || admin.email || admin.username,
                type: '后台管理员',
              }
              : {
                id: targetId,
                name: targetId || '未知连接',
                avatar: '',
                subtitle: '',
                type: item.platform === 'admin' ? '后台管理员' : '小程序用户',
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
      },
    };
  }

  async testPushToUser(userId: string, message: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('用户不存在');

    const official = await this.getOfficialUser();
    const conversation = await this.findOrCreateOfficialConversation(userId, official.id);
    const officialMessage = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: official.id,
        type: 'TEXT',
        content: message,
      },
    });
    await Promise.all([
      this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          title: '官方推送消息',
          avatar: '/static/logo.jpg',
          lastMessage: message,
          lastMsgTime: officialMessage.createdAt,
        },
      }),
      this.prisma.conversationMember.updateMany({
        where: { conversationId: conversation.id, userId },
        data: { unreadCount: { increment: 1 } },
      }),
    ]);

    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type: 'SYSTEM' as any,
        scene: 'official_message',
        title: '官方推送消息',
        content: message,
        data: {
          source: 'official_message',
          officialUserId: official.id,
          conversationId: conversation.id,
          messageId: officialMessage.id,
        },
        linkType: 'official_chat',
        linkValue: official.id,
        channelMask: {
          inApp: true,
          websocket: true,
          wechatSubscribe: false,
          officialAccount: false,
        },
      },
    });
    const unreadSummary = await this.getUnreadSummary(userId);
    const payload = {
      event: 'notification',
      type: 'notification',
      data: {
        id: notification.id,
        type: 'system',
        scene: notification.scene,
        title: '官方推送消息',
        content: message,
        message,
        linkType: notification.linkType,
        linkValue: notification.linkValue,
        officialUserId: official.id,
        officialName: official.nickname,
        officialAvatar: official.avatar,
        conversationId: conversation.id,
        createdAt: notification.createdAt?.toISOString(),
      },
    };
    const messagePayload = {
      event: 'message',
      type: 'message',
      conversationId: conversation.id,
      messageId: officialMessage.id,
      senderId: official.id,
      receiverId: userId,
      message,
      messageType: 'text',
      sender_avatar: official.avatar,
      sender_nickname: official.nickname,
      timestamp: officialMessage.createdAt.toISOString(),
    };
    const unreadPayload = { event: 'unreadSummary', data: unreadSummary };
    try {
      this.wsGateway.pushNotification(userId, payload);
      const deliveredCount = this.wsNative.pushToUser(userId, payload);
      this.wsNative.pushToUser(userId, messagePayload);
      this.wsGateway.pushNotification(userId, unreadPayload);
      this.wsNative.pushToUser(userId, unreadPayload);
      return {
        success: true,
        notificationId: notification.id,
        officialUserId: official.id,
        conversationId: conversation.id,
        deliveredCount,
        message: deliveredCount > 0
          ? `官方消息已保存，并推送到 ${deliveredCount} 个真实在线连接`
          : '官方消息已保存，用户当前没有真实在线 WebSocket 连接',
      };
    } catch (err: any) {
      return {
        success: true,
        notificationId: notification.id,
        officialUserId: official.id,
        conversationId: conversation.id,
        deliveredCount: 0,
        message: `官方消息已保存，实时推送失败：${err.message}`,
      };
    }
  }

  async getOfficialConversations(query: { keyword?: string; page?: number; pageSize?: number }) {
    const official = await this.getOfficialUser();
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = this.toPositiveInt(query.pageSize, 20);
    const where: any = {
      type: 'private',
      AND: [
        { members: { some: { userId: official.id } } },
      ],
    };
    const keyword = String(query.keyword || '').trim();
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

    const list = items.map((conversation) => {
      const officialMember = conversation.members.find((member) => member.userId === official.id);
      const otherMember = conversation.members.find((member) => member.userId !== official.id);
      const user = otherMember?.user;
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
        lastMessage: conversation.lastMessage || '',
        lastMsgTime: conversation.lastMsgTime?.toISOString?.() || conversation.updatedAt?.toISOString?.(),
        unreadCount: officialMember?.unreadCount || 0,
        blocked: conversation.isBlocked,
      };
    });

    return { list, total, page, pageSize, official };
  }

  async getOfficialConversationMessages(conversationId: string, query: { page?: number; pageSize?: number }) {
    const official = await this.getOfficialUser();
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
    const messages = items.reverse().map((message) => ({
      id: message.id,
      senderId: message.senderId,
      senderName: message.sender.nickname || (message.senderId === official.id ? '官方推送消息' : '用户'),
      senderAvatar: message.sender.avatar || '',
      isOfficial: message.senderId === official.id,
      content: message.content,
      type: String(message.type || 'TEXT').toLowerCase(),
      createdAt: message.createdAt?.toISOString?.(),
    }));
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

  async replyOfficialConversation(conversationId: string, content: string) {
    const official = await this.getOfficialUser();
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
        data: { lastMessage: message, lastMsgTime: saved.createdAt },
      }),
      this.prisma.conversationMember.updateMany({
        where: { conversationId, userId: receiver.userId },
        data: { unreadCount: { increment: 1 } },
      }),
    ]);
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
    return {
      success: true,
      messageId: saved.id,
      deliveredCount,
      message: deliveredCount > 0 ? '官方回复已发送' : '官方回复已保存，用户当前离线',
    };
  }

  // ===========================================================================
  // 通知总览统计
  // ===========================================================================

  async getNotifyStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      todayNotifications,
      todayWechatSuccess,
      todayWechatFailed,
      onlineCount,
    ] = await Promise.all([
      this.prisma.notification.count({ where: { createdAt: { gte: today } } }),
      this.prisma.wechatMessageLog.count({ where: { status: 'success', sentAt: { gte: today } } }),
      this.prisma.wechatMessageLog.count({ where: { status: 'failed', createdAt: { gte: today } } }),
      this.prisma.realtimeSession.count({ where: { online: true } }),
    ]);

    return {
      todayNotifications,
      todayWechatMessages: todayWechatSuccess,
      todayWechatFailed,
      onlineCount,
    };
  }

  // ===========================================================================
  // 订阅授权记录
  // ===========================================================================

  async getSubscribeConsents(query: {
    userId?: string;
    templateType?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = this.toPositiveInt(query.pageSize, 20);
    const where: any = {};
    if (query.userId) where.userId = query.userId;
    if (query.templateType) where.templateType = query.templateType;
    if (query.status) where.status = query.status;

    const [list, total] = await Promise.all([
      this.prisma.wechatSubscribeConsent.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.wechatSubscribeConsent.count({ where }),
    ]);

    return { list, total, page, pageSize };
  }

  // ===========================================================================
  // 公众号绑定管理
  // ===========================================================================

  async getOfficialBindings(query: {
    userId?: string;
    subscribe?: boolean;
    page?: number;
    pageSize?: number;
  }) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = this.toPositiveInt(query.pageSize, 20);
    const where: any = {};
    if (query.userId) where.userId = query.userId;
    if (query.subscribe !== undefined) where.subscribe = query.subscribe;

    const [list, total] = await Promise.all([
      this.prisma.wechatOfficialBinding.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.wechatOfficialBinding.count({ where }),
    ]);

    return { list, total, page, pageSize };
  }

  async deleteOfficialBinding(id: string) {
    const binding = await this.prisma.wechatOfficialBinding.findUnique({ where: { id } });
    if (!binding) throw new NotFoundException('绑定记录不存在');
    await this.prisma.wechatOfficialBinding.delete({ where: { id } });
    return { success: true };
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
