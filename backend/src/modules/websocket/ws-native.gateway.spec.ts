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

  it('records an approved official rider connection as rider_app', async () => {
    const prisma: any = {
      regionRider: { findFirst: jest.fn().mockResolvedValue({ id: 'rider-1', regionId: 'region-1' }) },
      region: { findUnique: jest.fn().mockResolvedValue({ id: 'region-1' }) },
      realtimeSession: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const gateway = new WsNativeGateway(
      { verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-1' }) } as any,
      { get: jest.fn().mockReturnValue('secret') } as any,
      prisma,
      {} as any,
      {} as any,
      { assertActiveUser: jest.fn().mockResolvedValue(undefined) } as any,
    );
    (gateway as any).isRedisRateLimited = jest.fn().mockResolvedValue(false);
    (gateway as any).markPresenceOnline = jest.fn().mockResolvedValue(false);
    (gateway as any).getUnreadSummaryForUser = jest.fn().mockResolvedValue({ total: 0 });
    const ws = { on: jest.fn(), send: jest.fn(), close: jest.fn(), readyState: 1 };

    await (gateway as any).handleConnection(ws, {
      url: '/ws-native?token=valid&client=rider_app',
      headers: { host: 'localhost', 'user-agent': 'rider-device' },
      socket: { remoteAddress: '127.0.0.1' },
    });

    expect(prisma.realtimeSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-1', platform: 'rider_app', online: true }),
    });
  });

  it('rejects rider_app identity when its assigned region no longer exists', async () => {
    const prisma: any = {
      regionRider: {
        findFirst: jest.fn().mockResolvedValue({ id: 'rider-1', regionId: 'missing-region' }),
      },
      region: { findUnique: jest.fn().mockResolvedValue(null) },
      realtimeSession: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const gateway = new WsNativeGateway(
      { verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-1' }) } as any,
      { get: jest.fn().mockReturnValue('secret') } as any,
      prisma,
      {} as any,
      {} as any,
      { assertActiveUser: jest.fn().mockResolvedValue(undefined) } as any,
    );
    (gateway as any).isRedisRateLimited = jest.fn().mockResolvedValue(false);
    (gateway as any).markPresenceOnline = jest.fn().mockResolvedValue(false);
    (gateway as any).getUnreadSummaryForUser = jest.fn().mockResolvedValue({ total: 0 });
    const ws = { on: jest.fn(), send: jest.fn(), close: jest.fn(), readyState: 1 };

    await (gateway as any).handleConnection(ws, {
      url: '/ws-native?token=valid&client=rider_app',
      headers: { host: 'localhost' },
      socket: { remoteAddress: '127.0.0.1' },
    });

    expect(ws.close).toHaveBeenCalledWith(4003, 'Invalid token');
    expect(prisma.realtimeSession.create).not.toHaveBeenCalled();
  });

  it('rejects a rotated password token before protected WebSocket access', async () => {
    const userAccess = { assertActiveUser: jest.fn().mockResolvedValue(undefined) };
    const prisma: any = {
      riderAppPasswordCredential: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'credential-1',
          userId: 'user-1',
          enabled: true,
          expiresAt: null,
          sessionVersion: 4,
        }),
      },
      regionRider: { findFirst: jest.fn() },
      realtimeSession: { create: jest.fn(), updateMany: jest.fn() },
    };
    const gateway = new WsNativeGateway(
      { verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user-1',
        authSource: 'rider_password',
        credentialId: 'credential-1',
        credentialVersion: 3,
      }) } as any,
      { get: jest.fn().mockReturnValue('secret') } as any,
      prisma,
      {} as any,
      {} as any,
      userAccess as any,
    );
    (gateway as any).isRedisRateLimited = jest.fn().mockResolvedValue(false);
    const ws = { on: jest.fn(), send: jest.fn(), close: jest.fn(), readyState: 1 };

    await (gateway as any).handleConnection(ws, {
      url: '/ws-native?token=rotated&client=rider_app',
      headers: { host: 'localhost' },
      socket: { remoteAddress: '127.0.0.1' },
    });

    expect(prisma.riderAppPasswordCredential.findUnique).toHaveBeenCalledWith({
      where: { id: 'credential-1' },
    });
    expect(userAccess.assertActiveUser).not.toHaveBeenCalled();
    expect(prisma.regionRider.findFirst).not.toHaveBeenCalled();
    expect(prisma.realtimeSession.create).not.toHaveBeenCalled();
    expect(ws.close).toHaveBeenCalledWith(4003, 'Invalid token');
  });

  it.each([
    ['disable', { enabled: false }],
    ['password reset', { sessionVersion: 5 }],
    ['rider rebind', { userId: 'user-2' }],
  ])('closes an established password socket after credential %s', async (_label, override) => {
    const liveCredential = {
      id: 'rider-password-login',
      userId: 'user-1',
      enabled: true,
      expiresAt: null,
      sessionVersion: 4,
    };
    const prisma: any = {
      riderAppPasswordCredential: {
        findUnique: jest.fn()
          .mockResolvedValueOnce(liveCredential)
          .mockResolvedValue({ ...liveCredential, ...override }),
      },
      regionRider: { findFirst: jest.fn().mockResolvedValue({ id: 'rider-1', regionId: 'region-1' }) },
      region: { findUnique: jest.fn().mockResolvedValue({ id: 'region-1' }) },
      realtimeSession: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const userAccess = { assertActiveUser: jest.fn().mockResolvedValue(undefined) };
    const gateway = new WsNativeGateway(
      { verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user-1',
        authSource: 'rider_password',
        credentialId: 'rider-password-login',
        credentialVersion: 4,
      }) } as any,
      { get: jest.fn().mockReturnValue('secret') } as any,
      prisma,
      {} as any,
      {} as any,
      userAccess as any,
    );
    (gateway as any).isRedisRateLimited = jest.fn().mockResolvedValue(false);
    (gateway as any).markPresenceOnline = jest.fn().mockResolvedValue(false);
    (gateway as any).getUnreadSummaryForUser = jest.fn().mockResolvedValue({ total: 0 });
    const ws = { on: jest.fn(), send: jest.fn(), close: jest.fn(), readyState: 1 };

    await (gateway as any).handleConnection(ws, {
      url: '/ws-native?token=valid&client=rider_app',
      headers: { host: 'localhost' },
      socket: { remoteAddress: '127.0.0.1' },
    });
    const established = [...(gateway as any).clients.values()][0];
    await (gateway as any).handleMessage(
      established.socketId,
      Buffer.from(JSON.stringify({ event: 'ping' })),
    );

    expect(prisma.riderAppPasswordCredential.findUnique).toHaveBeenCalledTimes(2);
    expect(userAccess.assertActiveUser).toHaveBeenCalledTimes(1);
    expect(ws.close).toHaveBeenCalledWith(4003, 'Credential revoked');
  });

  it('rejects rider_app identity for a non-official account', async () => {
    const prisma: any = {
      regionRider: { findFirst: jest.fn().mockResolvedValue(null) },
      realtimeSession: { create: jest.fn(), updateMany: jest.fn() },
    };
    const gateway = new WsNativeGateway(
      { verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-1' }) } as any,
      { get: jest.fn().mockReturnValue('secret') } as any,
      prisma,
      {} as any,
      {} as any,
      { assertActiveUser: jest.fn().mockResolvedValue(undefined) } as any,
    );
    (gateway as any).isRedisRateLimited = jest.fn().mockResolvedValue(false);
    const ws = { on: jest.fn(), send: jest.fn(), close: jest.fn(), readyState: 1 };

    await (gateway as any).handleConnection(ws, {
      url: '/ws-native?token=valid&client=rider_app',
      headers: { host: 'localhost' },
      socket: { remoteAddress: '127.0.0.1' },
    });

    expect(ws.close).toHaveBeenCalledWith(4003, 'Invalid token');
    expect(prisma.realtimeSession.create).not.toHaveBeenCalled();
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

  it('terminates a stale socket so its final offline transition can be published', async () => {
    const gateway = createGateway({});
    const removeClient = jest.spyOn(gateway as any, 'removeClient').mockResolvedValue(undefined);
    const ws = { readyState: 1, ping: jest.fn(), terminate: jest.fn() };

    await (gateway as any).checkClientHeartbeat('socket-1', { ws, userId: 'user-1', isAdmin: false, socketId: 'socket-1', lastPongAt: 0 }, 75001);

    expect(ws.terminate).toHaveBeenCalledTimes(1);
    expect(removeClient).toHaveBeenCalledWith('socket-1');
  });

  it('revalidates a password credential during heartbeat before pinging', async () => {
    const prisma: any = {
      riderAppPasswordCredential: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'rider-password-login', userId: 'user-1', enabled: false,
          expiresAt: null, sessionVersion: 4,
        }),
      },
    };
    const gateway = new WsNativeGateway(
      {} as any,
      {} as any,
      prisma,
      {} as any,
      {} as any,
      { assertActiveUser: jest.fn() } as any,
    );
    const ws = { readyState: 1, ping: jest.fn(), close: jest.fn(), send: jest.fn() };
    const client = {
      ws, userId: 'user-1', isAdmin: false, platform: 'rider_app', socketId: 'socket-1',
      lastPongAt: Date.now(), authSource: 'rider_password',
      credentialId: 'rider-password-login', credentialVersion: 4,
    };

    await (gateway as any).checkClientHeartbeat('socket-1', client, Date.now());

    expect(prisma.riderAppPasswordCredential.findUnique).toHaveBeenCalledWith({
      where: { id: 'rider-password-login' },
    });
    expect(ws.close).toHaveBeenCalledWith(4003, 'Credential revoked');
    expect(ws.ping).not.toHaveBeenCalled();
  });

  it('closes matching credential sockets on every instance receiving a Redis revocation event', () => {
    const gateways = [createGateway({}), createGateway({})];
    const matchingSockets = gateways.map((gateway, index) => {
      const ws = { readyState: 1, close: jest.fn() };
      (gateway as any).clients.set(`socket-${index}`, {
        ws,
        userId: `user-${index}`,
        isAdmin: false,
        socketId: `socket-${index}`,
        authSource: 'rider_password',
        credentialId: 'rider-password-login',
        credentialVersion: 4,
      });
      return ws;
    });
    const ordinary = { readyState: 1, close: jest.fn() };
    (gateways[0] as any).clients.set('ordinary-socket', {
      ws: ordinary, userId: 'ordinary-user', isAdmin: false, socketId: 'ordinary-socket',
    });
    const event = JSON.stringify({
      targetType: 'rider_password_credential',
      targetId: 'rider-password-login',
    });

    gateways.forEach((gateway) => (gateway as any).handleRedisPushMessage(event));

    matchingSockets.forEach((ws) => expect(ws.close).toHaveBeenCalledWith(4003, 'Credential revoked'));
    expect(ordinary.close).not.toHaveBeenCalled();
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
