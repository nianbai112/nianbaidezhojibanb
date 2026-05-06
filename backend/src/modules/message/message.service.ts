import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class MessageService {
  constructor(private readonly prisma: PrismaService) {}

  async getChatList(userId: string, query: any) {
    const { page = 1, limit = 20, region_id } = query;
    return this.prisma.conversationMember.findMany({
      where: { userId },
      include: { conversation: { include: { members: { where: { userId: { not: userId } }, include: { user: { select: { id: true, nickname: true, avatar: true } } }, take: 1 } } } },
      skip: (page - 1) * limit,
      take: Number(limit),
      orderBy: { conversation: { lastMsgTime: 'desc' } },
    });
  }

  async getChatHistory(userId: string, query: any) {
    const { user_id, other_user_id, page = 1, limit = 20 } = query;
    const targetId = other_user_id || user_id;
    const conversation = await this.prisma.conversation.findFirst({
      where: { type: 'private', members: { every: { userId: { in: [userId, targetId] } } } },
    });
    if (!conversation) return { list: [], total: 0 };
    const [list, total] = await Promise.all([
      this.prisma.message.findMany({ where: { conversationId: conversation.id, isRecalled: false }, include: { sender: { select: { id: true, nickname: true, avatar: true } } }, skip: (page - 1) * limit, take: Number(limit), orderBy: { createdAt: 'desc' } }),
      this.prisma.message.count({ where: { conversationId: conversation.id, isRecalled: false } }),
    ]);
    return { list: list.reverse(), total, page, limit };
  }

  async getPrivateChatEnabled(regionId: string) {
    return { enabled: true };
  }

  async recallMessage(userId: string, dto: any) {
    return this.prisma.message.updateMany({ where: { id: dto.message_id, senderId: userId }, data: { isRecalled: true, recalledAt: new Date() } });
  }

  async clearChatHistory(userId: string, dto: any) {
    return { success: true };
  }

  async getGroupMessages(groupId: string, userId: string, query: any) {
    const { page = 1, limit = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.message.findMany({ where: { conversationId: groupId, isRecalled: false }, include: { sender: { select: { id: true, nickname: true, avatar: true } } }, skip: (page - 1) * limit, take: Number(limit), orderBy: { createdAt: 'desc' } }),
      this.prisma.message.count({ where: { conversationId: groupId, isRecalled: false } }),
    ]);
    return { list: list.reverse(), total, page, limit };
  }

  async leaveGroup(groupId: string, userId: string) {
    await this.prisma.conversationMember.deleteMany({ where: { conversationId: groupId, userId } });
    return { success: true };
  }
}
