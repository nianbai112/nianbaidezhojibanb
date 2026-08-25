import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AdminDataScopeService } from '../../common/services/admin-data-scope.service';
import { NotifyService } from '../notify/notify.service';
import { CreateAssistantTicketDto, UpdateAssistantTicketDto } from './dto/assistant-ticket.dto';
import { officialAssistantUserWhere } from '../../common/utils/official-assistant.util';
import { syncOfficialAssistantTicketMessage } from '../../common/utils/official-assistant-ticket.util';

@Injectable()
export class AssistantTicketService {
  private readonly logger = new Logger(AssistantTicketService.name);

  constructor(private readonly prisma: PrismaService, private readonly notify: NotifyService, private readonly scope: AdminDataScopeService) {}

  private content(value?: string) {
    const content = String(value || '').trim();
    if (!content) throw new BadRequestException('咨询内容不能为空');
    if (content.length > 500) throw new BadRequestException('咨询内容不能超过500字');
    return content;
  }
  private title(value?: string) {
    const text = String(value || '').replace(/^(img:|video:|recording:)/, '').trim();
    return text ? text.slice(0, 24) : '媒体咨询';
  }

  private async findReplyByClientMessageId(userId: string, clientMessageId: string) {
    if (!clientMessageId) return null;
    return (this.prisma as any).assistantTicketReply.findFirst({
      where: { senderId: userId, clientMessageId },
      include: { ticket: true },
    });
  }

  async createTicket(userId: string, dto: CreateAssistantTicketDto) {
    const content = this.content(dto.content);
    const regionId = String(dto.regionId || '').trim();
    if (!regionId) throw new BadRequestException('请选择当前校园');
    const prisma: any = this.prisma;
    const [profile, region] = await Promise.all([prisma.userProfile.findUnique({ where: { userId } }), prisma.region.findUnique({ where: { id: regionId } })]);
    if (!region || !region.isOpen) throw new NotFoundException('当前校园不存在或未开放');
    if (profile?.regionId && profile.regionId !== regionId) throw new ForbiddenException('只能在当前校园发起咨询');
    const category = ['order', 'account', 'feedback'].includes(String(dto.category)) ? dto.category : 'other';
    const clientMessageId = String(dto.clientMessageId || dto.client_message_id || '').trim();
    const existingReply = await this.findReplyByClientMessageId(userId, clientMessageId);
    if (existingReply?.ticket) {
      return { ...existingReply.ticket, title: this.title(existingReply.ticket.content), duplicated: true };
    }
    const { official, conversation } = await this.notify.ensureOfficialConversationForUser(userId, regionId);
    let ticket: any;
    try {
      ticket = await prisma.$transaction(async (tx: any) => {
        const message = await tx.message.create({
          data: {
            conversationId: conversation.id,
            senderId: userId,
            type: 'TEXT',
            content,
            ...(clientMessageId ? { clientMessageId } : {}),
          },
        });
        const ticketId = await syncOfficialAssistantTicketMessage(tx, {
          userId,
          regionId,
          conversationId: conversation.id,
          messageId: message.id,
          content,
          clientMessageId,
          startNew: true,
          category,
        });
        await Promise.all([
          tx.conversation.update({
            where: { id: conversation.id },
            data: { lastMessage: content, lastMsgTime: message.createdAt },
          }),
          tx.conversationMember.updateMany({
            where: { conversationId: conversation.id, userId: official.id },
            data: { unreadCount: { increment: 1 } },
          }),
        ]);
        return tx.assistantTicket.findUnique({ where: { id: ticketId } });
      });
    } catch (error: any) {
      if (!clientMessageId || error?.code !== 'P2002') throw error;
      const duplicated = await this.findReplyByClientMessageId(userId, clientMessageId);
      if (!duplicated?.ticket) throw error;
      return { ...duplicated.ticket, title: this.title(duplicated.ticket.content), duplicated: true };
    }
    return { ...ticket, title: this.title(content) };
  }

  async listMyTickets(userId: string) {
    const list = await (this.prisma as any).assistantTicket.findMany({ where: { userId }, include: { replies: { orderBy: { createdAt: 'desc' }, take: 1 } }, orderBy: { updatedAt: 'desc' } });
    return list.map((ticket: any) => ({ ...ticket, title: this.title(ticket.content), lastMessage: ticket.replies?.[0]?.content || ticket.latestReply || ticket.content, replyCount: ticket.replies?.length || 0 }));
  }

