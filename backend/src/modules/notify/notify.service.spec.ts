import {
  BadRequestException,
  GoneException,
  ValidationPipe,
} from "@nestjs/common";
import { NotifyService } from "./notify.service";
import { AdminBroadcastDto } from "./dto/create-notification.dto";

const createPrismaMock = () => {
  const prisma = {
    officialAssistantMessage: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    notification: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn(),
    },
    conversationMember: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    assistantTicket: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    assistantTicketReply: { create: jest.fn() },
    user: {
      upsert: jest.fn().mockResolvedValue({
        id: "official-user",
        nickname: "校园小助手",
        avatar: "/static/logo.png",
      }),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    adminAccount: { findMany: jest.fn().mockResolvedValue([]) },
    regionRider: { findMany: jest.fn().mockResolvedValue([]) },
    region: { findMany: jest.fn().mockResolvedValue([]) },
    realtimeSession: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    conversation: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    message: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    userProfile: {
      findUnique: jest.fn(),
    },
    userSettings: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    userPushDevice: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    post: {
      updateMany: jest.fn(),
    },
    comment: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((handler: any) => handler(prisma));
  return prisma;
};

const createService = (
  prisma: ReturnType<typeof createPrismaMock>,
  channelService?: any,
  wsNative: any = {
    pushToUser: jest.fn(),
    pushToUserReliable: jest
      .fn()
      .mockResolvedValue({ localSent: 0, subscribers: 1 }),
    isSocketLive: jest.fn().mockReturnValue(false),
    getLiveSocketCount: jest.fn().mockReturnValue(0),
  },
  wsGateway: any = { pushNotification: jest.fn() },
) =>
  new NotifyService(
    prisma as any,
    {
      getJson: jest.fn().mockResolvedValue(null),
      setJson: jest.fn().mockResolvedValue(undefined),
      hgetall: jest.fn().mockResolvedValue({}),
      delPattern: jest.fn().mockResolvedValue(undefined),
      withLock: jest.fn(
        (_key: string, _ttl: number, task: () => Promise<any>) => task(),
      ),
    } as any,
    wsGateway as any,
    wsNative as any,
    {} as any,
    {
      getAdminContext: jest
        .fn()
        .mockResolvedValue({ isSuperAdmin: true, regionIds: [] }),
    } as any,
    channelService,
  );

describe("NotifyService takeaway template routing", () => {
  it("keeps order and community Mini Program templates separate and builds valid post pages", () => {
    const service = createService(createPrismaMock());

    expect((service as any).takeawayTemplateType("shop_order_ready")).toBe(
      "takeaway_rider_order",
    );
    expect((service as any).takeawayTemplateType("new_errand_order")).toBe(
      "takeaway_rider_order",
    );
    expect(
      (service as any).takeawayTemplateType(
        "takeaway_rider_assignment_released",
      ),
    ).toBe("takeaway_rider_order");
    expect((service as any).takeawayTemplateType("new_takeaway_order")).toBe(
      "takeaway_merchant_order",
    );
    expect(
      (service as any).takeawayTemplateType(
        "takeaway_unaccepted_auto_cancel_merchant",
      ),
    ).toBe("takeaway_merchant_order");
    expect(
      (service as any).takeawayTemplateType("takeaway_accept_reminder"),
    ).toBe("takeaway_merchant_order");
    expect((service as any).takeawayTemplateType("takeaway_rider_delay")).toBe(
      "takeaway_order_status",
    );
    expect(
      (service as any).takeawayTemplateType("dorm_shop_order_status"),
    ).toBe("takeaway_order_status");
    expect((service as any).miniProgramTemplateType("post_audit_result")).toBe(
      "post_audit_result",
    );
    expect((service as any).miniProgramTemplateType("post_comment")).toBe(
      "post_comment",
    );
    expect((service as any).miniProgramTemplateType("comment_reply")).toBe(
      "comment_reply",
    );
    expect(
      (service as any).wechatNotificationPage({
        linkType: "post",
        linkValue: "post-1",
      }),
    ).toBe("/pagesB/post/post?id=post-1");
  });
});

describe("NotifyService partner push payload", () => {
  it("keeps the dorm-shop order identifiers needed by the native deep link", async () => {
    const prisma = createPrismaMock();
    prisma.userPushDevice.findMany.mockResolvedValue([{ clientId: "cid-1" }]);
    const pushService = { sendToClient: jest.fn().mockResolvedValue(true) };
    const service = new NotifyService(
      prisma as any,
      {
        delPattern: jest.fn().mockResolvedValue(undefined),
        getJson: jest.fn().mockResolvedValue(null),
        setJson: jest.fn().mockResolvedValue(undefined),
      } as any,
      { pushNotification: jest.fn() } as any,
      { pushToUser: jest.fn().mockReturnValue(0) } as any,
      {} as any,
      {} as any,
      undefined,
      undefined,
      pushService as any,
    );

    await (service as any).deliverNotificationChannels(
      {
        id: "notification-1",
        userId: "owner-1",
        type: "ORDER",
        scene: "new_dorm_shop_order",
        title: "宿舍小店有新订单",
        content: "请及时处理",
        linkType: "page",
        linkValue: "/pagesA/order",
        data: { orderId: "order-1", merchantId: "merchant-1", orderNo: "DS-1" },
      },
      {
        websocket: false,
        push: true,
        email: false,
        sms: false,
        wechatSubscribe: false,
        officialAccount: false,
      },
    );

    expect(pushService.sendToClient).toHaveBeenCalledWith(
      "cid-1",
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: "order-1",
          merchantId: "merchant-1",
          orderNo: "DS-1",
          scene: "new_dorm_shop_order",
        }),
      }),
    );
  });
});

