import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AdminDataScopeService } from '../../common/services/admin-data-scope.service';
import { NotifyService } from '../notify/notify.service';
import { CreateAssistantTicketDto, UpdateAssistantTicketDto } from './dto/assistant-ticket.dto';

@Injectable()
export class AssistantTicketService {
  constructor(private readonly prisma: PrismaService, private readonly notify: NotifyService, private readonly scope: AdminDataScopeService) {}

  private ticketNo() { return `CS${Date.now()}${Math.floor(Math.random() * 900 + 100)}`; }
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

  async createTicket(userId: string, dto: CreateAssistantTicketDto) {
    const content = this.content(dto.content);
    const regionId = String(dto.regionId || '').trim();
    if (!regionId) throw new BadRequestException('请选择当前校园');
    const prisma: any = this.prisma;
    const [profile, region] = await Promise.all([prisma.userProfile.findUnique({ where: { userId } }), prisma.region.findUnique({ where: { id: regionId } })]);
    if (!region || !region.isOpen) throw new NotFoundException('当前校园不存在或未开放');
    if (profile?.regionId && profile.regionId !== regionId) throw new ForbiddenException('只能在当前校园发起咨询');
    const category = ['order', 'account', 'feedback'].includes(String(dto.category)) ? dto.category : 'other';
    const ticket = await prisma.assistantTicket.create({ data: { ticketNo: this.ticketNo(), userId, regionId, category, content, latestReply: content, status: 'pending', unreadForUser: false } });
    await prisma.assistantTicketReply.create({ data: { ticketId: ticket.id, senderType: 'user', senderId: userId, content } });
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

  async replyToTicket(userId: string, id: string, value: string) {
    const content = this.content(value); const prisma: any = this.prisma;
    const ticket = await prisma.assistantTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('咨询工单不存在');
    if (ticket.userId !== userId) throw new ForbiddenException('无权回复该咨询工单');
    if (['resolved', 'closed'].includes(ticket.status)) throw new BadRequestException('该咨询已结束，请发起新的咨询');
    const reply = await prisma.assistantTicketReply.create({ data: { ticketId: id, senderType: 'user', senderId: userId, content } });
    const status = ticket.status === 'waiting_user' ? 'processing' : ticket.status;
    await prisma.assistantTicket.update({ where: { id }, data: { latestReply: content, unreadForUser: false, status } });
    return { ...reply, status };
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
    const where: any = { type: 'private', members: { some: { user: { userType: 4 } } } };
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
    const ticket = await (this.prisma as any).assistantTicket.findUnique({ where: { id } }); if (!ticket) throw new NotFoundException('咨询工单不存在');
    const context = await this.scope.getAdminContext(adminId); if (!context.isSuperAdmin && !context.regionIds.includes(ticket.regionId)) throw new ForbiddenException('无权处理该咨询工单');
    const reply = dto.reply ? this.content(dto.reply) : ''; if (!reply && !dto.status) throw new BadRequestException('请填写回复或处理状态');
    const status = dto.status || ticket.status; const updated = await (this.prisma as any).assistantTicket.update({ where: { id }, data: { status, handlerId: adminId, latestReply: reply || ticket.latestReply, unreadForUser: true } });
    if (reply) await (this.prisma as any).assistantTicketReply.create({ data: { ticketId: id, senderType: 'admin', senderId: adminId, content: reply } });
    await this.notify.createAndDispatch({ userId: ticket.userId, regionId: ticket.regionId, type: 'system', scene: 'assistant_ticket_updated', title: '咨询工单有新进展', content: reply || `工单 ${ticket.ticketNo} 状态已更新`, linkType: 'miniapp', linkValue: '/pagesA/news/OfficialAssistant/OfficialAssistant' }).catch(() => undefined);
    return updated;
  }
}
