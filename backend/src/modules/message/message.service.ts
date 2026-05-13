import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class MessageService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly officialOpenid = 'lingmeng_official_message_account';

  private async getOfficialUser() {
    return this.prisma.user.upsert({
      where: { openid: this.officialOpenid },
      create: {
        openid: this.officialOpenid,
        nickname: '官方推送消息',
        avatar: '/static/logo.jpg',
        userType: 4,
      },
      update: {
        nickname: '官方推送消息',
        avatar: '/static/logo.jpg',
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

  private async findOrCreateOfficialConversation(userId: string) {
    const official = await this.getOfficialUser();
    let conversation = await this.findPrivateConversation(userId, official.id);
    if (conversation) return { official, conversation };

    conversation = await this.prisma.conversation.create({
      data: {
        type: 'private',
        title: '官方推送消息',
        avatar: official.avatar || '/static/logo.jpg',
        lastMessage: '有问题可以直接联系官方',
        members: {
          create: [
            { userId },
            { userId: official.id, role: 'admin', nickName: '官方推送消息' },
          ],
        },
      },
    });
    return { official, conversation };
  }

  private toClientChat(member: any) {
    const conversation = member.conversation;
    const other = conversation.members?.[0]?.user;
    const isOfficial = other?.userType === 4;
    return {
      id: conversation.id,
      conversation_id: conversation.id,
      type: conversation.type === 'group' ? 'group' : 'private',
      other_user_id: other?.id,
      name: isOfficial ? '官方推送消息' : conversation.title || other?.nickname || '聊天对象',
      nickname: isOfficial ? '官方推送消息' : conversation.title || other?.nickname || '聊天对象',
      avatar: conversation.avatar || other?.avatar || '/static/logo.jpg',
      message: conversation.lastMessage || (isOfficial ? '有问题可以直接联系官方' : ''),
      created_at: conversation.lastMsgTime?.toISOString?.() || conversation.updatedAt?.toISOString?.(),
      unread_count: member.unreadCount || 0,
      online_status: isOfficial ? 'online' : 'offline',
      role: isOfficial ? 'official' : 'user',
      is_official: isOfficial,
      pinned: isOfficial,
      other_user: other,
    };
  }

  private toClientMessage(message: any) {
    return {
      id: message.id,
      message_id: message.id,
      sender_id: message.senderId,
      receiver_id: message.receiverId,
      conversation_id: message.conversationId,
      message: message.content,
      content: message.content,
      type: String(message.type || 'TEXT').toLowerCase(),
      created_at: message.createdAt?.toISOString?.() || message.createdAt,
      timestamp: message.createdAt?.toISOString?.() || message.createdAt,
      sender: message.sender,
      is_read: message.isRead ?? false,
    };
  }

  async getChatList(userId: string, query: any) {
    const { page = 1, limit = 20 } = query;
    const pageNum = Number(page) || 1;
    const take = Number(limit) || 20;
    const skip = (pageNum - 1) * take;
    const { official } = await this.findOrCreateOfficialConversation(userId);
    const [members, total] = await Promise.all([
      this.prisma.conversationMember.findMany({
        where: { userId },
        include: {
          conversation: {
            include: {
              members: {
                where: { userId: { not: userId } },
                include: { user: { select: { id: true, nickname: true, avatar: true, userType: true } } },
                take: 1,
              },
            },
          },
        },
        skip,
        take,
        orderBy: { conversation: { lastMsgTime: 'desc' } },
      }),
      this.prisma.conversationMember.count({ where: { userId } }),
    ]);

    let chatList = members.map((member) => this.toClientChat(member));
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
                include: { user: { select: { id: true, nickname: true, avatar: true, userType: true } } },
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

    await this.prisma.conversationMember.updateMany({
      where: { conversationId: conversation.id, userId },
      data: { unreadCount: 0 },
    });
    const [list, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId: conversation.id, isRecalled: false },
        include: { sender: { select: { id: true, nickname: true, avatar: true } } },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.message.count({ where: { conversationId: conversation.id, isRecalled: false } }),
    ]);
    const messages = list.reverse().map((msg) => this.toClientMessage({
      ...msg,
      receiverId: msg.senderId === userId ? targetId : userId,
    }));
    return {
      messages,
      list: messages,
      total,
      page: Number(page),
      limit: Number(limit),
      conversation_id: conversation.id,
      other_user: otherUser,
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
    return this.prisma.message.updateMany({ where: { id: dto.message_id, senderId: userId }, data: { isRecalled: true, recalledAt: new Date() } });
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
    const [list, total] = await Promise.all([
      this.prisma.message.findMany({ where: { conversationId: groupId, isRecalled: false }, include: { sender: { select: { id: true, nickname: true, avatar: true } } }, skip: (page - 1) * limit, take: Number(limit), orderBy: { createdAt: 'desc' } }),
      this.prisma.message.count({ where: { conversationId: groupId, isRecalled: false } }),
    ]);
    return { list: list.reverse(), total, page, limit };
  }

  async getGroupDetail(groupId: string, userId: string, query: any) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: groupId, members: { some: { userId } } },
      include: {
        members: {
          include: {
            user: { select: { id: true, nickname: true, avatar: true } },
          },
        },
        messages: {
          where: { isRecalled: false },
          include: { sender: { select: { id: true, nickname: true, avatar: true } } },
          take: Number(query.limit || 20),
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!conversation) return { id: groupId, members: [], messages: [], list: [], total: 0 };
    const messages = [...conversation.messages].reverse();
    return {
      ...conversation,
      messages,
      list: messages,
      total: messages.length,
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
        include: { user: { select: { id: true, nickname: true, avatar: true } } },
        skip: (page - 1) * limit,
        take: Number(limit),
        orderBy: { joinedAt: 'asc' },
      }),
      this.prisma.conversationMember.count({ where }),
    ]);
    return { list, members: list, total, page, limit };
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
        ...(dto.avatar !== undefined ? { avatar: dto.avatar } : {}),
      },
    });
  }

  async leaveGroup(groupId: string, userId: string) {
    await this.prisma.conversationMember.deleteMany({ where: { conversationId: groupId, userId } });
    return { success: true };
  }
}