describe("NotifyService rider app realtime sessions", () => {
  it("labels rider app sessions with official rider identity and region", async () => {
    const prisma = createPrismaMock();
    prisma.realtimeSession.findMany.mockResolvedValue([
      {
        id: "session-1",
        userId: "user-1",
        adminId: null,
        socketId: "socket-1",
        platform: "rider_app",
        online: true,
        ip: "127.0.0.1",
        userAgent: "rider-device",
        lastSeenAt: new Date("2026-07-29T10:00:00.000Z"),
        createdAt: new Date("2026-07-29T09:00:00.000Z"),
      },
    ]);
    prisma.realtimeSession.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);
    prisma.user.findMany.mockResolvedValue([
      {
        id: "user-1",
        nickname: "昵称",
        avatar: "/avatar.png",
        phone: "13800138000",
        openid: "openid",
        userType: 1,
      },
    ]);
    prisma.regionRider.findMany.mockResolvedValue([
      {
        userId: "user-1",
        realName: "张骑手",
        phone: "13900139000",
        regionId: "region-1",
        status: "busy",
        verifyStatus: "approved",
        riderType: "official",
      },
    ]);
    prisma.region.findMany.mockResolvedValue([
      { id: "region-1", name: "第一校区" },
    ]);
    const service = createService(prisma);
    (service as any).wsNative.isSocketLive.mockReturnValue(true);
    (service as any).wsNative.getLiveSocketCount.mockReturnValue(1);

    const result = await service.getRealtimeSessions({
      platform: "rider_app",
      page: 1,
      pageSize: 50,
    });

    expect(result.list[0]).toEqual(
      expect.objectContaining({
        platform: "rider_app",
        actor: expect.objectContaining({ name: "张骑手", type: "官方骑手" }),
        rider: expect.objectContaining({
          regionName: "第一校区",
          status: "busy",
        }),
      }),
    );
    expect(result.stats).toEqual(
      expect.objectContaining({ riderAppOnlineCount: 1 }),
    );
  });
});

describe("NotifyService targeted admin notifications", () => {
  it("keeps userId through the production whitelist DTO", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    });
    const dto = await pipe.transform(
      {
        title: "单用户通知",
        content: "仅发送给目标用户",
        targetType: "user",
        userId: "user-1",
        channelMask: { inApp: true, websocket: true, push: false },
      },
      { type: "body", metatype: AdminBroadcastDto },
    );

    expect(dto).toEqual(
      expect.objectContaining({ targetType: "user", userId: "user-1" }),
    );
    expect(dto.channelMask).toEqual(expect.objectContaining({ push: false }));
  });

  it("creates exactly one persisted notification for a scoped user target", async () => {
    const prisma = createPrismaMock();
    prisma.user.findUnique.mockResolvedValue({ id: "user-1" });
    prisma.userProfile.findUnique.mockResolvedValue({ regionId: "region-1" });
    const service = createService(prisma);
    const createAndDispatch = jest
      .spyOn(service, "createAndDispatch")
      .mockResolvedValue({ id: "notification-1" } as any);

    const result = await service.adminBroadcast("admin-1", {
      title: "单用户通知",
      content: "仅发送给目标用户",
      targetType: "user",
      userId: "user-1",
      channelMask: { inApp: true, websocket: true },
    });

    expect(createAndDispatch).toHaveBeenCalledTimes(1);
    expect(createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        regionId: "region-1",
        type: "ADMIN_BROADCAST",
        scene: "admin_broadcast",
      }),
    );
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        targetType: "user",
        createdCount: 1,
        notificationId: "notification-1",
      }),
    );
  });
});