  async getMyTicket(userId: string, id: string) {
    const ticket = await (this.prisma as any).assistantTicket.findUnique({ where: { id }, include: { replies: { orderBy: { createdAt: 'asc' } } } });
    if (!ticket) throw new NotFoundException('咨询工单不存在');
    if (ticket.userId !== userId) throw new ForbiddenException('无权查看该咨询工单');
    if (ticket.unreadForUser) await (this.prisma as any).assistantTicket.update({ where: { id }, data: { unreadForUser: false } });
    return { ...ticket, unreadForUser: false, title: this.title(ticket.content) };
  }

  async replyToTicket(userId: string, id: string, value: string, rawClientMessageId?: string) {
    const content = this.content(value); const prisma: any = this.prisma;
    const clientMessageId = String(rawClientMessageId || '').trim();
    const ticket = await prisma.assistantTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('咨询工单不存在');
    if (ticket.userId !== userId) throw new ForbiddenException('无权回复该咨询工单');
    const existingReply = await this.findReplyByClientMessageId(userId, clientMessageId);
    if (existingReply) {
      if (existingReply.ticketId !== ticket.id) {
        throw new BadRequestException('clientMessageId 已用于其他咨询工单');
      }
      return {
        ...existingReply,
        status: ticket.status === 'waiting_user' ? 'processing' : ticket.status,
        duplicated: true,
      };
    }
    if (['resolved', 'closed'].includes(ticket.status)) throw new BadRequestException('该咨询已结束，请发起新的咨询');
    if (ticket.conversationId) {
      const official = await this.notify.getOfficialAssistantUser();
      try {
        const result = await prisma.$transaction(async (tx: any) => {
          const message = await tx.message.create({
            data: {
              conversationId: ticket.conversationId,
              senderId: userId,
              ticketId: ticket.id,
              type: 'TEXT',
              content,
              ...(clientMessageId ? { clientMessageId } : {}),
            },
          });
          await syncOfficialAssistantTicketMessage(tx, {
            userId,
            regionId: ticket.regionId,
            conversationId: ticket.conversationId,
            messageId: message.id,
            content,
            clientMessageId,
            ticketId: ticket.id,
          });
          await Promise.all([
            tx.conversation.update({
              where: { id: ticket.conversationId },
              data: { lastMessage: content, lastMsgTime: message.createdAt },
            }),
            tx.conversationMember.updateMany({
              where: { conversationId: ticket.conversationId, userId: official.id },
              data: { unreadCount: { increment: 1 } },
            }),
          ]);
          return message;
        });
        return {
          id: result.id,
          messageId: result.id,
          ticketId: ticket.id,
          senderType: 'user',
          senderId: userId,
          clientMessageId: clientMessageId || null,
          content,
          status: ticket.status === 'waiting_user' ? 'processing' : ticket.status,
        };
      } catch (error: any) {
        if (!clientMessageId || error?.code !== 'P2002') throw error;
        const duplicated = await this.findReplyByClientMessageId(userId, clientMessageId);
        if (!duplicated || duplicated.ticketId !== ticket.id) throw error;
        return {
          ...duplicated,
          status: ticket.status === 'waiting_user' ? 'processing' : ticket.status,
          duplicated: true,
        };
      }
    }

    // 兼容尚未回填 conversationId 的历史工单，保留原 Reply 写入，避免丢消息。
    try {
      const reply = await prisma.assistantTicketReply.create({
        data: {
          ticketId: id,
          senderType: 'user',
          senderId: userId,
          ...(clientMessageId ? { clientMessageId } : {}),
          content,
        },
      });
      const status = ticket.status === 'waiting_user' ? 'processing' : ticket.status;
      await prisma.assistantTicket.update({ where: { id }, data: { latestReply: content, unreadForUser: false, status } });
      return { ...reply, status };
    } catch (error: any) {
      if (!clientMessageId || error?.code !== 'P2002') throw error;
      const duplicated = await this.findReplyByClientMessageId(userId, clientMessageId);
      if (!duplicated || duplicated.ticketId !== ticket.id) throw error;
      return {
        ...duplicated,
        status: ticket.status === 'waiting_user' ? 'processing' : ticket.status,
        duplicated: true,
      };
    }
  }

