import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { parseChatMessageContent } from '../../common/utils/chat-message.util';
import { PrivateMessagePermissionService } from '../../common/services/private-message-permission.service';
import { WsNativeGateway } from '../websocket/ws-native.gateway';
import { RedisService } from '../../common/services/redis.service';

const OFFICIAL_ASSISTANT_NAME = '校园小助手';
const OFFICIAL_ASSISTANT_AVATAR = '/static/logo.png';

@Injectable()
export class MessageService {
  private readonly onlineWindowMs = 3 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly privateMessagePermission: PrivateMessagePermissionService,
    private readonly wsNative: WsNativeGateway,
    private readonly redis: RedisService,
  ) {}

  private readonly officialOpenid = 'lingmeng_official_message_account';
  private readonly adminSearchMessageTypes = new Set(['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'FILE', 'LOCATION', 'SYSTEM']);

  private dateText(value: any) {
    return value?.toISOString?.() || value || null;
  }

  private async clearUnreadSummaryCache(userId: string) {
    await this.redis.delPattern(`notify:unread:${userId}:*`).catch(() => undefined);
  }

  private messageTypeLabel(type: any) {
    return parseChatMessageContent('', type).typeLabel || '其他消息';
  }

  private messageContentText(message: any) {
    if (!message) return '';
    if (message.isRecalled) return '这条消息已撤回';
    return parseChatMessageContent(message.content, message.type).previewText || this.messageTypeLabel(message.type);
  }

  private toAdminMember(member: any) {
    const user = member.user || {};
    return {
      id: member.id,
      userId: user.id || member.userId,
      uid: user.uid,
      publicUid: user.publicUid,
      name: user.nickname || user.phone || user.openid || user.id || '未知用户',
      avatar: user.avatar || '',
      phone: user.phone || '',
      openid: user.openid || '',
      status: user.status || '',
      userType: user.userType,
      unreadCount: member.unreadCount || 0,
      isMuted: !!member.isMuted,
      joinedAt: this.dateText(member.joinedAt),
    };
  }

  private toAdminConversation(conversation: any) {
    const members = (conversation.members || []).map((member: any) => this.toAdminMember(member));
    const latestMessage = conversation.messages?.[0];
    const lastMessage = latestMessage || {
      type: 'TEXT',
      content: conversation.lastMessage || '',
      isRecalled: false,
      createdAt: conversation.lastMsgTime,
    };
    const participantText = members.map((member: any) => member.name).filter(Boolean).join(' 与 ') || '未知会话';
    const parsed = parseChatMessageContent(lastMessage.content, lastMessage.type);

    return {
      id: conversation.id,
      conversationId: conversation.id,
      participantText,
      participants: members,
      lastMessage: lastMessage.isRecalled ? '这条消息已撤回' : parsed.previewText,
      lastMessageType: parsed.messageType,
      lastMessageTypeLabel: parsed.typeLabel,
      lastMsgTime: this.dateText(conversation.lastMsgTime || lastMessage.createdAt || conversation.updatedAt),
      messageCount: conversation._count?.messages || 0,
      unreadCount: conversation.unreadCount || 0,
      isBlocked: !!conversation.isBlocked,
      blocked: !!conversation.isBlocked,
      statusLabel: conversation.isBlocked ? '已屏蔽' : '正常',
      createdAt: this.dateText(conversation.createdAt),
      updatedAt: this.dateText(conversation.updatedAt),
    };
  }

  private toAdminMessage(message: any) {
    const parsed = parseChatMessageContent(message.content, message.type);
    return {
      id: message.id,
      messageId: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderName: message.sender?.nickname || message.sender?.phone || message.sender?.openid || message.senderId,
      senderAvatar: message.sender?.avatar || '',
      senderPhone: message.sender?.phone || '',
      type: parsed.messageType,
      renderType: parsed.renderType,
      typeLabel: parsed.typeLabel,
      content: message.isRecalled ? '这条消息已撤回' : parsed.previewText,
      rawContent: message.content || '',
      previewText: message.isRecalled ? '这条消息已撤回' : parsed.previewText,
      mediaUrl: parsed.mediaUrl || '',
      posterUrl: parsed.posterUrl || '',
      duration: parsed.duration,
      location: parsed.location || null,
      file: parsed.file || null,
      order: parsed.order || null,
      extra: message.extra,
      isRecalled: !!message.isRecalled,
      recalledAt: this.dateText(message.recalledAt),
      readCount: message.readCount || 0,
      createdAt: this.dateText(message.createdAt),
    };
  }

  private privateUserConversationWhere(extra: any = {}) {
    return {
      type: 'private',
      AND: [
        { members: { none: { user: { userType: 4 } } } },
        ...(extra.AND || []),
      ],
      ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== 'AND')),
    };
  }

  private async getOfficialUser() {
    return this.prisma.user.upsert({
      where: { openid: this.officialOpenid },
      create: {
        openid: this.officialOpenid,
        nickname: OFFICIAL_ASSISTANT_NAME,
        avatar: OFFICIAL_ASSISTANT_AVATAR,
        userType: 4,
      },
      update: {
        nickname: OFFICIAL_ASSISTANT_NAME,
        avatar: OFFICIAL_ASSISTANT_AVATAR,
        userType: 4,
      },
      select: { id: true, nickname: true, avatar: true, userType: true },
    });
  }

  private async findPrivateConversation(userId: string, targetId: string) {
    return this.prisma.conversation.findFirst({
      where: {
        type: 'private',
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: targetId } } },
        ],
      },
    });
  }

  private async refreshConversationLastMessage(conversationId: string) {
    const latest = await this.prisma.message.findFirst({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      select: { content: true, type: true, isRecalled: true, createdAt: true },
    });
    if (!latest) return;
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessage: latest.isRecalled ? '这条消息已撤回' : this.messageContentText(latest),
        lastMsgTime: latest.createdAt,
      },
    });
  }

  async getAdminPrivateConversations(query: any) {
    const page = Math.max(Number(query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || query.limit) || 20, 1), 100);
    const keyword = String(query.keyword || '').trim();
    const blocked = String(query.blocked ?? '').trim();
    const rawMessageType = String(query.messageType || '').trim().toUpperCase();
    const messageType = this.adminSearchMessageTypes.has(rawMessageType) ? rawMessageType : '';
    const lastMsgStart = String(query.lastMsgStart || query.startDate || '').trim();
    const lastMsgEnd = String(query.lastMsgEnd || query.endDate || '').trim();
    const and: any[] = [];

    if (keyword) {
      const numericKeyword = Number(keyword);
      and.push({
        OR: [
          { title: { contains: keyword } },
          { lastMessage: { contains: keyword } },
          { messages: { some: { content: { contains: keyword } } } },
          { members: { some: { user: { id: { contains: keyword } } } } },
          { members: { some: { user: { nickname: { contains: keyword } } } } },
          { members: { some: { user: { phone: { contains: keyword } } } } },
          { members: { some: { user: { openid: { contains: keyword } } } } },
          ...(Number.isSafeInteger(numericKeyword)
            ? [
                { members: { some: { user: { uid: numericKeyword } } } },
                { members: { some: { user: { publicUid: numericKeyword } } } },
              ]
            : []),
        ],
      });
    }
    if (messageType) {
      and.push({ messages: { some: { type: messageType as any } } });
    }
    if (lastMsgStart || lastMsgEnd) {
      const lastMsgTime: any = {};
      if (lastMsgStart) lastMsgTime.gte = new Date(lastMsgStart);
      if (lastMsgEnd) lastMsgTime.lte = new Date(lastMsgEnd);
      and.push({ lastMsgTime });
    }

    const where: any = this.privateUserConversationWhere(and.length ? { AND: and } : {});
    if (blocked === 'true') where.isBlocked = true;
    if (blocked === 'false') where.isBlocked = false;

    const baseWhere: any = this.privateUserConversationWhere();
    const [items, total, allCount, blockedCount, messageCount] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          members: {
            orderBy: { joinedAt: 'asc' },
            include: {
              user: {
                select: {
                  id: true,
                  uid: true,
                  publicUid: true,
                  nickname: true,
                  avatar: true,
                  phone: true,
                  openid: true,
                  status: true,
                  userType: true,
                },
              },
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              sender: { select: { id: true, nickname: true, avatar: true, phone: true, openid: true } },
            },
          },
          _count: { select: { messages: true } },
        },
        orderBy: [{ lastMsgTime: 'desc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.count({ where: baseWhere }),
      this.prisma.conversation.count({ where: { ...baseWhere, isBlocked: true } }),
      this.prisma.message.count({ where: { conversation: { is: baseWhere } } }),
    ]);

    return {
      list: items.map((item) => this.toAdminConversation(item)),
      total,
      page,
      pageSize,
      stats: {
        totalConversations: allCount,
        blockedConversations: blockedCount,
        normalConversations: Math.max(allCount - blockedCount, 0),
        totalMessages: messageCount,
      },
    };
  }

  async getAdminPrivateConversationMessages(conversationId: string, query: any) {
    const page = Math.max(Number(query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || query.limit) || 50, 1), 100);
    const keyword = String(query.keyword || '').trim();
    const rawMessageType = String(query.messageType || '').trim().toUpperCase();
    const messageType = this.adminSearchMessageTypes.has(rawMessageType) ? rawMessageType : '';
    const conversation = await this.prisma.conversation.findFirst({
      where: this.privateUserConversationWhere({ id: conversationId }),
      include: {
        members: {
          orderBy: { joinedAt: 'asc' },
          include: {
            user: {
              select: {
                id: true,
                uid: true,
                publicUid: true,
                nickname: true,
                avatar: true,
                phone: true,
                openid: true,
                status: true,
                userType: true,
              },
            },
          },
        },
        _count: { select: { messages: true } },
      },
    });

    if (!conversation) throw new NotFoundException('私信会话不存在或不是用户之间的私信');

    const where: any = { conversationId };
    const and: any[] = [];
    if (keyword) {
      const numericKeyword = Number(keyword);
      and.push({
        OR: [
          { content: { contains: keyword } },
          { sender: { nickname: { contains: keyword } } },
          { sender: { phone: { contains: keyword } } },
          { sender: { id: { contains: keyword } } },
          { sender: { openid: { contains: keyword } } },
          ...(Number.isSafeInteger(numericKeyword)
            ? [{ sender: { uid: numericKeyword } }, { sender: { publicUid: numericKeyword } }]
            : []),
        ],
      });
    }
    if (messageType) and.push({ type: messageType as any });
    if (and.length) where.AND = and;
    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          sender: { select: { id: true, uid: true, publicUid: true, nickname: true, avatar: true, phone: true, openid: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.message.count({ where }),
    ]);

    const messages = [...items].reverse().map((item) => this.toAdminMessage(item));

    return {
      conversation: this.toAdminConversation({ ...conversation, messages: [] }),
      list: messages,
      messages,
      total,
      page,
      pageSize,
    };
  }

  async setAdminPrivateConversationBlocked(conversationId: string, blocked: boolean) {
    const conversation = await this.prisma.conversation.findFirst({
      where: this.privateUserConversationWhere({ id: conversationId }),
    });
    if (!conversation) throw new NotFoundException('私信会话不存在或不是用户之间的私信');

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { isBlocked: blocked },
    });
    return {
      success: true,
      id: conversationId,
      isBlocked: blocked,
      statusLabel: blocked ? '已屏蔽' : '正常',
      message: blocked ? '已屏蔽该私信会话，双方不能继续发送消息' : '已解除屏蔽，双方可以继续发送消息',
    };
  }

  async recallAdminPrivateMessage(messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            members: {
              include: { user: { select: { userType: true } } },
            },
          },
        },
      },
    });
    if (!message || message.conversation.type !== 'private') {
      throw new NotFoundException('私信消息不存在');
    }
    if (message.conversation.members.some((member) => member.user?.userType === 4)) {
      throw new BadRequestException('该接口只处理用户与用户之间的私信');
    }

    if (message.isRecalled) {
      return { success: true, message: '该消息已撤回', messageId, alreadyRecalled: true };
    }
    const recalledAt = new Date();
    await this.prisma.message.update({
      where: { id: messageId },
      data: { isRecalled: true, recalledAt },
    });
    await this.refreshConversationLastMessage(message.conversationId);
    const latestMessage = await this.prisma.message.findFirst({
      where: { conversationId: message.conversationId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (latestMessage?.id === messageId) {
      await this.prisma.conversation.update({
        where: { id: message.conversationId },
        data: { lastMessage: '一条消息已被管理员撤回' },
      });
    }

    const payload = {
      event: 'message_recalled',
      type: 'message_recalled',
      conversationId: message.conversationId,
      conversation_id: message.conversationId,
      messageId,
      message_id: messageId,
      recalledBy: 'admin',
      recalled_by: 'admin',
      recalledAt: recalledAt.toISOString(),
      recalled_at: recalledAt.toISOString(),
    };
    message.conversation.members.forEach((member: any) => {
      if (member.userId) this.wsNative.pushToUser(member.userId, payload);
    });

    return { success: true, message: '已撤回该消息', messageId, conversationId: message.conversationId, recalledAt: recalledAt.toISOString() };
  }

  private async findOrCreateOfficialConversation(userId: string, regionId?: string) {
    const official = await this.getOfficialUser();
    const profile = !regionId
      ? await this.prisma.userProfile.findUnique({ where: { userId }, select: { regionId: true } })
      : null;
    const resolvedRegionId = regionId || profile?.regionId || null;
    let conversation = await this.findPrivateConversation(userId, official.id);
    if (conversation) {
      if (!conversation.regionId && resolvedRegionId) {
        conversation = await this.prisma.conversation.update({ where: { id: conversation.id }, data: { regionId: resolvedRegionId } });
      }
      return { official, conversation };
    }

    conversation = await this.prisma.conversation.create({
      data: {
        type: 'private',
        regionId: resolvedRegionId,
        title: OFFICIAL_ASSISTANT_NAME,
        avatar: official.avatar || OFFICIAL_ASSISTANT_AVATAR,
        lastMessage: '有问题可以直接联系官方',
        members: {
          create: [
            { userId },
            { userId: official.id, role: 'admin', nickName: OFFICIAL_ASSISTANT_NAME },
          ],
        },
      },
    });
    return { official, conversation };
  }

  private toClientChat(member: any) {
    const conversation = member.conversation;
    if (conversation.type === 'group') {
      const memberCount = Number(conversation.memberCount ?? conversation._count?.members ?? 0);
      const onlineMemberCount = Math.min(memberCount, Math.max(0, Number(conversation.onlineMemberCount ?? 0)));
      return {
        id: conversation.id,
        conversation_id: conversation.id,
        group_id: conversation.id,
        groupId: conversation.id,
        type: 'group',
        name: conversation.title || '群聊',
        nickname: conversation.title || '群聊',
        avatar: conversation.avatar || '/static/logo.jpg',
        message: conversation.lastMessage || '',
        created_at: conversation.lastMsgTime?.toISOString?.() || conversation.updatedAt?.toISOString?.(),
        unread_count: member.unreadCount || 0,
        member_count: memberCount,
        memberCount,
        online_member_count: onlineMemberCount,
        onlineMemberCount,
        role: member.role || 'member',
        is_manager: ['owner', 'admin'].includes(member.role),
        isManager: ['owner', 'admin'].includes(member.role),
      };
    }
    const other = conversation.members?.[0]?.user;
    const isOfficial = other?.userType === 4;
    const showOnlineStatus = other?.showOnlineStatus !== undefined
      ? other.showOnlineStatus !== false
      : other?.settings?.showOnlineStatus !== false;
    const onlineVisible = !isOfficial && showOnlineStatus && other?.isOnline === true;
    const otherUser = other
      ? {
          id: other.id,
          nickname: other.nickname,
          avatar: other.avatar,
          userType: other.userType,
          isMember: !!other.isMember,
          showOnlineStatus,
          isOnline: onlineVisible,
        }
      : other;
    return {
      id: conversation.id,
      conversation_id: conversation.id,
      type: conversation.type === 'group' ? 'group' : 'private',
      other_user_id: other?.id,
      name: isOfficial ? OFFICIAL_ASSISTANT_NAME : conversation.title || other?.nickname || '聊天对象',
      nickname: isOfficial ? OFFICIAL_ASSISTANT_NAME : conversation.title || other?.nickname || '聊天对象',
      avatar: isOfficial ? OFFICIAL_ASSISTANT_AVATAR : conversation.avatar || other?.avatar || '/static/logo.jpg',
      message: conversation.lastMessage || (isOfficial ? '有问题可以直接联系官方' : ''),
      created_at: conversation.lastMsgTime?.toISOString?.() || conversation.updatedAt?.toISOString?.(),
      unread_count: member.unreadCount || 0,
      online_status: isOfficial ? 'online' : onlineVisible ? 'online' : 'offline',
      is_online: onlineVisible,
      isOnline: onlineVisible,
      online_visible: onlineVisible,
      onlineVisible,
      show_online_status: showOnlineStatus,
      showOnlineStatus,
      role: isOfficial ? 'official' : 'user',
      is_official: isOfficial,
      pinned: isOfficial,
      is_member: !!other?.isMember,
      isMember: !!other?.isMember,
      member_badge: other?.isMember ? '会员' : '',
      memberBadge: other?.isMember ? '会员' : '',
      other_user: otherUser,
    };
  }

  private toClientMessage(message: any) {
    const isRead = message.is_read ?? message.isRead ?? false;
    const isRecalled = !!message.isRecalled;
    const recalledAt = this.dateText(message.recalledAt);
    const content = isRecalled ? '该消息已撤回' : message.content;
    return {
      id: message.id,
      message_id: message.id,
      sender_id: message.senderId,
      receiver_id: message.receiverId,
      conversation_id: message.conversationId,
      message: content,
      content,
      type: String(message.type || 'TEXT').toLowerCase(),
      created_at: message.createdAt?.toISOString?.() || message.createdAt,
      timestamp: message.createdAt?.toISOString?.() || message.createdAt,
      sender: message.sender,
      sender_is_member: !!message.sender?.isMember,
      sender_member_badge: message.sender?.isMember ? '会员' : '',
      is_recalled: isRecalled,
      isRecalled,
      recalled_at: recalledAt,
      recalledAt,
      is_read: !!isRead,
      isRead: !!isRead,
      read_count: message.readCount || 0,
      readCount: message.readCount || 0,
    };
  }

  private async getConversationLastReadAt(conversationId: string, readerId: string) {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: readerId } },
      select: { lastReadMsgId: true },
    });
    if (!member?.lastReadMsgId) return null;

    const lastReadMessage = await this.prisma.message.findFirst({
      where: { id: member.lastReadMsgId, conversationId },
      select: { createdAt: true },
    });
    return lastReadMessage?.createdAt || null;
  }

  private async activeMemberIdSet(userIds: string[]) {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return new Set<string>();
    const rows = await this.prisma.userMembership.findMany({
      where: { userId: { in: ids }, status: 'active', expiredAt: { gt: new Date() } },
      select: { userId: true },
    });
    return new Set(rows.map((row) => row.userId));
  }

  private async activeRealtimeUserIdSet(userIds: string[]) {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return new Set<string>();
    const activeSince = new Date(Date.now() - this.onlineWindowMs);
    const rows = await this.prisma.realtimeSession.findMany({
      where: {
        userId: { in: ids },
        online: true,
        platform: 'miniapp',
        lastSeenAt: { gte: activeSince },
      },
      select: { userId: true },
    });
    return new Set(rows.map((row) => row.userId).filter(Boolean) as string[]);
  }

  async getChatList(userId: string, query: any) {
    const { page = 1, limit = 20, region_id, regionId } = query;
    const regionFilter = region_id || regionId;
    const pageNum = Number(page) || 1;
    const take = Number(limit) || 20;
    const skip = (pageNum - 1) * take;
    const { official } = await this.findOrCreateOfficialConversation(userId, regionFilter);

    // AUD-P1-023: 构建区域过滤条件
    const conversationWhere: any = {};
    if (regionFilter) {
      conversationWhere.OR = [
        { regionId: regionFilter },
        { regionId: null },  // 官方/全局会话
      ];
    }

    const [members, total] = await Promise.all([
      this.prisma.conversationMember.findMany({
        where: {
          userId,
          conversation: conversationWhere,
        },
        include: {
          conversation: {
            include: {
              members: {
                where: { userId: { not: userId } },
                include: {
                  user: {
                    select: {
                      id: true,
                      nickname: true,
                      avatar: true,
                      userType: true,
                      settings: { select: { showOnlineStatus: true } },
                    },
                  },
                },
                take: 1,
              },
              _count: { select: { members: true } },
            },
          },
        },
        skip,
        take,
        orderBy: { conversation: { lastMsgTime: 'desc' } },
      }),
      this.prisma.conversationMember.count({
        where: {
          userId,
          conversation: conversationWhere,
        },
      }),
    ]);

    const groupIds = members
      .filter((member) => member.conversation.type === 'group')
      .map((member) => member.conversation.id);
    const groupMembers = groupIds.length
      ? await this.prisma.conversationMember.findMany({
          where: { conversationId: { in: groupIds } },
          select: {
            conversationId: true,
            user: { select: { id: true, settings: { select: { showOnlineStatus: true } } } },
          },
        })
      : [];
    const otherUserIds = [
      ...members.map((member) => member.conversation.members?.[0]?.user?.id),
      ...groupMembers.map((member: any) => member.user?.id),
    ];
    const [memberIds, onlineUserIds] = await Promise.all([
      this.activeMemberIdSet(otherUserIds),
      this.activeRealtimeUserIdSet(otherUserIds),
    ]);
    const onlineGroupMemberCounts = new Map<string, number>();
    for (const groupMember of groupMembers as any[]) {
      const user = groupMember.user;
      if (user?.settings?.showOnlineStatus !== false && onlineUserIds.has(user?.id)) {
        onlineGroupMemberCounts.set(
          groupMember.conversationId,
          (onlineGroupMemberCounts.get(groupMember.conversationId) || 0) + 1,
        );
      }
    }
    let chatList = members.map((member) => {
      const other = member.conversation.members?.[0]?.user;
      const showOnlineStatus = other?.settings?.showOnlineStatus !== false;
      return this.toClientChat({
        ...member,
        conversation: {
          ...member.conversation,
          memberCount: member.conversation._count?.members || 0,
          onlineMemberCount: onlineGroupMemberCounts.get(member.conversation.id) || 0,
          members: other
            ? [{
                ...member.conversation.members[0],
                user: {
                  ...other,
                  isMember: memberIds.has(other.id),
                  showOnlineStatus,
                  isOnline: onlineUserIds.has(other.id),
                },
              }]
            : member.conversation.members,
        },
      });
    });
    if (pageNum === 1 && !chatList.some((chat) => chat.other_user_id === official.id)) {
      const officialMember = await this.prisma.conversationMember.findFirst({
        where: {
          userId,
          conversation: {
            type: 'private',
            members: { some: { userId: official.id } },
          },
        },
        include: {
          conversation: {
            include: {
              members: {
                where: { userId: official.id },
                include: {
                  user: {
                    select: {
                      id: true,
                      nickname: true,
                      avatar: true,
                      userType: true,
                      settings: { select: { showOnlineStatus: true } },
                    },
                  },
                },
                take: 1,
              },
            },
          },
        },
      });
      if (officialMember) chatList.unshift(this.toClientChat(officialMember));
    }
    chatList = chatList
      .filter((chat, index, list) => list.findIndex((item) => item.conversation_id === chat.conversation_id) === index)
      .filter((chat) => pageNum === 1 || chat.other_user_id !== official.id)
      .sort((a, b) => {
        if (a.is_official && !b.is_official) return -1;
        if (!a.is_official && b.is_official) return 1;
        const aTime = new Date(a.created_at || 0).getTime();
        const bTime = new Date(b.created_at || 0).getTime();
        return bTime - aTime;
      });
    if (pageNum === 1 && chatList.length > take) {
      chatList = chatList.slice(0, take);
    }

    return {
      success: true,
      chatList,
      list: chatList,
      total,
      page: pageNum,
      limit: take,
    };
  }

  async getChatHistory(userId: string, query: any) {
    const { user_id, other_user_id, page = 1, limit = 20 } = query;
    const targetId = other_user_id || user_id;
    if (!targetId) return { messages: [], list: [], total: 0 };
    const [conversation, otherUser] = await Promise.all([
      this.findPrivateConversation(userId, targetId),
      this.prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true, nickname: true, avatar: true, userType: true },
      }),
    ]);
    if (!conversation) {
      return {
        messages: [],
        list: [],
        total: 0,
        page: Number(page),
        limit: Number(limit),
        other_user: otherUser,
      };
    }

    const latestMessageForReader = await this.prisma.message.findFirst({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true },
    });
    await this.prisma.conversationMember.updateMany({
      where: { conversationId: conversation.id, userId },
      data: {
        unreadCount: 0,
        ...(latestMessageForReader?.id ? { lastReadMsgId: latestMessageForReader.id } : {}),
      },
    });
    const [targetLastReadAt, list, total, memberIds] = await Promise.all([
      this.getConversationLastReadAt(conversation.id, targetId),
      this.prisma.message.findMany({
        where: { conversationId: conversation.id },
        include: { sender: { select: { id: true, nickname: true, avatar: true } } },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.message.count({ where: { conversationId: conversation.id } }),
      this.activeMemberIdSet([targetId, userId]),
    ]);
    const messages = list.reverse().map((msg) => this.toClientMessage({
      ...msg,
      receiverId: msg.senderId === userId ? targetId : userId,
      sender: msg.sender ? { ...msg.sender, isMember: memberIds.has(msg.sender.id) } : msg.sender,
      is_read: msg.senderId === userId && !!targetLastReadAt && msg.createdAt <= targetLastReadAt,
    }));
    return {
      messages,
      list: messages,
      total,
      page: Number(page),
      limit: Number(limit),
      conversation_id: conversation.id,
      other_user: otherUser ? {
        ...otherUser,
        is_member: memberIds.has(otherUser.id),
        isMember: memberIds.has(otherUser.id),
        member_badge: memberIds.has(otherUser.id) ? '会员' : '',
        memberBadge: memberIds.has(otherUser.id) ? '会员' : '',
      } : otherUser,
    };
  }

  async getPrivateMessagePermission(userId: string, query: any) {
    const targetId = String(
      query.target_user_id ||
      query.targetUserId ||
      query.receiver_id ||
      query.receiverId ||
      query.other_user_id ||
      query.user_id ||
      '',
    ).trim();
    if (!targetId) throw new BadRequestException('缺少对方用户ID');

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        uid: true,
        nickname: true,
        avatar: true,
        userType: true,
        settings: { select: { messagePermission: true, allowMessage: true } },
      },
    });
    if (!target) throw new NotFoundException('接收方不存在');

    const result = await this.privateMessagePermission.check(userId, target);
    return {
      success: true,
      allowed: result.allowed,
      can_send: result.allowed,
      canSend: result.allowed,
      reason: result.reason,
      message: result.message || result.reason,
      message_permission: result.messagePermission,
      messagePermission: result.messagePermission,
      message_permission_text: result.messagePermissionText,
      messagePermissionText: result.messagePermissionText,
      relation: result.relation,
      target_user: {
        id: target.id,
        uid: target.uid,
        nickname: target.nickname || '用户',
        avatar: target.avatar || '',
        userType: target.userType,
      },
    };
  }

  async markAllConversationsRead(userId: string, regionId?: string) {
    // AUD-P1-023: 按区域过滤会话
    const where: any = {
      userId,
      unreadCount: { gt: 0 },
    };

    if (regionId) {
      where.conversation = {
        OR: [
          { regionId },
          { regionId: null },  // 官方/全局会话
        ],
      };
    }

    const result = await this.prisma.conversationMember.updateMany({
      where,
      data: { unreadCount: 0 },
    });

    await this.clearUnreadSummaryCache(userId);

    return { success: true, affected: result.count };
  }

  async markConversationRead(userId: string, dto: any) {
    const conversationId = String(dto?.conversation_id || dto?.conversationId || dto?.group_id || dto?.groupId || '').trim();
    const targetId = String(dto?.other_user_id || dto?.otherUserId || dto?.receiver_id || dto?.receiverId || '').trim();
    let finalConversationId = conversationId;

    if (!finalConversationId && targetId) {
      const conversation = await this.findPrivateConversation(userId, targetId);
      finalConversationId = conversation?.id || '';
    }
    if (!finalConversationId) {
      throw new BadRequestException('缺少会话ID');
    }

    const latestMessage = await this.prisma.message.findFirst({
      where: { conversationId: finalConversationId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true },
    });
    const result = await this.prisma.conversationMember.updateMany({
      where: { conversationId: finalConversationId, userId },
      data: {
        unreadCount: 0,
        ...(latestMessage?.id ? { lastReadMsgId: latestMessage.id } : {}),
      },
    });

    if (result.count === 0) {
      throw new NotFoundException('会话不存在或你不是该会话成员');
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: finalConversationId },
      select: { type: true },
    });
    if (conversation?.type === 'private' && latestMessage?.createdAt) {
      await this.prisma.message.updateMany({
        where: {
          conversationId: finalConversationId,
          senderId: { not: userId },
          createdAt: { lte: latestMessage.createdAt },
          readCount: { lt: 1 },
        },
        data: { readCount: 1 },
      }).catch(() => undefined);
    }

    await this.clearUnreadSummaryCache(userId);

    return {
      success: true,
      conversation_id: finalConversationId,
      last_read_msg_id: latestMessage?.id || null,
      last_read_at: latestMessage?.createdAt?.toISOString?.() || null,
      affected: result.count,
    };
  }

  async getPrivateChatEnabled(regionId: string) {
    if (!regionId) {
      return { enabled: true };
    }
    try {
      const region = await this.prisma.region.findUnique({
        where: { id: regionId },
        select: { privateMessageEnabled: true },
      });
      if (!region) {
        return { enabled: true };
      }
      return { enabled: region.privateMessageEnabled !== false };
    } catch {
      return { enabled: true };
    }
  }

  async recallMessage(userId: string, dto: any) {
    const messageId = String(dto?.message_id || dto?.messageId || '').trim();
    if (!messageId) throw new BadRequestException('缺少消息ID');

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: { include: { members: { select: { userId: true } } } } },
    });
    if (!message) throw new NotFoundException('消息不存在');
    if (message.senderId !== userId) throw new BadRequestException('只能撤回自己发送的消息');
    if (message.isRecalled) {
      return { success: true, message: '消息已撤回', messageId, conversationId: message.conversationId, alreadyRecalled: true };
    }
    const isMember = message.conversation?.members?.some((member: any) => member.userId === userId);
    if (!isMember) throw new BadRequestException('你不在该会话中，不能撤回消息');

    const recalledAt = new Date();
    await this.prisma.message.update({
      where: { id: messageId },
      data: { isRecalled: true, recalledAt },
    });
    await this.refreshConversationLastMessage(message.conversationId);

    const payload = {
      event: 'message_recalled',
      type: 'message_recalled',
      conversationId: message.conversationId,
      conversation_id: message.conversationId,
      groupId: message.conversation.type === 'group' ? message.conversationId : undefined,
      group_id: message.conversation.type === 'group' ? message.conversationId : undefined,
      messageId,
      message_id: messageId,
      senderId: userId,
      sender_id: userId,
      recalledAt: recalledAt.toISOString(),
      recalled_at: recalledAt.toISOString(),
    };
    if (message.conversation.type === 'group') {
      this.wsNative.pushToGroup(message.conversationId, payload);
    } else {
      message.conversation.members
        .filter((member: any) => member.userId !== userId)
        .forEach((member: any) => this.wsNative.pushToUser(member.userId, payload));
      this.wsNative.pushToUser(userId, payload);
    }

    return { success: true, message: '消息已撤回', messageId, conversationId: message.conversationId, recalledAt: recalledAt.toISOString() };
  }

  async clearChatHistory(userId: string, dto: any) {
    const targetId = dto.other_user_id || dto.user_id;
    if (!targetId) return { success: false, message: "缺少会话对方ID" };
    const conversation = await this.findPrivateConversation(userId, targetId);
    if (!conversation) return { success: true, deleted: 0 };
    const result = await this.prisma.message.deleteMany({
      where: { conversationId: conversation.id, senderId: userId },
    });
    return { success: true, deleted: result.count };
  }

  async getGroupMessages(groupId: string, userId: string, query: any) {
    const { page = 1, limit = 20 } = query;
    if (!groupId) return { list: [], total: 0, page, limit };
    const member = await this.prisma.conversationMember.findFirst({
      where: { conversationId: groupId, userId },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('你不是该群成员');
    await this.markConversationRead(userId, { conversation_id: groupId }).catch(() => null);
    const [list, total] = await Promise.all([
      this.prisma.message.findMany({ where: { conversationId: groupId }, include: { sender: { select: { id: true, nickname: true, avatar: true } } }, skip: (page - 1) * limit, take: Number(limit), orderBy: { createdAt: 'desc' } }),
      this.prisma.message.count({ where: { conversationId: groupId } }),
    ]);
    const messages = list.reverse().map((msg) => this.toClientMessage(msg));
    return { data: { messages }, messages, list: messages, total, page, limit };
  }

  async getGroupDetail(groupId: string, userId: string, query: any) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: groupId, members: { some: { userId } } },
      include: {
        members: {
          include: {
            user: { select: { id: true, nickname: true, avatar: true, settings: { select: { showOnlineStatus: true } } } },
          },
        },
        messages: {
          include: { sender: { select: { id: true, nickname: true, avatar: true } } },
          take: Number(query.limit || 20),
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!conversation) return { id: groupId, members: [], messages: [], list: [], total: 0 };
    const messages = [...conversation.messages].reverse();
    const currentMember = conversation.members.find((member: any) => member.userId === userId);
    const onlineUserIds = await this.activeRealtimeUserIdSet(conversation.members.map((member: any) => member.userId));
    const onlineMemberCount = conversation.members.filter(
      (member: any) => member.user?.settings?.showOnlineStatus !== false && onlineUserIds.has(member.userId),
    ).length;
    const detail = {
      id: conversation.id,
      group_id: conversation.id,
      name: conversation.title || '群聊',
      title: conversation.title || '群聊',
      avatar: conversation.avatar || '',
      member_count: conversation.members.length,
      online_member_count: onlineMemberCount,
      user_role: currentMember?.role || 'member',
      announcement: null,
      members: conversation.members,
      messages,
      list: messages,
      total: messages.length,
    };
    return {
      data: detail,
      ...detail,
    };
  }

  async getGroupMembers(groupId: string, userId: string, query: any) {
    const { page = 1, limit = 50, role_filter } = query;
    const where: any = {
      conversationId: groupId,
      conversation: { members: { some: { userId } } },
    };
    if (role_filter) where.role = role_filter;
    const [list, total] = await Promise.all([
      this.prisma.conversationMember.findMany({
        where,
        include: {
          user: { select: { id: true, nickname: true, avatar: true, settings: { select: { showOnlineStatus: true } } } },
        },
        skip: (page - 1) * limit,
        take: Number(limit),
        orderBy: { joinedAt: 'asc' },
      }),
      this.prisma.conversationMember.count({ where }),
    ]);
    const onlineUserIds = await this.activeRealtimeUserIdSet(list.map((member: any) => member.userId));
    const members = list.map((member: any) => ({
      id: member.id,
      user_id: member.userId,
      nickname: member.user?.nickname || member.nickName || '群成员',
      avatar: member.user?.avatar || '/static/logo.jpg',
      role: member.role,
      is_online: member.user?.settings?.showOnlineStatus !== false && onlineUserIds.has(member.userId),
      joined_at: this.dateText(member.joinedAt),
      is_muted: !!member.isMuted,
      muted_until: null,
      region_name: '',
    }));
    return { data: { members, total, page, limit }, list: members, members, total, page, limit };
  }

  async updateGroup(groupId: string, userId: string, dto: any) {
    const member = await this.prisma.conversationMember.findFirst({
      where: { conversationId: groupId, userId, role: { in: ['owner', 'admin'] } },
    });
    if (!member) return { success: false, message: '无权修改群聊' };
    return this.prisma.conversation.update({
      where: { id: groupId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.name !== undefined ? { title: dto.name } : {}),
        ...(dto.avatar !== undefined ? { avatar: dto.avatar } : {}),
      },
    });
  }

  async leaveGroup(groupId: string, userId: string) {
    await this.prisma.conversationMember.deleteMany({ where: { conversationId: groupId, userId } });
    return { success: true };
  }

  async clearGroupHistory(groupId: string, userId: string) {
    const member = await this.prisma.conversationMember.findFirst({
      where: { conversationId: groupId, userId, role: { in: ['owner', 'admin'] } },
      include: { conversation: { select: { type: true } } },
    });
    if (!member || member.conversation.type !== 'group') {
      throw new BadRequestException('只有群主或管理员可以清空群聊记录');
    }
    const result = await this.prisma.message.deleteMany({
      where: { conversationId: groupId },
    });
    await this.prisma.conversation.update({
      where: { id: groupId },
      data: { lastMessage: '群聊记录已清空', lastMsgTime: new Date() },
    });
    await this.prisma.conversationMember.updateMany({
      where: { conversationId: groupId },
      data: { unreadCount: 0, lastReadMsgId: null },
    });
    return { success: true, deleted: result.count, message: '群聊记录已清空' };
  }

  async dissolveGroup(groupId: string, userId: string) {
    const member = await this.prisma.conversationMember.findFirst({
      where: { conversationId: groupId, userId, role: 'owner' },
      include: { conversation: { select: { type: true } } },
    });
    if (!member || member.conversation.type !== 'group') {
      throw new BadRequestException('只有群主可以解散群聊');
    }
    await this.prisma.conversation.delete({ where: { id: groupId } });
    return { success: true, message: '群组已解散' };
  }
}
