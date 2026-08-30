import { NotifyService } from "./notify.service";

describe("NotifyService official account channel mask", () => {
  const build = (officialAccount: boolean) => {
    const notification = {
      id: "notification-1",
      userId: "user-1",
      type: "DELIVERY",
      scene: "errand_accepted",
      title: "订单已接单",
      content: "测试通知",
      channelMask: {
        inApp: true,
        websocket: false,
        push: false,
        wechatSubscribe: false,
        officialAccount,
      },
      deliveryStatus: "pending",
      createdAt: new Date(),
    };
    const prisma: any = {
      userSettings: { findUnique: jest.fn().mockResolvedValue(null) },
      notification: {
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ ...notification, ...data }),
          ),
        findMany: jest.fn().mockResolvedValue([notification]),
        update: jest.fn().mockResolvedValue({ id: "notification-1" }),
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 0 })
          .mockResolvedValueOnce({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      conversationMember: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const official = {
      sendNotificationTemplate: jest
        .fn()
        .mockResolvedValue({ success: true, templateType: "errand_accepted" }),
    };
    const service = new NotifyService(
      prisma,
      {
        delPattern: jest.fn().mockResolvedValue(undefined),
        getJson: jest.fn().mockResolvedValue(null),
        setJson: jest.fn().mockResolvedValue(undefined),
        withRenewingLock: jest.fn((_key, _ttl, task) => task()),
      } as any,
      {} as any,
      { pushToUser: jest.fn() } as any,
      {} as any,
      {} as any,
      undefined,
      undefined,
      undefined,
      official as any,
    );
    const dispatch = async () => {
      await service.createAndDispatch({
        userId: "user-1",
        type: "delivery",
        scene: "errand_accepted",
        title: "订单已接单",
        content: "测试通知",
        channelMask: {
          inApp: true,
          websocket: false,
          push: false,
          wechatSubscribe: false,
          officialAccount,
        },
      });
      await service.dispatchPendingNotifications();
    };
    return { dispatch, official };
  };

  it("does not send a service-account template when the channel is disabled", async () => {
    const { dispatch, official } = build(false);
    await dispatch();
    expect(official.sendNotificationTemplate).not.toHaveBeenCalled();
  });

  it("sends a service-account template when the channel is enabled", async () => {
    const { dispatch, official } = build(true);
    await dispatch();
    expect(official.sendNotificationTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        scene: "errand_accepted",
      }),
    );
  });
});