  async listAdminTickets(adminId: string, query: any) {
    const context = await this.scope.getAdminContext(adminId); const where: any = {};
    if (!context.isSuperAdmin) where.regionId = { in: context.regionIds };
    if (query.regionId) { if (!context.isSuperAdmin && !context.regionIds.includes(String(query.regionId))) throw new ForbiddenException('无权访问该区域数据'); where.regionId = String(query.regionId); }
    if (query.status) where.status = String(query.status);
    const page = Math.max(1, Number(query.page || 1)); const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20))); const prisma: any = this.prisma;
    const [list, total] = await Promise.all([prisma.assistantTicket.findMany({ where, include: { replies: { orderBy: { createdAt: 'desc' }, take: 1 } }, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }), prisma.assistantTicket.count({ where })]);
    return { list: list.map((ticket: any) => ({ ...ticket, title: this.title(ticket.content) })), total, page, pageSize };
  }

  async listOfficialConversations(adminId: string, query: any) {
    const context = await this.scope.getAdminContext(adminId);
    const where: any = { type: 'private', members: { some: { user: officialAssistantUserWhere() } } };
    if (!context.isSuperAdmin) where.regionId = { in: context.regionIds };
    if (query.regionId) {
      if (!context.isSuperAdmin && !context.regionIds.includes(String(query.regionId))) throw new ForbiddenException('无权访问该区域数据');
      where.regionId = String(query.regionId);
    }
    const page = Math.max(1, Number(query.page || 1)); const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20))); const prisma: any = this.prisma;
    const [list, total] = await Promise.all([
      prisma.conversation.findMany({ where, include: { members: { include: { user: { select: { id: true, nickname: true, avatar: true, userType: true } } } }, messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { sender: { select: { id: true, nickname: true, avatar: true } } } } }, orderBy: [{ lastMsgTime: 'desc' }, { updatedAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.conversation.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async updateTicket(adminId: string, id: string, dto: UpdateAssistantTicketDto) {
    const prisma: any = this.prisma;
    const ticket = await prisma.assistantTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('咨询工单不存在');
    const context = await this.scope.getAdminContext(adminId);
    if (!context.isSuperAdmin && !context.regionIds.includes(ticket.regionId)) {
      throw new ForbiddenException('无权处理该咨询工单');
    }
    const reply = dto.reply ? this.content(dto.reply) : '';
    if (!reply && !dto.status) throw new BadRequestException('请填写回复或处理状态');
    const status = dto.status || ticket.status;

    if (reply && ticket.conversationId) {
      await this.notify.replyOfficialConversation(
        ticket.conversationId,
        reply,
        adminId,
        adminId,
        ticket.id,
        dto.status,
      );
      return prisma.assistantTicket.findUnique({ where: { id } });
    }

    const updated = await prisma.assistantTicket.update({
      where: { id },
      data: { status, handlerId: adminId, latestReply: reply || ticket.latestReply, unreadForUser: true },
    });
    if (reply) {
      // 兼容尚未回填 conversationId 的历史工单，继续写 Reply，避免丢失后台回复。
      await prisma.assistantTicketReply.create({
        data: { ticketId: id, senderType: 'admin', senderId: adminId, content: reply },
      });
    }

    // 验证工单ID有效性，构建安全的通知链接
    const safeTicketId = String(ticket.id).replace(/[^a-zA-Z0-9_-]/g, '');
    if (safeTicketId !== ticket.id) {
      this.logger.warn(`Ticket ID contains unsafe characters: ${ticket.id}`);
    }
    const notificationLink = `/pagesNews/news/OfficialAssistant/OfficialAssistant?view=ticket&ticketId=${encodeURIComponent(safeTicketId)}`;

    await this.notify.createAndDispatch({
      userId: ticket.userId,
      regionId: ticket.regionId,
      type: 'system',
      scene: 'assistant_ticket_updated',
      title: '咨询工单有新进展',
      content: reply || `工单 ${ticket.ticketNo} 状态已更新`,
      linkType: 'miniapp',
      linkValue: notificationLink
    }).catch((err) => {
      this.logger.warn(`Failed to send ticket notification: ${err.message}`);
    });

    return updated;
  }
}