describe("NotifyService official assistant messages", () => {
  it("keeps client message ids in the admin official-conversation history contract", async () => {
    const prisma = createPrismaMock();
    prisma.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      type: "private",
      members: [
        {
          userId: "official-user",
          user: {
            id: "official-user",
            nickname: "校园小助手",
            avatar: "/static/logo.png",
            phone: "",
            openid: "",
            userType: 4,
          },
        },
        {
          userId: "user-1",
          user: {
            id: "user-1",
            nickname: "用户",
            avatar: "/avatar.png",
            phone: "",
            openid: "openid-1",
            userType: 1,
          },
        },
      ],
    });
    prisma.message.findMany.mockResolvedValue([
      {
        id: "message-1",
        clientMessageId: "client-1",
        senderId: "user-1",
        content: "你好",
        type: "TEXT",
        createdAt: new Date("2026-08-24T00:00:00.000Z"),
        sender: {
          id: "user-1",
          nickname: "用户",
          avatar: "/avatar.png",
          userType: 1,
        },
      },
    ]);
    prisma.message.count.mockResolvedValue(1);
    const service = createService(prisma);

    const result = await service.getOfficialConversationMessages(
      "conversation-1",
      { page: 1, pageSize: 30 },
    );

    expect(result.messages[0]).toEqual(
      expect.objectContaining({
        id: "message-1",
        clientMessageId: "client-1",
        client_message_id: "client-1",
      }),
    );
  });

  it("records a resolved service status and notifies the user in the official conversation", async () => {
    const prisma = createPrismaMock();
    prisma.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      regionId: "region-1",
      isBlocked: false,
      members: [{ userId: "user-1" }, { userId: "official-user" }],
    });
    prisma.conversationMember.findFirst.mockResolvedValue({ userId: "user-1" });
    prisma.assistantTicket.findFirst.mockResolvedValue({
      id: "ticket-1",
      userId: "user-1",
      regionId: "region-1",
      conversationId: "conversation-1",
      status: "processing",
    });
    prisma.message.create.mockResolvedValue({
      id: "message-1",
      createdAt: new Date("2026-07-12T10:00:00.000Z"),
    });
    prisma.conversation.update.mockResolvedValue({
      id: "conversation-1",
      serviceStatus: "resolved",
      serviceHandlerId: "admin-1",
    });
    const service = createService(prisma);

    const result = await service.updateOfficialConversationStatus(
      "conversation-1",
      "resolved",
      "admin-1",
      "已为你完成处理，请刷新订单查看。",
      "ticket-1",
    );

    expect(prisma.conversation.update).toHaveBeenLastCalledWith({
      where: { id: "conversation-1" },
      data: expect.objectContaining({
        serviceStatus: "resolved",
        serviceHandlerId: "admin-1",
        serviceHandledAt: expect.any(Date),
      }),
    });
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        content: "已为你完成处理，请刷新订单查看。",
      }),
    });
    expect(prisma.assistantTicket.update).toHaveBeenCalledTimes(1);
    expect(prisma.assistantTicket.update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: expect.objectContaining({
        status: "resolved",
        handlerId: "admin-1",
      }),
    });
    expect(result).toEqual(expect.objectContaining({ status: "resolved" }));
  });

  it("links an admin reply only to the explicitly selected ticket", async () => {
    const prisma = createPrismaMock();
    prisma.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      regionId: "region-1",
      isBlocked: false,
      members: [{ userId: "user-1" }, { userId: "official-user" }],
    });
    prisma.assistantTicket.findFirst.mockResolvedValue({
      id: "ticket-1",
      userId: "user-1",
      regionId: "region-1",
      conversationId: null,
      status: "pending",
    });
    prisma.message.create.mockResolvedValue({
      id: "message-1",
      createdAt: new Date("2026-08-24T10:00:00.000Z"),
    });
    const service = createService(prisma);

    const result = await service.replyOfficialConversation(
      "conversation-1",
      "已收到你的材料",
      "admin-1",
      undefined,
      "ticket-1",
    );

    expect(prisma.assistantTicket.findFirst).toHaveBeenCalledWith({
      where: { id: "ticket-1", userId: "user-1" },
    });
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ticketId: "ticket-1" }),
    });
    expect(prisma.assistantTicketReply.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticketId: "ticket-1",
        messageId: "message-1",
        content: "已收到你的材料",
      }),
    });
    expect(prisma.assistantTicket.update).toHaveBeenCalledWith({
      where: { id: "ticket-1" },
      data: expect.objectContaining({
        conversationId: "conversation-1",
        latestReply: "已收到你的材料",
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({ assistantTicketId: "ticket-1" }),
    );
  });

  it("rolls back the official message ledger and does not push when the ticket projection fails", async () => {
    const prisma = createPrismaMock();
    prisma.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      regionId: "region-1",
      isBlocked: false,
      members: [{ userId: "user-1" }, { userId: "official-user" }],
    });
    prisma.assistantTicket.findFirst.mockResolvedValue({
      id: "ticket-1",
      userId: "user-1",
      regionId: "region-1",
      conversationId: "conversation-1",
      status: "pending",
    });
    const committedMessages: any[] = [];
    const pendingMessages: any[] = [];
    const tx = {
      message: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          const saved = {
            id: "message-rollback",
            createdAt: new Date("2026-08-24T10:01:00.000Z"),
            ...data,
          };
          pendingMessages.push(saved);
          return saved;
        }),
      },
      conversation: { update: jest.fn().mockResolvedValue({}) },
      conversationMember: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      assistantTicketReply: {
        create: jest
          .fn()
          .mockRejectedValue(new Error("reply projection failed")),
      },
      assistantTicket: { update: jest.fn() },
    };
    prisma.$transaction.mockImplementation(async (handler: any) => {
      const result = await handler(tx);
      committedMessages.push(...pendingMessages);
      return result;
    });
    const service = createService(prisma);

    await expect(
      service.replyOfficialConversation(
        "conversation-1",
        "后台回复",
        "admin-1",
        undefined,
        "ticket-1",
      ),
    ).rejects.toThrow("reply projection failed");

    expect(tx.message.create).toHaveBeenCalledTimes(1);
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(committedMessages).toEqual([]);
    expect((service as any).wsNative.pushToUser).not.toHaveBeenCalled();
    expect((service as any).wsGateway.pushNotification).not.toHaveBeenCalled();
  });

  it("rejects binding an unlinked legacy ticket from another campus", async () => {
    const prisma = createPrismaMock();
    prisma.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      regionId: "region-current",
      isBlocked: false,
      members: [{ userId: "user-1" }, { userId: "official-user" }],
    });
    prisma.assistantTicket.findFirst.mockResolvedValue({
      id: "ticket-old-region",
      userId: "user-1",
      regionId: "region-old",
      conversationId: null,
      status: "pending",
    });
    const service = createService(prisma);

    await expect(
      service.replyOfficialConversation(
        "conversation-1",
        "后台回复",
        "admin-1",
        undefined,
        "ticket-old-region",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(prisma.assistantTicketReply.create).not.toHaveBeenCalled();
  });

  it("keeps a proactive official reply out of all tickets when ticketId is omitted", async () => {
    const prisma = createPrismaMock();
    prisma.conversation.findFirst.mockResolvedValue({
      id: "conversation-1",
      isBlocked: false,
      members: [{ userId: "user-1" }, { userId: "official-user" }],
    });
    prisma.message.create.mockResolvedValue({
      id: "message-proactive-1",
      createdAt: new Date("2026-08-24T10:05:00.000Z"),
    });
    const service = createService(prisma);

    const result = await service.replyOfficialConversation(
      "conversation-1",
      "欢迎使用校园服务",
      undefined,
      undefined,
    );

    expect(prisma.assistantTicket.findFirst).not.toHaveBeenCalled();
    expect(prisma.assistantTicketReply.create).not.toHaveBeenCalled();
    expect(prisma.assistantTicket.update).not.toHaveBeenCalled();
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticketId: null,
        content: "欢迎使用校园服务",
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({ assistantTicketId: null }),
    );
  });

  it("creates a published official assistant card with safe defaults", async () => {
    const prisma = createPrismaMock();
    prisma.officialAssistantMessage.create.mockResolvedValue({
      id: "assistant-1",
      category: "campus",
      renderType: "card",
      title: "校园活动周上线啦",
      content: "快来看看本周活动",
      status: "published",
      priority: 0,
      actions: [
        {
          text: "查看详情",
          type: "miniapp",
          value: "/pagesA/selection/list/list",
        },
      ],
      publishedAt: new Date("2026-06-25T09:30:00.000Z"),
    });
    const service = createService(prisma);

    const result = await service.createOfficialAssistantMessage("admin-1", {
      title: " 校园活动周上线啦 ",
      content: " 快来看看本周活动 ",
      category: "campus",
      actionText: "查看详情",
      actionType: "miniapp",
      actionValue: "/pagesA/selection/list/list",
    } as any);

    expect(prisma.officialAssistantMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "校园活动周上线啦",
        content: "快来看看本周活动",
        category: "campus",
        renderType: "card",
        status: "published",
        createdBy: "admin-1",
        actions: [
          {
            text: "查看详情",
            type: "miniapp",
            value: "/pagesA/selection/list/list",
          },
        ],
        publishedAt: expect.any(Date),
      }),
    });
    expect(result.title).toBe("校园活动周上线啦");
  });

  it("lists only published global and current-region official assistant messages for users", async () => {
    const prisma = createPrismaMock();
    prisma.officialAssistantMessage.findMany.mockResolvedValue([
      {
        id: "global-1",
        regionId: null,
        category: "campus",
        renderType: "card",
        title: "新生礼包到账",
        content: "包含校园权益券",
        status: "published",
        priority: 8,
        actions: [],
        publishedAt: new Date("2026-06-25T09:30:00.000Z"),
        createdAt: new Date("2026-06-25T09:00:00.000Z"),
      },
    ]);
    prisma.officialAssistantMessage.count.mockResolvedValue(1);
    const service = createService(prisma);

    const result = await service.getOfficialAssistantTimeline("user-1", {
      regionId: "region-1",
      page: 1,
      pageSize: 20,
    } as any);

    expect(prisma.officialAssistantMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "published",
          OR: [{ regionId: "region-1" }, { regionId: null }],
        },
        orderBy: [
          { priority: "desc" },
          { publishedAt: "desc" },
          { createdAt: "desc" },
        ],
      }),
    );
    expect(result.assistant.name).toBe("校园小助手");
    expect(result.list).toHaveLength(1);
    expect(result.list[0]).toEqual(
      expect.objectContaining({
        id: "global-1",
        title: "新生礼包到账",
        categoryLabel: "校园通知",
      }),
    );
  });
});

