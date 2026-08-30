import { isNativeWebSocketPath, WsNativeGateway } from "./ws-native.gateway";

describe("WsNativeGateway account lifecycle", () => {
  it("only claims the native WebSocket upgrade path", () => {
    expect(isNativeWebSocketPath("/ws-native?token=test", "localhost")).toBe(
      true,
    );
    expect(isNativeWebSocketPath("/socket.io/?EIO=4", "localhost")).toBe(false);
    expect(isNativeWebSocketPath("not a valid url", "bad host")).toBe(false);
  });

  const createGateway = (userAccess: any) =>
    new WsNativeGateway(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      userAccess,
    );

  it("rejects a message from an account that became inactive after connecting", async () => {
    const userAccess = {
      assertActiveUser: jest.fn().mockRejectedValue(new Error("账号已被禁用")),
    };
    const gateway = createGateway(userAccess);
    const ws = { close: jest.fn(), readyState: 1, send: jest.fn() };
    (gateway as any).clients.set("socket-1", {
      ws,
      userId: "user-1",
      isAdmin: false,
      socketId: "socket-1",
    });

    await (gateway as any).handleMessage(
      "socket-1",
      Buffer.from(JSON.stringify({ event: "ping" })),
    );

    expect(userAccess.assertActiveUser).toHaveBeenCalledWith(
      "user-1",
      "使用实时服务",
    );
    expect(ws.close).toHaveBeenCalledWith(4003, "Account inactive");
  });

  it("records an approved official rider connection as rider_app", async () => {
    const prisma: any = {
      regionRider: {
        findFirst: jest.fn().mockResolvedValue({ id: "rider-1" }),
      },
      realtimeSession: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const gateway = new WsNativeGateway(
      { verifyAsync: jest.fn().mockResolvedValue({ sub: "user-1" }) } as any,
      { get: jest.fn().mockReturnValue("secret") } as any,
      prisma,
      {} as any,
      {} as any,
      { assertActiveUser: jest.fn().mockResolvedValue(undefined) } as any,
    );
    (gateway as any).isRedisRateLimited = jest.fn().mockResolvedValue(false);
    (gateway as any).markPresenceOnline = jest.fn().mockResolvedValue(false);
    (gateway as any).getUnreadSummaryForUser = jest
      .fn()
      .mockResolvedValue({ total: 0 });
    const ws = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      readyState: 1,
    };

    await (gateway as any).handleConnection(ws, {
      url: "/ws-native?token=valid&client=rider_app",
      headers: { host: "localhost", "user-agent": "rider-device" },
      socket: { remoteAddress: "127.0.0.1" },
    });

    expect(prisma.realtimeSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        platform: "rider_app",
        online: true,
      }),
    });
    const messageListenerIndex = ws.on.mock.calls.findIndex(
      ([event]: [string]) => event === "message",
    );
    expect(messageListenerIndex).toBeGreaterThanOrEqual(0);
    expect(ws.on.mock.invocationCallOrder[messageListenerIndex]).toBeLessThan(
      ws.send.mock.invocationCallOrder[0],
    );
  });

  it("rejects rider_app identity for a non-official account", async () => {
    const prisma: any = {
      regionRider: { findFirst: jest.fn().mockResolvedValue(null) },
      realtimeSession: { create: jest.fn(), updateMany: jest.fn() },
    };
    const gateway = new WsNativeGateway(
      { verifyAsync: jest.fn().mockResolvedValue({ sub: "user-1" }) } as any,
      { get: jest.fn().mockReturnValue("secret") } as any,
      prisma,
      {} as any,
      {} as any,
      { assertActiveUser: jest.fn().mockResolvedValue(undefined) } as any,
    );
    (gateway as any).isRedisRateLimited = jest.fn().mockResolvedValue(false);
    const ws = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      readyState: 1,
    };

    await (gateway as any).handleConnection(ws, {
      url: "/ws-native?token=valid&client=rider_app",
      headers: { host: "localhost" },
      socket: { remoteAddress: "127.0.0.1" },
    });

    expect(ws.close).toHaveBeenCalledWith(4003, "Invalid token");
    expect(prisma.realtimeSession.create).not.toHaveBeenCalled();
  });

  it("allows an approved dorm-shop owner to connect as partner_app", async () => {
    const prisma: any = {
      regionRider: { findFirst: jest.fn().mockResolvedValue(null) },
      merchant: {
        findFirst: jest.fn().mockResolvedValue({ id: "merchant-1" }),
      },
      merchantStaff: { findFirst: jest.fn().mockResolvedValue(null) },
      realtimeSession: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const gateway = new WsNativeGateway(
      { verifyAsync: jest.fn().mockResolvedValue({ sub: "user-1" }) } as any,
      { get: jest.fn().mockReturnValue("secret") } as any,
      prisma,
      {} as any,
      {} as any,
      { assertActiveUser: jest.fn().mockResolvedValue(undefined) } as any,
    );
    (gateway as any).isRedisRateLimited = jest.fn().mockResolvedValue(false);
    (gateway as any).markPresenceOnline = jest.fn().mockResolvedValue(false);
    (gateway as any).getUnreadSummaryForUser = jest
      .fn()
      .mockResolvedValue({ total: 0 });
    const ws = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      readyState: 1,
    };

    await (gateway as any).handleConnection(ws, {
      url: "/ws-native?token=valid&client=partner_app",
      headers: { host: "localhost", "user-agent": "partner-device" },
      socket: { remoteAddress: "127.0.0.1" },
    });

    expect(prisma.realtimeSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        platform: "partner_app",
        online: true,
      }),
    });
  });

  it("rejects partner_app when the account has neither an official rider nor a dorm shop", async () => {
    const prisma: any = {
      regionRider: { findFirst: jest.fn().mockResolvedValue(null) },
      merchant: { findFirst: jest.fn().mockResolvedValue(null) },
      merchantStaff: { findFirst: jest.fn().mockResolvedValue(null) },
      realtimeSession: { create: jest.fn(), updateMany: jest.fn() },
    };
    const gateway = new WsNativeGateway(
      { verifyAsync: jest.fn().mockResolvedValue({ sub: "user-1" }) } as any,
      { get: jest.fn().mockReturnValue("secret") } as any,
      prisma,
      {} as any,
      {} as any,
      { assertActiveUser: jest.fn().mockResolvedValue(undefined) } as any,
    );
    (gateway as any).isRedisRateLimited = jest.fn().mockResolvedValue(false);
    const ws = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      readyState: 1,
    };

    await (gateway as any).handleConnection(ws, {
      url: "/ws-native?token=valid&client=partner_app",
      headers: { host: "localhost" },
      socket: { remoteAddress: "127.0.0.1" },
    });

    expect(ws.close).toHaveBeenCalledWith(4003, "Invalid token");
    expect(prisma.realtimeSession.create).not.toHaveBeenCalled();
  });

  it("pushes visible presence only to existing private and group peers", async () => {
    const gateway = createGateway({});
    (gateway as any).prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          userType: 1,
          settings: { showOnlineStatus: true },
        }),
      },
      conversationMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            conversationId: "private-1",
            conversation: { type: "private", members: [{ userId: "peer-1" }] },
          },
          {
            conversationId: "group-1",
            conversation: {
              type: "group",
              members: [{ userId: "peer-2" }, { userId: "peer-3" }],
            },
          },
        ]),
      },
    };
    const pushToUser = jest.spyOn(gateway, "pushToUser").mockReturnValue(0);

    await gateway.publishUserPresence("user-1", true);

    expect(pushToUser).toHaveBeenCalledWith(
      "peer-1",
      expect.objectContaining({ event: "presence_update", is_online: true }),
    );
    expect(pushToUser).toHaveBeenCalledWith(
      "peer-2",
      expect.objectContaining({
        event: "member_online",
        groupId: "group-1",
        userId: "user-1",
      }),
    );
    expect(pushToUser).toHaveBeenCalledWith(
      "peer-3",
      expect.objectContaining({
        event: "member_online",
        groupId: "group-1",
        userId: "user-1",
      }),
    );
    expect(pushToUser).toHaveBeenCalledTimes(3);
  });

  it("renews Redis presence when the mini-program business heartbeat arrives", async () => {
    const redis = {
      hset: jest.fn().mockResolvedValue(undefined),
      setJson: jest.fn().mockResolvedValue(undefined),
      expire: jest.fn().mockResolvedValue(undefined),
    };
    const gateway = new WsNativeGateway(
      {} as any,
      {} as any,
      {
        realtimeSession: { updateMany: jest.fn().mockResolvedValue(undefined) },
      } as any,
      redis as any,
      {} as any,
      { assertActiveUser: jest.fn().mockResolvedValue(undefined) } as any,
    );
    const ws = { close: jest.fn(), readyState: 1, send: jest.fn() };
    (gateway as any).clients.set("socket-1", {
      ws,
      userId: "user-1",
      isAdmin: false,
      socketId: "socket-1",
      lastPongAt: 0,
    });

    await (gateway as any).handleMessage(
      "socket-1",
      Buffer.from(JSON.stringify({ event: "ping" })),
    );

    expect(redis.expire).toHaveBeenCalledWith("lm:ws:native:user:user-1", 180);
    expect((gateway as any).clients.get("socket-1").lastPongAt).toBeGreaterThan(
      0,
    );
  });

  it("terminates a stale socket so its final offline transition can be published", () => {
    const gateway = createGateway({});
    const removeClient = jest
      .spyOn(gateway as any, "removeClient")
      .mockResolvedValue(undefined);
    const ws = { readyState: 1, ping: jest.fn(), terminate: jest.fn() };

    (gateway as any).checkClientHeartbeat(
      "socket-1",
      {
        ws,
        userId: "user-1",
        isAdmin: false,
        socketId: "socket-1",
        lastPongAt: 0,
      },
      75001,
    );

    expect(ws.terminate).toHaveBeenCalledTimes(1);
    expect(removeClient).toHaveBeenCalledWith("socket-1");
  });

  it("acknowledges a concurrent duplicate group message after the unique constraint wins", async () => {
    const existing = {
      id: "message-1",
      conversationId: "group-1",
      senderId: "user-1",
      clientMessageId: "client-1",
      createdAt: new Date("2026-07-28T10:00:00.000Z"),
      sender: { id: "user-1", nickname: "小明", avatar: "" },
    };
    const uniqueError: any = new Error("unique");
    uniqueError.code = "P2002";
    const prisma: any = {
      conversationMember: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ isMuted: false, user: existing.sender }),
      },
      conversation: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ type: "group", title: "群聊" }),
      },
      message: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(existing),
        create: jest.fn().mockRejectedValue(uniqueError),
      },
    };
    const gateway = new WsNativeGateway(
      {} as any,
      {} as any,
      prisma,
      {} as any,
      {} as any,
      {} as any,
    );
    const ws = { readyState: 1, send: jest.fn() };

    await (gateway as any).handleGroupMessage(
      { ws, userId: "user-1", isAdmin: false, socketId: "socket-1" },
      { groupId: "group-1", content: "你好", clientMessageId: "client-1" },
    );

    const ack = JSON.parse(ws.send.mock.calls[0][0]);
    expect(ack).toEqual(
      expect.objectContaining({
        event: "message_sent",
        data: expect.objectContaining({
          messageId: "message-1",
          duplicated: true,
        }),
      }),
    );
  });

  it("returns a correlated error instead of silently timing out for a malformed private message", async () => {
    const gateway = createGateway({});
    const ws = { readyState: 1, send: jest.fn() };

    await (gateway as any).handlePrivateMessage(
      { ws, userId: "user-1", isAdmin: false, socketId: "socket-1" },
      { message: "你好", clientMessageId: "client-bad-1" },
    );

    expect(JSON.parse(ws.send.mock.calls[0][0])).toEqual({
      event: "message_error",
      data: { message: "接收方信息缺失", clientMessageId: "client-bad-1" },
    });
  });

  it("persists an ordinary userType=4 bot message without creating an assistant ticket", async () => {
    const createdAt = new Date("2026-08-24T10:00:00.000Z");
    const tx: any = {
      message: {
        create: jest.fn().mockResolvedValue({
          id: "message-bot-1",
          conversationId: "conversation-bot-1",
          type: "TEXT",
          createdAt,
          sender: { id: "user-1", nickname: "用户", avatar: "" },
        }),
        update: jest.fn(),
      },
      conversation: { update: jest.fn().mockResolvedValue({}) },
      conversationMember: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      assistantTicket: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      assistantTicketReply: { findFirst: jest.fn(), create: jest.fn() },
    };
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "bot-1",
          userType: 4,
          systemRole: null,
          openid: "bot_campaign_1",
          settings: null,
        }),
      },
      conversation: {
        findFirst: jest.fn().mockResolvedValue({
          id: "conversation-bot-1",
          regionId: "region-1",
          isBlocked: false,
        }),
      },
      message: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((handler: any) => handler(tx)),
    };
    const gateway = new WsNativeGateway(
      {} as any,
      { get: jest.fn().mockReturnValue("true") } as any,
      prisma,
      { delPattern: jest.fn().mockResolvedValue(undefined) } as any,
      { check: jest.fn().mockResolvedValue({ allowed: true }) } as any,
      {} as any,
    );
    jest
      .spyOn(gateway as any, "pushUnreadSummary")
      .mockResolvedValue(undefined);
    const ws = { readyState: 1, send: jest.fn() };

    await (gateway as any).handlePrivateMessage(
      {
        ws,
        userId: "user-1",
        isAdmin: false,
        socketId: "socket-1",
        regionId: "region-1",
      },
      {
        receiverId: "bot-1",
        message: "你好机器人",
        clientMessageId: "client-bot-1",
      },
    );

    expect(tx.message.create).toHaveBeenCalledTimes(1);
    expect(tx.assistantTicket.findFirst).not.toHaveBeenCalled();
    expect(tx.assistantTicket.create).not.toHaveBeenCalled();
    expect(tx.assistantTicketReply.create).not.toHaveBeenCalled();
    const ack = JSON.parse(ws.send.mock.calls.at(-1)[0]);
    expect(ack).toEqual(
      expect.objectContaining({
        event: "message_sent",
        data: expect.objectContaining({ assistantTicketId: null }),
      }),
    );
  });

  it("commits an official support Message and ticket before sending the correlated acknowledgement", async () => {
    const createdAt = new Date("2026-08-24T10:10:00.000Z");
    const tx: any = {
      message: {
        create: jest.fn().mockResolvedValue({
          id: "message-official-1",
          conversationId: "conversation-official-1",
          type: "TEXT",
          createdAt,
          sender: { id: "user-1", nickname: "用户", avatar: "" },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      conversation: { update: jest.fn().mockResolvedValue({}) },
      conversationMember: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      assistantTicket: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: "ticket-ws-1",
          userId: "user-1",
          regionId: "region-current",
          conversationId: "conversation-official-1",
          status: "pending",
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      assistantTicketReply: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "official-1",
          userType: 4,
          systemRole: "OFFICIAL_ASSISTANT",
          openid: "lingmeng_official_message_account",
          settings: null,
        }),
      },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue({ regionId: "region-current" }),
      },
      conversation: {
        findUnique: jest.fn().mockResolvedValue({
          id: "conversation-official-1",
          regionId: "region-current",
          isBlocked: false,
          scopeKey: "support:region-current:user-1",
        }),
      },
      message: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((handler: any) => handler(tx)),
    };
    const gateway = new WsNativeGateway(
      {} as any,
      { get: jest.fn().mockReturnValue("true") } as any,
      prisma,
      { delPattern: jest.fn().mockResolvedValue(undefined) } as any,
      { check: jest.fn().mockResolvedValue({ allowed: true }) } as any,
      {} as any,
    );
    jest
      .spyOn(gateway as any, "pushUnreadSummary")
      .mockResolvedValue(undefined);
    const brokenReceiverWs = {
      readyState: 1,
      send: jest.fn(() => {
        throw new Error("socket already closed");
      }),
    };
    (gateway as any).clients.set("socket-official", {
      ws: brokenReceiverWs,
      userId: "official-1",
      isAdmin: false,
      socketId: "socket-official",
      lastPongAt: Date.now(),
    });
    (gateway as any).userSockets.set(
      "official-1",
      new Set(["socket-official"]),
    );
    const removeClient = jest
      .spyOn(gateway as any, "removeClient")
      .mockResolvedValue(undefined);
    const ws = { readyState: 1, send: jest.fn() };

    await (gateway as any).handlePrivateMessage(
      { ws, userId: "user-1", isAdmin: false, socketId: "socket-1" },
      {
        receiverId: "official-1",
        message: "咨询服务",
        clientMessageId: "client-official-ws-1",
      },
    );

    expect(tx.assistantTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        regionId: "region-current",
        conversationId: "conversation-official-1",
      }),
    });
    expect(tx.assistantTicketReply.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticketId: "ticket-ws-1",
        messageId: "message-official-1",
        clientMessageId: "client-official-ws-1",
      }),
    });
    const ack = JSON.parse(ws.send.mock.calls.at(-1)[0]);
    expect(ack).toEqual(
      expect.objectContaining({
        event: "message_sent",
        data: expect.objectContaining({
          messageId: "message-official-1",
          clientMessageId: "client-official-ws-1",
          assistantTicketId: "ticket-ws-1",
        }),
      }),
    );
    expect(removeClient).toHaveBeenCalledWith("socket-official");
  });

  it("returns a correlated error when private-message persistence throws", async () => {
    const gateway = createGateway({
      assertActiveUser: jest.fn().mockResolvedValue(undefined),
    });
    const ws = { readyState: 1, send: jest.fn() };
    (gateway as any).clients.set("socket-1", {
      ws,
      userId: "user-1",
      isAdmin: false,
      socketId: "socket-1",
    });
    jest
      .spyOn(gateway as any, "touchSession")
      .mockImplementation(() => undefined);
    jest.spyOn(gateway as any, "isRedisRateLimited").mockResolvedValue(false);
    jest
      .spyOn(gateway as any, "handlePrivateMessage")
      .mockRejectedValue(new Error("database unavailable"));

    await (gateway as any).handleMessage(
      "socket-1",
      Buffer.from(
        JSON.stringify({
          event: "message",
          receiverId: "official-1",
          message: "你好",
          clientMessageId: "client-failed-1",
        }),
      ),
    );

    expect(JSON.parse(ws.send.mock.calls[0][0])).toEqual({
      event: "message_error",
      data: {
        message: "消息发送失败，请稍后重试",
        clientMessageId: "client-failed-1",
      },
    });
  });

  it("batches realtime session touches into one indexed update", async () => {
    const prisma = {
      realtimeSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const gateway = new WsNativeGateway(
      {} as any,
      { get: jest.fn().mockReturnValue("1") } as any,
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
    );
    (gateway as any).clients.set("socket-1", {});
    (gateway as any).clients.set("socket-2", {});

    (gateway as any).touchSession("socket-1");
    (gateway as any).touchSession("socket-1");
    (gateway as any).touchSession("socket-2");
    await (gateway as any).flushSessionTouches();

    expect(prisma.realtimeSession.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.realtimeSession.updateMany).toHaveBeenCalledWith({
      where: {
        socketId: { in: ["socket-1", "socket-2"] },
        online: true,
      },
      data: { lastSeenAt: expect.any(Date) },
    });
  });

  it("only marks sessions older than the heartbeat grace period offline", async () => {
    const prisma = {
      realtimeSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const gateway = new WsNativeGateway(
      {} as any,
      { get: jest.fn().mockReturnValue("1") } as any,
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await (gateway as any).markStaleSessionsOffline();

    expect(prisma.realtimeSession.updateMany).toHaveBeenCalledWith({
      where: {
        online: true,
        lastSeenAt: { lt: expect.any(Date) },
      },
      data: { online: false },
    });
  });
});
