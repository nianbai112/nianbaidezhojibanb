import { BadRequestException, ForbiddenException, ValidationPipe } from '@nestjs/common';
import { AssistantTicketService } from './assistant-ticket.service';
import { CreateAssistantTicketDto, ReplyAssistantTicketDto } from './dto/assistant-ticket.dto';

describe('AssistantTicketService', () => {
  const prisma: any = {
    assistantTicket: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    assistantTicketReply: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
    userProfile: { findUnique: jest.fn().mockResolvedValue({ regionId: 'r1' }) },
    region: { findUnique: jest.fn().mockResolvedValue({ id: 'r1', isOpen: true }) },
    conversation: { findMany: jest.fn(), count: jest.fn() },
    message: { create: jest.fn(), update: jest.fn() },
    conversationMember: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const notify: any = {
    createAndDispatch: jest.fn().mockResolvedValue(undefined),
    ensureOfficialConversationForUser: jest.fn(),
    getOfficialAssistantUser: jest.fn(),
    replyOfficialConversation: jest.fn(),
  };
  const scope: any = { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: true, regionIds: [] }) };
  const service = new AssistantTicketService(prisma, notify, scope);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.assistantTicketReply.findFirst.mockResolvedValue(null);
  });

  it('keeps camelCase and snake_case client message ids through DTO whitelisting', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
    const createDto = await pipe.transform({
      regionId: 'r1', content: '订单问题', client_message_id: 'create-client-1',
    }, { type: 'body', metatype: CreateAssistantTicketDto });
    const replyDto = await pipe.transform({
      content: '补充材料', clientMessageId: 'reply-client-1',
    }, { type: 'body', metatype: ReplyAssistantTicketDto });

    expect(createDto.client_message_id).toBe('create-client-1');
    expect(replyDto.clientMessageId).toBe('reply-client-1');
  });

  it('rejects an empty consultation', async () => {
    await expect(service.createTicket('user-a', { regionId: 'r1', content: '   ' } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a consultation forged into another region', async () => {
    prisma.userProfile.findUnique.mockResolvedValueOnce({ regionId: 'r2' });
    await expect(service.createTicket('user-a', { regionId: 'r1', content: '订单问题' } as any)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates a new ticket from the canonical support Message ledger', async () => {
    const createdAt = new Date('2026-08-24T11:30:00.000Z');
    notify.ensureOfficialConversationForUser.mockResolvedValue({
      official: { id: 'official-user' },
      conversation: { id: 'conversation-1' },
    });
    const ticket = {
      id: 'ticket-new', userId: 'user-a', regionId: 'r1', conversationId: 'conversation-1',
      category: 'order', content: '订单问题', status: 'pending',
    };
    const tx: any = {
      message: {
        create: jest.fn().mockResolvedValue({ id: 'message-new', createdAt }),
        update: jest.fn().mockResolvedValue({}),
      },
      assistantTicket: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue(ticket),
        update: jest.fn().mockResolvedValue(ticket),
        findUnique: jest.fn().mockResolvedValue(ticket),
      },
      assistantTicketReply: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      conversation: { update: jest.fn().mockResolvedValue({}) },
      conversationMember: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    prisma.$transaction.mockImplementation((handler: any) => handler(tx));

    const result = await service.createTicket('user-a', {
      regionId: 'r1', content: '订单问题', category: 'order', clientMessageId: 'create-client-1',
    });

    expect(tx.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'conversation-1', senderId: 'user-a', type: 'TEXT', content: '订单问题',
        clientMessageId: 'create-client-1',
      },
    });
    expect(tx.assistantTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ conversationId: 'conversation-1', regionId: 'r1', category: 'order' }),
    });
    expect(tx.assistantTicketReply.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        messageId: 'message-new', ticketId: 'ticket-new', clientMessageId: 'create-client-1',
      }),
    });
    expect(result).toEqual(expect.objectContaining({ id: 'ticket-new' }));
  });

  it('returns the original ticket when create is retried with the same clientMessageId', async () => {
    prisma.assistantTicketReply.findFirst.mockResolvedValue({
      id: 'reply-existing',
      ticketId: 'ticket-existing',
      clientMessageId: 'create-client-retry',
      ticket: { id: 'ticket-existing', userId: 'user-a', regionId: 'r1', content: '订单问题' },
    });

    const result = await service.createTicket('user-a', {
      regionId: 'r1', content: '订单问题', clientMessageId: 'create-client-retry',
    });

    expect(result).toEqual(expect.objectContaining({ id: 'ticket-existing', duplicated: true }));
    expect(notify.ensureOfficialConversationForUser).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not expose a ticket to another user', async () => {
    prisma.assistantTicket.findUnique.mockResolvedValue({ id: 'ticket-a', userId: 'user-a' });
    await expect(service.getMyTicket('user-b', 'ticket-a')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('moves a waiting consultation back to processing when the user supplements it', async () => {
    prisma.assistantTicket.findUnique.mockResolvedValue({ id: 'ticket-a', userId: 'user-a', status: 'waiting_user' });
    prisma.assistantTicketReply.create.mockResolvedValue({ id: 'reply-a', ticketId: 'ticket-a', senderType: 'user', content: '补充凭证' });
    await service.replyToTicket('user-a', 'ticket-a', '补充凭证');
    expect(prisma.assistantTicket.update).toHaveBeenCalledWith({
      where: { id: 'ticket-a' },
      data: expect.objectContaining({ status: 'processing', unreadForUser: false }),
    });
  });

  it('writes a linked ticket reply through Message and keeps Reply as its projection', async () => {
    const createdAt = new Date('2026-08-24T12:00:00.000Z');
    prisma.assistantTicket.findUnique.mockResolvedValue({
      id: 'ticket-a', userId: 'user-a', regionId: 'r1', conversationId: 'conversation-1', status: 'waiting_user',
    });
    notify.getOfficialAssistantUser.mockResolvedValue({ id: 'official-user' });
    const tx: any = {
      message: {
        create: jest.fn().mockResolvedValue({ id: 'message-1', createdAt }),
        update: jest.fn().mockResolvedValue({}),
      },
      assistantTicket: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ticket-a', userId: 'user-a', regionId: 'r1', conversationId: 'conversation-1', status: 'waiting_user',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      assistantTicketReply: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      conversation: { update: jest.fn().mockResolvedValue({}) },
      conversationMember: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    prisma.$transaction.mockImplementation((handler: any) => handler(tx));

    const result = await service.replyToTicket('user-a', 'ticket-a', '补充凭证', 'reply-client-1');

    expect(tx.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: 'conversation-1', ticketId: 'ticket-a', senderId: 'user-a', content: '补充凭证',
        clientMessageId: 'reply-client-1',
      }),
    });
    expect(tx.assistantTicketReply.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticketId: 'ticket-a', messageId: 'message-1', clientMessageId: 'reply-client-1',
      }),
    });
    expect(prisma.assistantTicketReply.create).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ messageId: 'message-1', status: 'processing' }));
  });

  it('does not duplicate a ticket reply retried with the same clientMessageId', async () => {
    prisma.assistantTicket.findUnique.mockResolvedValue({
      id: 'ticket-a', userId: 'user-a', regionId: 'r1', conversationId: 'conversation-1', status: 'closed',
    });
    prisma.assistantTicketReply.findFirst.mockResolvedValue({
      id: 'reply-existing', ticketId: 'ticket-a', clientMessageId: 'reply-client-retry', content: '补充凭证',
    });

    const result = await service.replyToTicket('user-a', 'ticket-a', '补充凭证', 'reply-client-retry');

    expect(result).toEqual(expect.objectContaining({ id: 'reply-existing', duplicated: true }));
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.assistantTicketReply.create).not.toHaveBeenCalled();
  });

  it('routes a linked admin reply through the unified official conversation path', async () => {
    prisma.assistantTicket.findUnique.mockResolvedValue({
      id: 'ticket-a', ticketNo: 'CS1', userId: 'user-a', regionId: 'r1',
      conversationId: 'conversation-1', status: 'pending', latestReply: '原始问题',
    });
    prisma.assistantTicket.update.mockResolvedValue({ id: 'ticket-a', status: 'processing' });
    notify.replyOfficialConversation.mockResolvedValue({ messageId: 'message-admin-1' });

    await service.updateTicket('admin-a', 'ticket-a', { status: 'processing', reply: '后台回复' });

    expect(notify.replyOfficialConversation).toHaveBeenCalledWith(
      'conversation-1', '后台回复', 'admin-a', 'admin-a', 'ticket-a', 'processing',
    );
    expect(prisma.assistantTicketReply.create).not.toHaveBeenCalled();
    expect(prisma.assistantTicket.update).not.toHaveBeenCalled();
    expect(notify.createAndDispatch).not.toHaveBeenCalled();
  });

  it('lists only official conversations within the administrator region scope', async () => {
    scope.getAdminContext.mockResolvedValue({ isSuperAdmin: false, regionIds: ['r1'] });
    prisma.conversation.findMany.mockResolvedValue([]);
    prisma.conversation.count.mockResolvedValue(0);
    await service.listOfficialConversations('admin-a', {});
    expect(prisma.conversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        regionId: { in: ['r1'] },
        members: {
          some: {
            user: {
              OR: [
                { systemRole: 'OFFICIAL_ASSISTANT' },
                { openid: 'lingmeng_official_message_account' },
              ],
            },
          },
        },
      }),
    }));
  });
});