describe("NotifyService.createAndDispatchInteraction", () => {
  it("reuses a recent notification for the same actor and target", async () => {
    const prisma = createPrismaMock();
    prisma.notification.findMany.mockResolvedValueOnce([
      {
        id: "notice-1",
        data: { fromUserId: "actor-1" },
        createdAt: new Date(),
        isRead: false,
      },
    ]);
    const service = createService(prisma);

    const result = await service.createAndDispatchInteraction({
      userId: "author-1",
      regionId: "region-1",
      type: "LIKE",
      scene: "post_like",
      title: "有人点赞了你的帖子",
      content: "小满赞了你的帖子",
      data: { postId: "post-1", fromUserId: "actor-1" },
      linkType: "post",
      linkValue: "post-1",
      channelMask: { inApp: true, websocket: true },
    });

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "author-1",
          type: "LIKE",
          scene: "post_like",
          linkType: "post",
          linkValue: "post-1",
        }),
        take: 50,
      }),
    );
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        id: "notice-1",
        deduped: true,
      }),
    );
  });

  it("creates and dispatches when only other actors have recent notifications", async () => {
    const prisma = createPrismaMock();
    prisma.notification.findMany
      .mockResolvedValueOnce([
        { id: "notice-other", data: { fromUserId: "actor-2" } },
      ])
      .mockResolvedValueOnce([{ type: "LIKE" }]);
    prisma.notification.create.mockResolvedValue({
      id: "notice-2",
      userId: "author-1",
      type: "LIKE",
      scene: "post_like",
      title: "有人点赞了你的帖子",
      content: "小满赞了你的帖子",
      data: { postId: "post-1", fromUserId: "actor-1" },
      linkType: "post",
      linkValue: "post-1",
      createdAt: new Date("2026-07-02T09:00:00.000Z"),
    });
    const service = createService(prisma);

    const result = await service.createAndDispatchInteraction({
      userId: "author-1",
      regionId: "region-1",
      type: "LIKE",
      scene: "post_like",
      title: "有人点赞了你的帖子",
      content: "小满赞了你的帖子",
      data: { postId: "post-1", fromUserId: "actor-1" },
      linkType: "post",
      linkValue: "post-1",
      channelMask: { inApp: true, websocket: true },
    });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "author-1",
        type: "LIKE",
        scene: "post_like",
        linkType: "post",
        linkValue: "post-1",
      }),
    });
    expect(result).toEqual(expect.objectContaining({ id: "notice-2" }));
  });
});

