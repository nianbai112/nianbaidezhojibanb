import { BadRequestException } from '@nestjs/common';

const ACTIVE_ASSISTANT_TICKET_STATUSES = ['pending', 'processing', 'waiting_user'];

export interface SyncOfficialAssistantTicketInput {
  userId: string;
  regionId: string;
  conversationId: string;
  messageId: string;
  content: string;
  clientMessageId?: string;
  ticketId?: string;
  startNew?: boolean;
  category?: string;
}

/**
 * Mirrors a user message into the ticket projection.
 * Explicit ticket ids never fall back to another ticket; implicit reuse is
 * restricted to the user's current region.
 */
export async function syncOfficialAssistantTicketMessage(tx: any, input: SyncOfficialAssistantTicketInput) {
  if (input.clientMessageId) {
    const existingReply = await tx.assistantTicketReply.findFirst({
      where: { senderId: input.userId, clientMessageId: input.clientMessageId },
      select: { ticketId: true },
    });
    if (existingReply) return existingReply.ticketId;
  }

  let ticket: any = null;
  if (input.ticketId) {
    ticket = await tx.assistantTicket.findFirst({
      where: { id: input.ticketId, userId: input.userId },
    });
    if (!ticket) throw new BadRequestException('指定的咨询工单不存在或不属于当前用户');
    if (ticket.conversationId && ticket.conversationId !== input.conversationId) {
      throw new BadRequestException('指定的咨询工单不属于当前官方会话');
    }
    if (ticket.regionId !== input.regionId) {
      throw new BadRequestException('指定的咨询工单不属于当前校园');
    }
  } else if (!input.startNew) {
    ticket = await tx.assistantTicket.findFirst({
      where: {
        userId: input.userId,
        regionId: input.regionId,
        OR: [
          { conversationId: input.conversationId },
          { conversationId: null },
        ],
        status: { in: ACTIVE_ASSISTANT_TICKET_STATUSES },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  if (!ticket) {
    ticket = await tx.assistantTicket.create({
      data: {
        ticketNo: `CS${Date.now()}${Math.floor(Math.random() * 900 + 100)}`,
        userId: input.userId,
        regionId: input.regionId,
        conversationId: input.conversationId,
        category: ['order', 'account', 'feedback'].includes(String(input.category)) ? input.category : 'other',
        content: input.content,
        latestReply: input.content,
        status: 'pending',
        unreadForUser: false,
      },
    });
  }

  await tx.assistantTicketReply.create({
    data: {
      ticketId: ticket.id,
      senderType: 'user',
      senderId: input.userId,
      clientMessageId: input.clientMessageId || null,
      messageId: input.messageId,
      content: input.content,
    },
  });
  await Promise.all([
    tx.message.update({
      where: { id: input.messageId },
      data: { ticketId: ticket.id },
    }),
    tx.assistantTicket.update({
      where: { id: ticket.id },
      data: {
        ...(ticket.conversationId ? {} : { conversationId: input.conversationId }),
        latestReply: input.content,
        unreadForUser: false,
        status: ticket.status === 'waiting_user' ? 'processing' : ticket.status,
      },
    }),
  ]);
  return ticket.id;
}
