import { GoneException } from '@nestjs/common';
import { NotifyService } from './notify.service';

const createPrismaMock = () => ({
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
    upsert: jest.fn().mockResolvedValue({ id: 'official-user', nickname: '校园小助手', avatar: '/static/logo.png' }),
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
  },
  userProfile: {
    findUnique: jest.fn(),
  },
  userSettings: {
    findUnique: jest.fn().mockResolvedValue(null),
  },
  post: {
    updateMany: jest.fn(),
  },
  comment: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn((handler: any) => handler({
    comment: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    post: {
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  })),
});

const createService = (prisma: ReturnType<typeof createPrismaMock>, channelService?: any) => new NotifyService(
  prisma as any,
  {
    getJson: jest.fn().mockResolvedValue(null),
    setJson: jest.fn().mockResolvedValue(undefined),
    delPattern: jest.fn().mockResolvedValue(undefined),
    withLock: jest.fn((_key: string, _ttl: number, task: () => Promise<any>) => task()),
  } as any,
  { pushNotification: jest.fn() } as any,
  { pushToUser: jest.fn(), isSocketLive: jest.fn().mockReturnValue(false), getLiveSocketCount: jest.fn().mockReturnValue(0) } as any,
  {} as any,
  { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: true, regionIds: [] }) } as any,
  channelService,
);

describe('NotifyService takeaway template routing', () => {
  it('keeps rider, merchant and user takeaway templates separate', () => {
    const service = createService(createPrismaMock());

    expect((service as any).takeawayTemplateType('shop_order_ready')).toBe('takeaway_rider_order');
    expect((service as any).takeawayTemplateType('takeaway_accept_reminder')).toBe('takeaway_merchant_order');
    expect((service as any).takeawayTemplateType('takeaway_rider_delay')).toBe('takeaway_order_status');
  });
});

describe('NotifyService rider app realtime sessions', () => {
  it('labels rider app sessions with official rider identity and region', async () => {
    const prisma = createPrismaMock();
    prisma.realtimeSession.findMany.mockResolvedValue([{
      id: 'session-1', userId: 'user-1', adminId: null, socketId: 'socket-1',
      platform: 'rider_app', online: true, ip: '127.0.0.1', userAgent: 'rider-device',
      lastSeenAt: new Date('2026-07-29T10:00:00.000Z'), createdAt: new Date('2026-07-29T09:00:00.000Z'),
    }]);
    prisma.realtimeSession.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);
    prisma.user.findMany.mockResolvedValue([{
      id: 'user-1', nickname: '昵称', avatar: '/avatar.png', phone: '13800138000', openid: 'openid', userType: 1,
    }]);
    prisma.regionRider.findMany.mockResolvedValue([{
      userId: 'user-1', realName: '张骑手', phone: '13900139000', regionId: 'region-1',
      status: 'busy', verifyStatus: 'approved', riderType: 'official',
    }]);
    prisma.region.findMany.mockResolvedValue([{ id: 'region-1', name: '第一校区' }]);
    const service = createService(prisma);
    (service as any).wsNative.isSocketLive.mockReturnValue(true);
    (service as any).wsNative.getLiveSocketCount.mockReturnValue(1);

    const result = await service.getRealtimeSessions({ platform: 'rider_app', page: 1, pageSize: 50 });

    expect(result.list[0]).toEqual(expect.objectContaining({
      platform: 'rider_app',
      actor: expect.objectContaining({ name: '张骑手', type: '官方骑手' }),
      rider: expect.objectContaining({ regionName: '第一校区', status: 'busy' }),
    }));
    expect(result.stats).toEqual(expect.objectContaining({ riderAppOnlineCount: 1 }));
  });
});

