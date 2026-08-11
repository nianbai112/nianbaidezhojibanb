import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AssistantTicketService } from './assistant-ticket.service';

describe('AssistantTicketService', () => {
  const prisma: any = {
    assistantTicket: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    assistantTicketReply: { create: jest.fn() },
    userProfile: { findUnique: jest.fn().mockResolvedValue({ regionId: 'r1' }) },
    region: { findUnique: jest.fn().mockResolvedValue({ id: 'r1', isOpen: true }) },
    conversation: { findMany: jest.fn(), count: jest.fn() },
  };
  const notify: any = { createAndDispatch: jest.fn().mockResolvedValue(undefined) };
  const scope: any = { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: true, regionIds: [] }) };
  const service = new AssistantTicketService(prisma, notify, scope);

  beforeEach(() => jest.clearAllMocks());

  it('rejects an empty consultation', async () => {
    await expect(service.createTicket('user-a', { regionId: 'r1', content: '   ' } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a consultation forged into another region', async () => {
    prisma.userProfile.findUnique.mockResolvedValueOnce({ regionId: 'r2' });
    await expect(service.createTicket('user-a', { regionId: 'r1', content: '订单问题' } as any)).rejects.toBeInstanceOf(ForbiddenException);
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

  it('lists only official conversations within the administrator region scope', async () => {
    scope.getAdminContext.mockResolvedValue({ isSuperAdmin: false, regionIds: ['r1'] });
    prisma.conversation.findMany.mockResolvedValue([]);
    prisma.conversation.count.mockResolvedValue(0);
    await service.listOfficialConversations('admin-a', {});
    expect(prisma.conversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ regionId: { in: ['r1'] }, members: { some: { user: { userType: 4 } } } }),
    }));
  });
});