describe("NotifyService.createAndDispatch notification channels", () => {
  it("marks native WebSocket delivery failed when no Realtime subscriber accepts it", async () => {
    const prisma = createPrismaMock();
    const wsNative = {
      pushToUserReliable: jest
        .fn()
        .mockResolvedValue({ localSent: 0, subscribers: 0 }),
    };
    const service = createService(prisma, undefined, wsNative, null);

    const delivery = await (service as any).deliverNotificationChannels(
      {
        id: "notice-offline-realtime",
        userId: "user-1",
        type: "ORDER",
        title: "订单更新",
        content: "订单状态发生变化",
        data: {},
        createdAt: new Date(),
      },
      { websocket: true, push: false },
    );

    expect(delivery.deliveryStatus).toBe("partial");
    expect(delivery.report.websocket).toEqual(
      expect.objectContaining({
        status: "failed",
        transports: {
          socketIo: {
            status: "skipped",
            reason: "compatibility_gateway_not_loaded",
          },
          native: { status: "failed", error: "no_realtime_subscriber" },
        },
      }),
    );
  });

  it("delivers an enabled order notice by email when the caller omits email from the mask", async () => {
    const prisma = createPrismaMock();
    const queuedNotification = {
      id: "notice-1",
      userId: "user-1",
      type: "ORDER",
      scene: "order_payment",
      title: "支付成功",
      content: "订单已支付",
      channelMask: {
        inApp: true,
        websocket: false,
        email: true,
        sms: false,
      },
      deliveryStatus: "pending",
      createdAt: new Date(),
    };
    prisma.notification.create.mockResolvedValue(queuedNotification);
    prisma.notification.findMany.mockResolvedValueOnce([queuedNotification]);
    prisma.notification.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    prisma.userProfile.findUnique.mockResolvedValue({
      email: "user@example.com",
    });
    const channelService = {
      resolveChannelMask: jest.fn().mockResolvedValue({
        inApp: true,
        websocket: false,
        email: true,
        sms: false,
      }),
      isChannelEnabled: jest.fn().mockResolvedValue(true),
      sendEmail: jest.fn().mockResolvedValue(true),
    };
    const service = createService(prisma, channelService);

    const result = await service.createAndDispatch({
      userId: "user-1",
      type: "ORDER",
      scene: "order_payment",
      title: "支付成功",
      content: "订单已支付",
      channelMask: { inApp: true, websocket: false },
    });

    expect(channelService.resolveChannelMask).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        id: "notice-1",
        deliveryStatus: "pending",
        queued: true,
      }),
    );
    expect(channelService.sendEmail).not.toHaveBeenCalled();

    await service.dispatchPendingNotifications();

    expect(channelService.sendEmail).toHaveBeenCalledWith(
      "user@example.com",
      "支付成功",
      "订单已支付",
    );
    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "notice-1" },
        data: expect.objectContaining({
          deliveryStatus: "delivered",
          deliveryReport: expect.objectContaining({
            email: { status: "success" },
          }),
        }),
      }),
    );
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "notice-1", deliveryStatus: "pending" },
        data: expect.objectContaining({
          deliveryStatus: "processing",
          deliveryAttempts: { increment: 1 },
        }),
      }),
    );
  });

  it("records a partial delivery and supports a later retry", async () => {
    const prisma = createPrismaMock();
    prisma.notification.findUnique.mockResolvedValue({
      id: "notice-2",
      userId: "user-1",
      type: "ORDER",
      title: "订单更新",
      content: "订单状态发生变化",
      channelMask: { inApp: true, websocket: false, email: true },
      deliveryReport: {
        inApp: { status: "success" },
        websocket: { status: "success" },
        email: { status: "failed", error: "first timeout" },
      },
      createdAt: new Date(),
    });
    prisma.notification.update.mockResolvedValue({
      id: "notice-2",
      deliveryStatus: "partial",
    });
    prisma.userProfile.findUnique.mockResolvedValue({
      email: "user@example.com",
    });
    const channelService = {
      isChannelEnabled: jest.fn().mockResolvedValue(true),
      sendEmail: jest.fn().mockRejectedValue(new Error("smtp timeout")),
    };
    const service = createService(prisma, channelService);

    await service.retryNotificationDelivery("notice-2");

    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "notice-2" },
        data: expect.objectContaining({
          deliveryStatus: "partial",
          deliveryReport: expect.objectContaining({
            websocket: { status: "success" },
            email: { status: "failed", error: "smtp timeout" },
          }),
          deliveryAttempts: { increment: 1 },
        }),
      }),
    );
  });

  it("retries a failed native push delivery", async () => {
    const prisma = createPrismaMock();
    prisma.notification.findUnique.mockResolvedValue({
      id: "notice-push",
      userId: "owner-1",
      type: "ORDER",
      scene: "new_dorm_shop_order",
      title: "宿舍小店有新订单",
      content: "请及时处理",
      data: { orderId: "order-1", merchantId: "merchant-1", orderNo: "DS-1" },
      channelMask: { inApp: true, websocket: false, push: true },
      deliveryReport: { push: { status: "failed", error: "gateway timeout" } },
      createdAt: new Date(),
    });
    prisma.notification.update.mockResolvedValue({
      id: "notice-push",
      deliveryStatus: "delivered",
    });
    prisma.userPushDevice.findMany.mockResolvedValue([{ clientId: "cid-1" }]);
    const pushService = { sendToClient: jest.fn().mockResolvedValue(true) };
    const wechatSubscribe = {
      sendSubscribeMessage: jest.fn().mockResolvedValue({ success: true }),
    };
    const service = new NotifyService(
      prisma as any,
      {
        delPattern: jest.fn().mockResolvedValue(undefined),
        getJson: jest.fn().mockResolvedValue(null),
        setJson: jest.fn().mockResolvedValue(undefined),
      } as any,
      { pushNotification: jest.fn() } as any,
      {
        pushToUser: jest.fn(),
        isSocketLive: jest.fn(),
        getLiveSocketCount: jest.fn(),
      } as any,
      {} as any,
      {} as any,
      undefined,
      wechatSubscribe as any,
      pushService as any,
    );

    await service.retryNotificationDelivery("notice-push");

    expect(pushService.sendToClient).toHaveBeenCalledWith(
      "cid-1",
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: "order-1",
          merchantId: "merchant-1",
        }),
      }),
    );
    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deliveryReport: expect.objectContaining({
            push: expect.objectContaining({ status: "success" }),
          }),
        }),
      }),
    );
    expect(wechatSubscribe.sendSubscribeMessage).not.toHaveBeenCalled();
  });

  it("keeps implicit Mini Program delivery for a legacy notification without a delivery report", async () => {
    const prisma = createPrismaMock();
    prisma.notification.findUnique.mockResolvedValue({
      id: "notice-legacy",
      userId: "owner-1",
      type: "ORDER",
      scene: "new_dorm_shop_order",
      title: "宿舍小店有新订单",
      content: "请及时处理",
      data: { orderId: "order-1", merchantId: "merchant-1" },
      channelMask: { inApp: true, websocket: false },
      deliveryReport: {},
      createdAt: new Date(),
    });
    prisma.notification.update.mockResolvedValue({
      id: "notice-legacy",
      deliveryStatus: "delivered",
    });
    const wechatSubscribe = {
      sendSubscribeMessage: jest.fn().mockResolvedValue({ success: true }),
    };
    const service = new NotifyService(
      prisma as any,
      {
        delPattern: jest.fn().mockResolvedValue(undefined),
        getJson: jest.fn().mockResolvedValue(null),
        setJson: jest.fn().mockResolvedValue(undefined),
      } as any,
      { pushNotification: jest.fn() } as any,
      {
        pushToUser: jest.fn(),
        isSocketLive: jest.fn(),
        getLiveSocketCount: jest.fn(),
      } as any,
      {} as any,
      {} as any,
      undefined,
      wechatSubscribe as any,
    );

    await service.retryNotificationDelivery("notice-legacy");

    expect(wechatSubscribe.sendSubscribeMessage).toHaveBeenCalledWith(
      expect.objectContaining({ templateType: "takeaway_merchant_order" }),
    );
  });

  it("does not retry a retired notification", async () => {
    const prisma = createPrismaMock();
    const notification = {
      id: "notice-retired",
      userId: "user-1",
      deliveryStatus: "retired",
      channelMask: { inApp: true, websocket: true },
      deliveryReport: { websocket: { status: "failed" } },
    };
    prisma.notification.findUnique.mockResolvedValue(notification);
    const channelService = {
      isChannelEnabled: jest.fn(),
      sendEmail: jest.fn(),
    };
    const service = createService(prisma, channelService);

    await expect(
      service.retryNotificationDelivery("notice-retired"),
    ).resolves.toEqual({
      success: true,
      notification,
      message: "该通知已退役，不再重试投递",
    });
    expect(prisma.notification.update).not.toHaveBeenCalled();
    expect(channelService.isChannelEnabled).not.toHaveBeenCalled();
  });

  it("automatically retries eligible partial deliveries and stops at the query limit", async () => {
    const prisma = createPrismaMock();
    prisma.notification.findMany.mockResolvedValueOnce([{ id: "notice-auto" }]);
    prisma.notification.findUnique.mockResolvedValue({
      id: "notice-auto",
      userId: "user-1",
      type: "ORDER",
      title: "订单更新",
      content: "订单状态发生变化",
      channelMask: { inApp: true, websocket: false, email: true },
      deliveryReport: { email: { status: "failed", error: "timeout" } },
      createdAt: new Date(),
    });
    prisma.notification.update.mockResolvedValue({
      id: "notice-auto",
      deliveryStatus: "delivered",
    });
    prisma.userProfile.findUnique.mockResolvedValue({
      email: "user@example.com",
    });
    const channelService = {
      isChannelEnabled: jest.fn().mockResolvedValue(true),
      sendEmail: jest.fn().mockResolvedValue(true),
    };
    const service = createService(prisma, channelService);

    const result = await service.retryFailedNotificationDeliveries();

    expect(result).toEqual({ processed: 1 });
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deliveryStatus: "partial",
          deliveryAttempts: { lt: 3 },
        }),
        take: 50,
      }),
    );
    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deliveryStatus: "delivered" }),
      }),
    );
  });
});