describe('NotifyService official assistant messages', () => {
  it('records a resolved service status and notifies the user in the official conversation', async () => {
    const prisma = createPrismaMock();
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'conversation-1',
      isBlocked: false,
      members: [{ userId: 'user-1' }, { userId: 'official-user' }],
    });
    prisma.conversationMember.findFirst.mockResolvedValue({ userId: 'user-1' });
    prisma.message.create.mockResolvedValue({ id: 'message-1', createdAt: new Date('2026-07-12T10:00:00.000Z') });
    prisma.conversation.update.mockResolvedValue({ id: 'conversation-1', serviceStatus: 'resolved', serviceHandlerId: 'admin-1' });
    const service = createService(prisma);

    const result = await service.updateOfficialConversationStatus('conversation-1', 'resolved', 'admin-1', '已为你完成处理，请刷新订单查看。');

    expect(prisma.conversation.update).toHaveBeenLastCalledWith({
      where: { id: 'conversation-1' },
      data: expect.objectContaining({
        serviceStatus: 'resolved',
        serviceHandlerId: 'admin-1',
        serviceHandledAt: expect.any(Date),
      }),
    });
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ content: '已为你完成处理，请刷新订单查看。' }),
    });
    expect(result).toEqual(expect.objectContaining({ status: 'resolved' }));
  });

  it('creates a published official assistant card with safe defaults', async () => {
    const prisma = createPrismaMock();
    prisma.officialAssistantMessage.create.mockResolvedValue({
      id: 'assistant-1',
      category: 'campus',
      renderType: 'card',
      title: '校园活动周上线啦',
      content: '快来看看本周活动',
      status: 'published',
      priority: 0,
      actions: [{ text: '查看详情', type: 'miniapp', value: '/pagesA/selection/list/list' }],
      publishedAt: new Date('2026-06-25T09:30:00.000Z'),
    });
    const service = createService(prisma);

    const result = await service.createOfficialAssistantMessage('admin-1', {
      title: ' 校园活动周上线啦 ',
      content: ' 快来看看本周活动 ',
      category: 'campus',
      actionText: '查看详情',
      actionType: 'miniapp',
      actionValue: '/pagesA/selection/list/list',
    } as any);

    expect(prisma.officialAssistantMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: '校园活动周上线啦',
        content: '快来看看本周活动',
        category: 'campus',
        renderType: 'card',
        status: 'published',
        createdBy: 'admin-1',
        actions: [{ text: '查看详情', type: 'miniapp', value: '/pagesA/selection/list/list' }],
        publishedAt: expect.any(Date),
      }),
    });
    expect(result.title).toBe('校园活动周上线啦');
  });

  it('lists only published global and current-region official assistant messages for users', async () => {
    const prisma = createPrismaMock();
    prisma.officialAssistantMessage.findMany.mockResolvedValue([
      {
        id: 'global-1',
        regionId: null,
        category: 'campus',
        renderType: 'card',
        title: '新生礼包到账',
        content: '包含校园权益券',
        status: 'published',
        priority: 8,
        actions: [],
        publishedAt: new Date('2026-06-25T09:30:00.000Z'),
        createdAt: new Date('2026-06-25T09:00:00.000Z'),
      },
    ]);
    prisma.officialAssistantMessage.count.mockResolvedValue(1);
    const service = createService(prisma);

    const result = await service.getOfficialAssistantTimeline('user-1', {
      regionId: 'region-1',
      page: 1,
      pageSize: 20,
    } as any);

    expect(prisma.officialAssistantMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: 'published',
        OR: [{ regionId: 'region-1' }, { regionId: null }],
      },
      orderBy: [{ priority: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
    }));
    expect(result.assistant.name).toBe('校园小助手');
    expect(result.list).toHaveLength(1);
    expect(result.list[0]).toEqual(expect.objectContaining({
      id: 'global-1',
      title: '新生礼包到账',
      categoryLabel: '校园通知',
    }));
  });
});

