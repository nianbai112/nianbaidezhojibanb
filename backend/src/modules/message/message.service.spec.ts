import { MessageService } from './message.service';

describe('MessageService', () => {
  function createService(prismaOverrides: Record<string, any>) {
    const prisma = {
      user: {
        upsert: jest.fn().mockResolvedValue({
        id: 'official-user',
        nickname: '官方推送消息',
        avatar: '/static/logo.jpg',
        userType: 4,
        openid: 'lingmeng_official_message_account',
        systemRole: 'OFFICIAL_ASSISTANT',
        }),
      },
      conversation: {
        findUnique: jest.fn().mockResolvedValue({ id: 'official-conversation', scopeKey: 'support:r1:viewer', members: [] }),
        findFirst: jest.fn().mockResolvedValue({ id: 'official-conversation' }),
      },
      conversationMember: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
      },
      userMembership: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue({ regionId: 'r1' }),
      },
      realtimeSession: {
        findMany: jest.fn(),
      },
      ...prismaOverrides,
    };
    const privateMessagePermission = { check: jest.fn().mockResolvedValue({ allowed: true }) };
    const wsNative = { pushToUser: jest.fn() };
    const redis = { delPattern: jest.fn().mockResolvedValue(undefined) };

    return {
      service: new MessageService(prisma as any, privateMessagePermission as any, wsNative as any, redis as any),
      prisma,
      redis,
      privateMessagePermission,
      wsNative,
    };
  }

  it('returns visible online state for recent private chat users and hides it when privacy is off', async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 60 * 1000);
    const visibleUser = {
      id: 'user-online-visible',
      nickname: '在线显示用户',
      avatar: '/avatar-visible.png',
      userType: 1,
      settings: { showOnlineStatus: true },
    };
    const hiddenUser = {
      id: 'user-online-hidden',
      nickname: '在线隐藏用户',
      avatar: '/avatar-hidden.png',
      userType: 1,
      settings: { showOnlineStatus: false },
    };
    const { service, prisma } = createService({
      conversationMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            userId: 'viewer',
            unreadCount: 0,
            conversation: {
              id: 'conversation-visible',
              type: 'private',
              title: '',
              avatar: '',
              lastMessage: '你好',
              lastMsgTime: now,
              updatedAt: now,
              members: [{ user: visibleUser }],
            },
          },
          {
            userId: 'viewer',
            unreadCount: 0,
            conversation: {
              id: 'conversation-hidden',
              type: 'private',
              title: '',
              avatar: '',
              lastMessage: '在吗',
              lastMsgTime: new Date(now.getTime() - 1000),
              updatedAt: new Date(now.getTime() - 1000),
              members: [{ user: hiddenUser }],
            },
          },
        ]),
        count: jest.fn().mockResolvedValue(2),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      realtimeSession: {
        findMany: jest.fn().mockResolvedValue([
          { userId: visibleUser.id },
          { userId: hiddenUser.id },
        ]),
      },
    });

    const result = await service.getChatList('viewer', { page: 1, limit: 20 });
    const visibleChat = result.chatList.find((chat: any) => chat.other_user_id === visibleUser.id);
    const hiddenChat = result.chatList.find((chat: any) => chat.other_user_id === hiddenUser.id);

    expect(result.pagination).toMatchObject({
      current_page: 1,
      currentPage: 1,
      total_pages: 1,
      totalPages: 1,
      total: 2,
      page_size: 20,
      pageSize: 20,
    });

    expect(prisma.realtimeSession.findMany).toHaveBeenCalledWith({
      where: {
        userId: { in: [visibleUser.id, hiddenUser.id] },
        online: true,
        platform: 'miniapp',
        lastSeenAt: { gte: expect.any(Date) },
      },
      select: { userId: true },
    });
    expect(visibleChat).toMatchObject({
      online_status: 'online',
      is_online: true,
      online_visible: true,
      show_online_status: true,
    });
    expect(hiddenChat).toMatchObject({
      online_status: 'offline',
      is_online: false,
      online_visible: false,
      show_online_status: false,
    });
    expect(prisma.realtimeSession.findMany.mock.calls[0][0].where.lastSeenAt.gte.getTime()).toBeLessThanOrEqual(recent.getTime());
  });

  it('always exposes the official account as 校园小助手', () => {
    const { service } = createService({});
    const chat = (service as any).toClientChat({
      unreadCount: 0,
      conversation: {
        id: 'official-conversation',
        type: 'private',
        title: '官方推送消息',
        avatar: '/static/logo.jpg',
        lastMessage: '你好',
        members: [{ user: { id: 'official-user', userType: 4, systemRole: 'OFFICIAL_ASSISTANT', nickname: '官方推送消息', avatar: '/static/logo.jpg' } }],
      },
    });

    expect(chat).toMatchObject({
      name: '校园小助手',
      nickname: '校园小助手',
      avatar: '/static/logo.png',
      is_official: true,
    });
  });

  it('does not label an ordinary userType=4 bot as the official assistant', () => {
    const { service } = createService({});
    const chat = (service as any).toClientChat({
      unreadCount: 0,
      conversation: {
        id: 'bot-conversation',
        type: 'private',
        title: '',
        avatar: '',
        lastMessage: '机器人消息',
        members: [{ user: { id: 'bot-user', userType: 4, systemRole: null, openid: 'bot_123', nickname: '活动机器人', avatar: '/bot.png' } }],
      },
    });

    expect(chat).toMatchObject({
      name: '活动机器人',
      avatar: '/bot.png',
      is_official: false,
      pinned: false,
      role: 'user',
    });
  });

  it('returns actual visible online counts for group chats and members', async () => {
    const now = new Date();
    const group = {
      id: 'group-1', type: 'group', title: '测试群', avatar: '', lastMessage: '大家好', lastMsgTime: now, updatedAt: now,
      members: [{ user: { id: 'member-1', nickname: '成员一', avatar: '', userType: 1, settings: { showOnlineStatus: true } } }],
      _count: { members: 3 },
    };
    const { service } = createService({
      conversationMember: {
        findMany: jest.fn()
          .mockResolvedValueOnce([{ userId: 'viewer', unreadCount: 0, role: 'member', conversation: group }])
          .mockResolvedValueOnce([
            { conversationId: 'group-1', userId: 'viewer', user: { id: 'viewer', settings: { showOnlineStatus: true } } },
            { conversationId: 'group-1', userId: 'member-1', user: { id: 'member-1', settings: { showOnlineStatus: true } } },
            { conversationId: 'group-1', userId: 'member-hidden', user: { id: 'member-hidden', settings: { showOnlineStatus: false } } },
          ])
          .mockResolvedValueOnce([
            { id: 'member-row-1', userId: 'member-1', role: 'member', joinedAt: now, isMuted: false, user: { id: 'member-1', nickname: '成员一', avatar: '', settings: { showOnlineStatus: true } } },
          ]),
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      realtimeSession: { findMany: jest.fn().mockResolvedValue([{ userId: 'viewer' }, { userId: 'member-1' }, { userId: 'member-hidden' }]) },
    });

    const chats = await service.getChatList('viewer', { page: 1, limit: 20 });
    const groupMembers = await service.getGroupMembers('group-1', 'viewer', {});

    expect(chats.chatList[0]).toMatchObject({ type: 'group', member_count: 3, online_member_count: 2 });
    expect(groupMembers.members[0]).toMatchObject({ user_id: 'member-1', is_online: true });
  });

  it('clears cached unread totals after marking a conversation read', async () => {
    const { service, prisma, redis } = createService({
      message: { findFirst: jest.fn().mockResolvedValue({ id: 'message-1', createdAt: new Date() }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      conversationMember: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      conversation: { findUnique: jest.fn().mockResolvedValue({ type: 'private' }) },
    });

    await service.markConversationRead('viewer', { conversation_id: 'conversation-1' });

    expect(prisma.conversationMember.updateMany).toHaveBeenCalled();
    expect(redis.delPattern).toHaveBeenCalledWith('notify:unread:viewer:*');
  });

  it('sends an in-app post share through the authenticated private-message contract', async () => {
    const createdAt = new Date();
    const message = {
      id: 'message-share-1',
      conversationId: 'conversation-1',
      senderId: 'sender-1',
      type: 'TEXT',
      content: 'notes:标题|正文|post-1||||0',
      clientMessageId: 'share-client-1',
      createdAt,
      sender: { id: 'sender-1', nickname: '发送者', avatar: '/avatar.png' },
    };
    const tx = {
      message: { create: jest.fn().mockResolvedValue(message) },
      conversation: { update: jest.fn().mockResolvedValue({}) },
      conversationMember: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const { service, wsNative, redis } = createService({
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'receiver-1', userType: 1, settings: { messagePermission: 0 } }) },
      userProfile: { findUnique: jest.fn().mockResolvedValue({ regionId: 'region-1' }) },
      conversation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'conversation-1',
          type: 'private',
          isBlocked: false,
          members: [{ userId: 'sender-1', isMuted: false }, { userId: 'receiver-1', isMuted: false }],
        }),
      },
      message: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    });

    const result = await service.sendPrivateMessage('sender-1', {
      receiver_id: 'receiver-1',
      message: message.content,
      client_message_id: 'share-client-1',
      extra: { kind: 'post_share', postId: 'post-1' },
    });

    expect(result).toMatchObject({
      success: true,
      conversationId: 'conversation-1',
      message: {
        clientMessageId: 'share-client-1',
        client_message_id: 'share-client-1',
      },
    });
    expect(tx.message.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ clientMessageId: 'share-client-1', extra: { kind: 'post_share', postId: 'post-1' } }),
    }));
    expect(wsNative.pushToUser).toHaveBeenCalledWith('receiver-1', expect.objectContaining({ event: 'message', messageId: 'message-share-1' }));
    expect(redis.delPattern).toHaveBeenCalledWith('notify:unread:receiver-1:*');
  });

  it('reuses an active official ticket only in the current campus and links the message projection', async () => {
    const createdAt = new Date('2026-08-24T11:00:00.000Z');
    const tx: any = {
      message: {
        create: jest.fn().mockResolvedValue({
          id: 'message-official-1', conversationId: 'official-conversation', senderId: 'sender-1',
          type: 'TEXT', content: '咨询当前校园', clientMessageId: 'client-official-1', createdAt,
          sender: { id: 'sender-1', nickname: '发送者', avatar: '' },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      assistantTicketReply: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      assistantTicket: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ticket-current', regionId: 'region-current', conversationId: null, status: 'pending',
        }),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      conversation: { update: jest.fn().mockResolvedValue({}) },
      conversationMember: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const { service } = createService({
      user: {
        upsert: jest.fn().mockResolvedValue({
          id: 'official-user', nickname: '校园小助手', avatar: '/static/logo.png', userType: 4,
          systemRole: 'OFFICIAL_ASSISTANT', openid: 'lingmeng_official_message_account',
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'official-user', userType: 4, systemRole: 'OFFICIAL_ASSISTANT', openid: 'legacy-openid', settings: null,
        }),
      },
      userProfile: { findUnique: jest.fn().mockResolvedValue({ regionId: 'region-current' }) },
      conversation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'official-conversation', regionId: 'region-old', isBlocked: false,
          scopeKey: 'support:region-current:sender-1',
          members: [{ userId: 'sender-1', isMuted: false }, { userId: 'official-user', isMuted: false }],
        }),
        findFirst: jest.fn(),
      },
      message: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((handler: any) => handler(tx)),
    });

    const result = await service.sendPrivateMessage('sender-1', {
      receiverId: 'official-user',
      content: '咨询当前校园',
      clientMessageId: 'client-official-1',
    });

    expect(tx.assistantTicket.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: 'sender-1',
        regionId: 'region-current',
        OR: [{ conversationId: 'official-conversation' }, { conversationId: null }],
      }),
      orderBy: { updatedAt: 'desc' },
    });
    expect(tx.assistantTicket.create).not.toHaveBeenCalled();
    expect(tx.assistantTicketReply.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticketId: 'ticket-current', messageId: 'message-official-1', clientMessageId: 'client-official-1',
      }),
    });
    expect(tx.message.update).toHaveBeenCalledWith({
      where: { id: 'message-official-1' },
      data: { ticketId: 'ticket-current' },
    });
    expect(tx.conversation.update).toHaveBeenCalledWith({
      where: { id: 'official-conversation' },
      data: expect.objectContaining({ regionId: 'region-current' }),
    });
    expect(result).toEqual(expect.objectContaining({ assistantTicketId: 'ticket-current' }));
  });

  it('returns the persisted official message when an HTTP retry loses the clientMessageId race', async () => {
    const uniqueError: any = new Error('unique');
    uniqueError.code = 'P2002';
    const existing = {
      id: 'message-existing', conversationId: 'official-conversation', senderId: 'sender-1',
      type: 'TEXT', content: '并发咨询', clientMessageId: 'client-race-1',
      createdAt: new Date('2026-08-24T12:00:00.000Z'),
      sender: { id: 'sender-1', nickname: '发送者', avatar: '' },
    };
    const messageFindFirst = jest.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    const { service, wsNative } = createService({
      user: {
        upsert: jest.fn().mockResolvedValue({
          id: 'official-user', nickname: '校园小助手', avatar: '/static/logo.png', userType: 4,
          systemRole: 'OFFICIAL_ASSISTANT', openid: 'lingmeng_official_message_account',
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'official-user', userType: 4, systemRole: 'OFFICIAL_ASSISTANT',
          openid: 'lingmeng_official_message_account', settings: null,
        }),
      },
      userProfile: { findUnique: jest.fn().mockResolvedValue({ regionId: 'region-current' }) },
      conversation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'official-conversation', regionId: 'region-current', isBlocked: false,
          scopeKey: 'support:region-current:sender-1',
          members: [{ userId: 'sender-1', isMuted: false }, { userId: 'official-user', isMuted: false }],
        }),
      },
      message: { findFirst: messageFindFirst },
      assistantTicketReply: {
        findFirst: jest.fn().mockResolvedValue({ ticketId: 'ticket-existing' }),
      },
      $transaction: jest.fn().mockRejectedValue(uniqueError),
    });

    const result = await service.sendPrivateMessage('sender-1', {
      receiverId: 'official-user', content: '并发咨询', clientMessageId: 'client-race-1',
    });

    expect(result).toEqual(expect.objectContaining({
      success: true,
      duplicated: true,
      conversationId: 'official-conversation',
      assistantTicketId: 'ticket-existing',
      message: expect.objectContaining({ id: 'message-existing', clientMessageId: 'client-race-1' }),
    }));
    expect(messageFindFirst).toHaveBeenCalledTimes(2);
    expect(wsNative.pushToUser).not.toHaveBeenCalled();
  });
});