describe("NotifyService.reviewNotification", () => {
  it("retires the legacy notification review endpoint without writing content", async () => {
    const prisma = createPrismaMock();
    const service = createService(prisma);

    await expect(
      service.reviewNotification("user-1", "notice-1", "approve"),
    ).rejects.toThrow(GoneException);
    expect(prisma.notification.findUnique).not.toHaveBeenCalled();
    expect(prisma.notification.update).not.toHaveBeenCalled();
    expect(prisma.post.updateMany).not.toHaveBeenCalled();
    expect(prisma.comment.update).not.toHaveBeenCalled();
  });
});

describe("NotifyService interaction inbox", () => {
  it("queries all social interaction types and only unread rows when requested", async () => {
    const prisma = createPrismaMock();
    const service = createService(prisma);

    await service.getCenterList("user-1", {
      type: "interaction",
      unreadOnly: "1",
      page: 1,
      pageSize: 20,
    });

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          isRead: false,
          hiddenAt: null,
          type: {
            in: ["COMMENT", "REPLY", "MENTION", "LIKE", "FOLLOW", "SQUAT"],
          },
        }),
      }),
    );
  });

  it("marks the current region interaction group as read without touching other regions", async () => {
    const prisma = createPrismaMock();
    prisma.notification.updateMany.mockResolvedValue({ count: 3 });
    const service = createService(prisma);

    await service.markAllRead("user-1", {
      type: "interaction",
      regionId: "region-1",
    });

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        isRead: false,
        hiddenAt: null,
        type: {
          in: ["COMMENT", "REPLY", "MENTION", "LIKE", "FOLLOW", "SQUAT"],
        },
        OR: [{ regionId: "region-1" }, { regionId: null }],
      },
      data: { isRead: true, readAt: expect.any(Date) },
    });
  });

  it("hides a notification from the user inbox without deleting the history row", async () => {
    const prisma = createPrismaMock();
    const service = createService(prisma);

    await service.deleteNotification("user-1", "notice-1");

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: "notice-1", userId: "user-1" },
      data: {
        hiddenAt: expect.any(Date),
        isRead: true,
        readAt: expect.any(Date),
      },
    });
  });

  it("batch hides only the current user visible notifications", async () => {
    const prisma = createPrismaMock();
    prisma.notification.updateMany.mockResolvedValue({ count: 2 });
    const service = createService(prisma);

    const result = await service.batchAction(
      "user-1",
      ["notice-1", "notice-2"],
      "hide",
    );

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["notice-1", "notice-2"] },
        userId: "user-1",
        hiddenAt: null,
      },
      data: {
        hiddenAt: expect.any(Date),
        isRead: true,
        readAt: expect.any(Date),
      },
    });
    expect(result).toEqual({ success: true, affected: 2 });
  });

  it("skips disabled interaction notifications before creating a history row", async () => {
    const prisma = createPrismaMock();
    prisma.userSettings.findUnique.mockResolvedValue({ notifyLike: false });
    const service = createService(prisma);

    const result = await service.createAndDispatch({
      userId: "user-1",
      type: "LIKE",
      title: "有人点赞",
      content: "点赞了你的内容",
    });

    expect(result).toEqual({
      skipped: true,
      reason: "user_notification_preference",
    });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

describe("NotifyService visible unread buckets", () => {
  it("returns every non-interaction notification from the system inbox query", async () => {
    const prisma = createPrismaMock();
    const service = createService(prisma);

    await service.getCenterList("user-1", {
      type: "system",
      page: 1,
      pageSize: 20,
    });

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: {
            in: [
              "SYSTEM",
              "ADMIN_BROADCAST",
              "ANNOUNCEMENT",
              "MESSAGE",
              "CIRCLE",
              "ORDER",
              "DELIVERY",
              "REFUND",
              "WALLET",
              "CERTIFICATION",
              "MERCHANT",
            ],
          },
        }),
      }),
    );
  });

  it("makes total unread equal the two visible message-page buckets", async () => {
    const prisma = createPrismaMock();
    prisma.notification.findMany.mockResolvedValue([
      { type: "ORDER" },
      { type: "WALLET" },
      { type: "SYSTEM" },
      { type: "LIKE" },
    ]);
    prisma.conversationMember.findMany.mockResolvedValue([
      { unreadCount: 3, conversation: { type: "private" } },
    ]);

    const result = await createService(prisma).getUnreadSummary(
      "user-1",
      "region-1",
    );

    expect(result.unreadCounts).toEqual(
      expect.objectContaining({
        systemChat: 6,
        interaction: 1,
      }),
    );
    expect(result.totalUnread).toBe(7);
    expect(result.totalUnread).toBe(
      result.unreadCounts.systemChat + result.unreadCounts.interaction,
    );
  });
});