describe('NotifyService.createAndDispatchInteraction', () => {
  it('reuses a recent notification for the same actor and target', async () => {
    const prisma = createPrismaMock();
    prisma.notification.findMany.mockResolvedValueOnce([
      {
        id: 'notice-1',
        data: { fromUserId: 'actor-1' },
        createdAt: new Date(),
        isRead: false,
      },
    ]);
    const service = createService(prisma);

    const result = await service.createAndDispatchInteraction({
      userId: 'author-1',
      regionId: 'region-1',
      type: 'LIKE',
      scene: 'post_like',
      title: '有人点赞了你的帖子',
      content: '小满赞了你的帖子',
      data: { postId: 'post-1', fromUserId: 'actor-1' },
      linkType: 'post',
      linkValue: 'post-1',
      channelMask: { inApp: true, websocket: true },
    });

    expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'author-1',
        type: 'LIKE',
        scene: 'post_like',
        linkType: 'post',
        linkValue: 'post-1',
      }),
      take: 50,
    }));
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      id: 'notice-1',
      deduped: true,
    }));
  });

  it('creates and dispatches when only other actors have recent notifications', async () => {
    const prisma = createPrismaMock();
    prisma.notification.findMany
      .mockResolvedValueOnce([{ id: 'notice-other', data: { fromUserId: 'actor-2' } }])
      .mockResolvedValueOnce([{ type: 'LIKE' }]);
    prisma.notification.create.mockResolvedValue({
      id: 'notice-2',
      userId: 'author-1',
      type: 'LIKE',
      scene: 'post_like',
      title: '有人点赞了你的帖子',
      content: '小满赞了你的帖子',
      data: { postId: 'post-1', fromUserId: 'actor-1' },
      linkType: 'post',
      linkValue: 'post-1',
      createdAt: new Date('2026-07-02T09:00:00.000Z'),
    });
    const service = createService(prisma);

    const result = await service.createAndDispatchInteraction({
      userId: 'author-1',
      regionId: 'region-1',
      type: 'LIKE',
      scene: 'post_like',
      title: '有人点赞了你的帖子',
      content: '小满赞了你的帖子',
      data: { postId: 'post-1', fromUserId: 'actor-1' },
      linkType: 'post',
      linkValue: 'post-1',
      channelMask: { inApp: true, websocket: true },
    });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'author-1',
        type: 'LIKE',
        scene: 'post_like',
        linkType: 'post',
        linkValue: 'post-1',
      }),
    });
    expect(result).toEqual(expect.objectContaining({ id: 'notice-2' }));
  });
});

describe('NotifyService.createAndDispatch notification channels', () => {
  it('delivers an enabled order notice by email when the caller omits email from the mask', async () => {
    const prisma = createPrismaMock();
    prisma.notification.create.mockResolvedValue({
      id: 'notice-1',
      userId: 'user-1',
      type: 'ORDER',
      scene: 'order_payment',
      title: '支付成功',
      content: '订单已支付',
      createdAt: new Date(),
    });
    prisma.userProfile.findUnique.mockResolvedValue({ email: 'user@example.com' });
    const channelService = {
      resolveChannelMask: jest.fn().mockResolvedValue({ inApp: true, websocket: false, email: true, sms: false }),
      isChannelEnabled: jest.fn().mockResolvedValue(true),
      sendEmail: jest.fn().mockResolvedValue(true),
    };
    const service = createService(prisma, channelService);

    await service.createAndDispatch({
      userId: 'user-1',
      type: 'ORDER',
      scene: 'order_payment',
      title: '支付成功',
      content: '订单已支付',
      channelMask: { inApp: true, websocket: false },
    });

    expect(channelService.resolveChannelMask).toHaveBeenCalled();
    expect(channelService.sendEmail).toHaveBeenCalledWith('user@example.com', '支付成功', '订单已支付');
    expect(prisma.notification.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'notice-1' },
      data: expect.objectContaining({
        deliveryStatus: 'delivered',
        deliveryReport: expect.objectContaining({ email: { status: 'success' } }),
        deliveryAttempts: { increment: 1 },
      }),
    }));
  });

  it('records a partial delivery and supports a later retry', async () => {
    const prisma = createPrismaMock();
    prisma.notification.findUnique.mockResolvedValue({
      id: 'notice-2',
      userId: 'user-1',
      type: 'ORDER',
      title: '订单更新',
      content: '订单状态发生变化',
      channelMask: { inApp: true, websocket: false, email: true },
      deliveryReport: {
        inApp: { status: 'success' },
        websocket: { status: 'success' },
        email: { status: 'failed', error: 'first timeout' },
      },
      createdAt: new Date(),
    });
    prisma.notification.update.mockResolvedValue({ id: 'notice-2', deliveryStatus: 'partial' });
    prisma.userProfile.findUnique.mockResolvedValue({ email: 'user@example.com' });
    const channelService = {
      isChannelEnabled: jest.fn().mockResolvedValue(true),
      sendEmail: jest.fn().mockRejectedValue(new Error('smtp timeout')),
    };
    const service = createService(prisma, channelService);

    await service.retryNotificationDelivery('notice-2');

    expect(prisma.notification.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'notice-2' },
      data: expect.objectContaining({
        deliveryStatus: 'partial',
        deliveryReport: expect.objectContaining({
          websocket: { status: 'success' },
          email: { status: 'failed', error: 'smtp timeout' },
        }),
        deliveryAttempts: { increment: 1 },
      }),
    }));
  });

  it('automatically retries eligible partial deliveries and stops at the query limit', async () => {
    const prisma = createPrismaMock();
    prisma.notification.findMany.mockResolvedValueOnce([{ id: 'notice-auto' }]);
    prisma.notification.findUnique.mockResolvedValue({
      id: 'notice-auto',
      userId: 'user-1',
      type: 'ORDER',
      title: '订单更新',
      content: '订单状态发生变化',
      channelMask: { inApp: true, websocket: false, email: true },
      deliveryReport: { email: { status: 'failed', error: 'timeout' } },
      createdAt: new Date(),
    });
    prisma.notification.update.mockResolvedValue({ id: 'notice-auto', deliveryStatus: 'delivered' });
    prisma.userProfile.findUnique.mockResolvedValue({ email: 'user@example.com' });
    const channelService = {
      isChannelEnabled: jest.fn().mockResolvedValue(true),
      sendEmail: jest.fn().mockResolvedValue(true),
    };
    const service = createService(prisma, channelService);

    const result = await service.retryFailedNotificationDeliveries();

    expect(result).toEqual({ processed: 1 });
    expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        deliveryStatus: 'partial',
        deliveryAttempts: { lt: 3 },
      }),
      take: 50,
    }));
    expect(prisma.notification.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ deliveryStatus: 'delivered' }),
    }));
  });
});

