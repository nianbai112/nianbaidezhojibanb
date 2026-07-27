import { WsNativeGateway } from './ws-native.gateway';

describe('WsNativeGateway account lifecycle', () => {
  const createGateway = (userAccess: any) => new WsNativeGateway(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    userAccess,
  );

  it('rejects a message from an account that became inactive after connecting', async () => {
    const userAccess = { assertActiveUser: jest.fn().mockRejectedValue(new Error('账号已被禁用')) };
    const gateway = createGateway(userAccess);
    const ws = { close: jest.fn(), readyState: 1, send: jest.fn() };
    (gateway as any).clients.set('socket-1', { ws, userId: 'user-1', isAdmin: false, socketId: 'socket-1' });

    await (gateway as any).handleMessage('socket-1', Buffer.from(JSON.stringify({ event: 'ping' })));

    expect(userAccess.assertActiveUser).toHaveBeenCalledWith('user-1', '使用实时服务');
    expect(ws.close).toHaveBeenCalledWith(4003, 'Account inactive');
  });

  it('pushes visible presence only to existing private and group peers', async () => {
    const gateway = createGateway({});
    (gateway as any).prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ userType: 1, settings: { showOnlineStatus: true } }) },
      conversationMember: {
        findMany: jest.fn().mockResolvedValue([
          { conversationId: 'private-1', conversation: { type: 'private', members: [{ userId: 'peer-1' }] } },
          { conversationId: 'group-1', conversation: { type: 'group', members: [{ userId: 'peer-2' }, { userId: 'peer-3' }] } },
        ]),
      },
    };
    const pushToUser = jest.spyOn(gateway, 'pushToUser').mockReturnValue(0);

    await gateway.publishUserPresence('user-1', true);

    expect(pushToUser).toHaveBeenCalledWith('peer-1', expect.objectContaining({ event: 'presence_update', is_online: true }));
    expect(pushToUser).toHaveBeenCalledWith('peer-2', expect.objectContaining({ event: 'member_online', groupId: 'group-1', userId: 'user-1' }));
    expect(pushToUser).toHaveBeenCalledWith('peer-3', expect.objectContaining({ event: 'member_online', groupId: 'group-1', userId: 'user-1' }));
    expect(pushToUser).toHaveBeenCalledTimes(3);
  });

  it('renews Redis presence when the mini-program business heartbeat arrives', async () => {
    const redis = { hset: jest.fn().mockResolvedValue(undefined), setJson: jest.fn().mockResolvedValue(undefined), expire: jest.fn().mockResolvedValue(undefined) };
    const gateway = new WsNativeGateway({} as any, {} as any, { realtimeSession: { updateMany: jest.fn().mockResolvedValue(undefined) } } as any, redis as any, {} as any, { assertActiveUser: jest.fn().mockResolvedValue(undefined) } as any);
    const ws = { close: jest.fn(), readyState: 1, send: jest.fn() };
    (gateway as any).clients.set('socket-1', { ws, userId: 'user-1', isAdmin: false, socketId: 'socket-1', lastPongAt: 0 });

    await (gateway as any).handleMessage('socket-1', Buffer.from(JSON.stringify({ event: 'ping' })));

    expect(redis.expire).toHaveBeenCalledWith('lm:ws:native:user:user-1', 180);
    expect((gateway as any).clients.get('socket-1').lastPongAt).toBeGreaterThan(0);
  });

  it('terminates a stale socket so its final offline transition can be published', () => {
    const gateway = createGateway({});
    const removeClient = jest.spyOn(gateway as any, 'removeClient').mockResolvedValue(undefined);
    const ws = { readyState: 1, ping: jest.fn(), terminate: jest.fn() };

    (gateway as any).checkClientHeartbeat('socket-1', { ws, userId: 'user-1', isAdmin: false, socketId: 'socket-1', lastPongAt: 0 }, 75001);

    expect(ws.terminate).toHaveBeenCalledTimes(1);
    expect(removeClient).toHaveBeenCalledWith('socket-1');
  });

  it('acknowledges a concurrent duplicate group message after the unique constraint wins', async () => {
    const existing = {
      id: 'message-1', conversationId: 'group-1', senderId: 'user-1', clientMessageId: 'client-1',
      createdAt: new Date('2026-07-28T10:00:00.000Z'), sender: { id: 'user-1', nickname: '小明', avatar: '' },
    };
    const uniqueError: any = new Error('unique');
    uniqueError.code = 'P2002';
    const prisma: any = {
      conversationMember: { findFirst: jest.fn().mockResolvedValue({ isMuted: false, user: existing.sender }) },
      conversation: { findUnique: jest.fn().mockResolvedValue({ type: 'group', title: '群聊' }) },
      message: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(existing),
        create: jest.fn().mockRejectedValue(uniqueError),
      },
    };
    const gateway = new WsNativeGateway({} as any, {} as any, prisma, {} as any, {} as any, {} as any);
    const ws = { readyState: 1, send: jest.fn() };

    await (gateway as any).handleGroupMessage(
      { ws, userId: 'user-1', isAdmin: false, socketId: 'socket-1' },
      { groupId: 'group-1', content: '你好', clientMessageId: 'client-1' },
    );

    const ack = JSON.parse(ws.send.mock.calls[0][0]);
    expect(ack).toEqual(expect.objectContaining({
      event: 'message_sent', data: expect.objectContaining({ messageId: 'message-1', duplicated: true }),
    }));
  });
});
