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
        }),
      },
      conversation: {
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
        findUnique: jest.fn().mockResolvedValue(null),
      },
      realtimeSession: {
        findMany: jest.fn(),
      },
      ...prismaOverrides,
    };
    const privateMessagePermission = {};
    const wsNative = {};
    const redis = { delPattern: jest.fn().mockResolvedValue(undefined) };

    return {
      service: new MessageService(prisma as any, privateMessagePermission as any, wsNative as any, redis as any),
      prisma,
      redis,
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
        members: [{ user: { id: 'official-user', userType: 4, nickname: '官方推送消息', avatar: '/static/logo.jpg' } }],
      },
    });

    expect(chat).toMatchObject({
      name: '校园小助手',
      nickname: '校园小助手',
      avatar: '/static/logo.png',
      is_official: true,
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
});