describe('NotifyService.reviewNotification', () => {
  it('retires the legacy notification review endpoint without writing content', async () => {
    const prisma = createPrismaMock();
    const service = createService(prisma);

    await expect(service.reviewNotification('user-1', 'notice-1', 'approve'))
      .rejects.toThrow(GoneException);
    expect(prisma.notification.findUnique).not.toHaveBeenCalled();
    expect(prisma.notification.update).not.toHaveBeenCalled();
    expect(prisma.post.updateMany).not.toHaveBeenCalled();
    expect(prisma.comment.update).not.toHaveBeenCalled();
  });
});

describe('NotifyService interaction inbox', () => {
  it('queries all social interaction types and only unread rows when requested', async () => {
    const prisma = createPrismaMock();
    const service = createService(prisma);

    await service.getCenterList('user-1', {
      type: 'interaction',
      unreadOnly: '1',
      page: 1,
      pageSize: 20,
    });

    expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'user-1',
        isRead: false,
        hiddenAt: null,
        type: { in: ['COMMENT', 'REPLY', 'MENTION', 'LIKE', 'FOLLOW', 'SQUAT'] },
      }),
    }));
  });

  it('marks the current region interaction group as read without touching other regions', async () => {
    const prisma = createPrismaMock();
    prisma.notification.updateMany.mockResolvedValue({ count: 3 });
    const service = createService(prisma);

    await service.markAllRead('user-1', {
      type: 'interaction',
      regionId: 'region-1',
    });

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        isRead: false,
        hiddenAt: null,
        type: { in: ['COMMENT', 'REPLY', 'MENTION', 'LIKE', 'FOLLOW', 'SQUAT'] },
        OR: [{ regionId: 'region-1' }, { regionId: null }],
      },
      data: { isRead: true, readAt: expect.any(Date) },
    });
  });

  it('hides a notification from the user inbox without deleting the history row', async () => {
    const prisma = createPrismaMock();
    const service = createService(prisma);

    await service.deleteNotification('user-1', 'notice-1');

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'notice-1', userId: 'user-1' },
      data: {
        hiddenAt: expect.any(Date),
        isRead: true,
        readAt: expect.any(Date),
      },
    });
  });

  it('batch hides only the current user visible notifications', async () => {
    const prisma = createPrismaMock();
    prisma.notification.updateMany.mockResolvedValue({ count: 2 });
    const service = createService(prisma);

    const result = await service.batchAction('user-1', ['notice-1', 'notice-2'], 'hide');

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['notice-1', 'notice-2'] },
        userId: 'user-1',
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

  it('skips disabled interaction notifications before creating a history row', async () => {
    const prisma = createPrismaMock();
    prisma.userSettings.findUnique.mockResolvedValue({ notifyLike: false });
    const service = createService(prisma);

    const result = await service.createAndDispatch({
      userId: 'user-1',
      type: 'LIKE',
      title: '有人点赞',
      content: '点赞了你的内容',
    });

    expect(result).toEqual({ skipped: true, reason: 'user_notification_preference' });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});
