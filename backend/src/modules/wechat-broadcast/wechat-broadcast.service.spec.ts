import { WechatpadError } from "../wechat-moments/wechatpad.client";
import { DEFAULT_SETTINGS } from "./wechat-broadcast.policy";
import { WechatBroadcastService } from "./wechat-broadcast.service";

const settings = {
  ...DEFAULT_SETTINGS,
  enabled: true,
  dryRun: false,
  enabledAt: new Date(Date.now() - 3600_000).toISOString(),
};
const connection: any = { missing: [], wechatpad: { deviceId: "d1" } };

const errandOrder = (patch: Record<string, any> = {}) => ({
  id: "o1",
  orderNo: "EO2026100600018a3f",
  userId: "u1",
  regionId: "r1",
  type: "pickup",
  status: "pending_accept",
  riderId: null,
  payTime: new Date(),
  refundStatus: "none",
  price: 5,
  tip: 1,
  pickupAddress: "菜鸟驿站",
  deliverAddress: "西区宿舍 8舍-3楼-305",
  remark: JSON.stringify({
    address_id: "a1",
    handoff_mode: "room",
    dorm_access_rule: "female_only",
    rider_gender_requirement: "female",
  }),
  tasks: [{ pickupPointId: "p1", pickupAddress: "菜鸟驿站 取件码 1234", itemDescription: null }],
  purchase: null,
  RegionRider: null,
  acceptTime: null,
  cancelTime: null,
  createdAt: new Date("2026-10-06T06:32:00Z"),
  updatedAt: new Date(),
  ...patch,
});

function setup() {
  const sendText = jest.fn().mockResolvedValue({ messageId: "m1", confirmed: true });
  const prisma: any = {
    config: { findUnique: jest.fn() },
    bizFeeConfig: {
      findUnique: jest.fn().mockResolvedValue({ enabled: true, rate: 0.1, fixedFee: 0 }),
    },
    region: { findUnique: jest.fn().mockResolvedValue({ name: "南校区" }) },
    errandPickupPoint: {
      findMany: jest.fn().mockResolvedValue([{ id: "p1", name: "菜鸟驿站" }]),
    },
    address: {
      findFirst: jest.fn().mockResolvedValue({
        fullAddress: "西区宿舍",
        dormitoryNumber: "8舍-3楼-305",
        detail: "西区宿舍 8舍-3楼-305",
        gender: 2,
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    errandOrder: { findUnique: jest.fn(), findMany: jest.fn() },
    wechatOrderBroadcast: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    wechatOrderBroadcastGroup: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const moments: any = {
    getConfig: jest.fn().mockResolvedValue(connection),
    getState: jest.fn().mockResolvedValue({ online: true }),
    createClient: jest.fn(() => ({ sendText })),
  };
  return { service: new WechatBroadcastService(prisma, moments), prisma, moments, sendText };
}

const queued = (patch: Record<string, any> = {}) => ({
  id: "b1",
  orderId: "o1",
  groupWxid: "123@chatroom",
  round: 1,
  kind: "new",
  attempts: 0,
  ...patch,
});
const finalUpdate = (prisma: any) => {
  const calls = prisma.wechatOrderBroadcast.updateMany.mock.calls;
  return calls[calls.length - 1][0].data;
};

describe("WechatBroadcastService.buildView", () => {
  it("builds an errand view from the pickup point, the saved address and the fee config", async () => {
    const { service, prisma } = setup();
    const view = await service.buildView(errandOrder() as any);
    expect(prisma.address.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "a1", userId: "u1" } }),
    );
    expect(view).toMatchObject({
      purchase: false,
      serviceName: "快递代取",
      regionName: "南校区",
      riderIncome: 5.4,
      advance: null,
      pickup: "菜鸟驿站",
      delivery: "西区宿舍 8舍",
      dorm: "女生宿舍 · 送到寝室 · 仅女骑手",
    });
  });

  it("shows the goods advance and shop route for purchase orders", async () => {
    const { service, prisma } = setup();
    prisma.address.findMany.mockResolvedValue([
      { fullAddress: "东区公寓", dormitoryNumber: "3栋-402", detail: "东区公寓 3栋-402", gender: 1 },
    ]);
    const view = await service.buildView(
      errandOrder({
        type: "purchase",
        price: 3.2,
        tip: 0,
        remark: "少冰",
        deliverAddress: "东区公寓 3栋-402",
        tasks: [
          { pickupPointId: null, pickupAddress: "二食堂一楼", itemDescription: "蜜雪冰城" },
          { pickupPointId: null, pickupAddress: "图书馆", itemDescription: "瑞幸" },
        ],
        purchase: { approvedGoodsCents: 2850 },
      }) as any,
    );
    expect(view).toMatchObject({
      purchase: true,
      riderIncome: 2.88,
      advance: 28.5,
      pickup: "蜜雪冰城 → 瑞幸",
      delivery: "东区公寓 3栋",
      dorm: "男生宿舍（按收件人性别）",
    });
  });

  it("treats the saved address as the pickup side for express sending", async () => {
    const { service } = setup();
    const view = await service.buildView(
      errandOrder({
        type: "deliver",
        pickupAddress: "西区宿舍 8舍-3楼-305",
        deliverAddress: "校门口快递点 13800001111",
        tasks: [],
      }) as any,
    );
    expect(view.pickup).toBe("西区宿舍 8舍");
    expect(view.delivery).toBe("校门口快递点");
    expect(view.dorm).toBe("女生宿舍 · 到寝室取件 · 仅女骑手");
  });
});

describe("WechatBroadcastService.deliver", () => {
  it("stores a draft in dry run without touching WeChat", async () => {
    const { service, prisma, sendText } = setup();
    prisma.errandOrder.findUnique.mockResolvedValue(errandOrder());
    await service.deliver(queued(), { ...settings, dryRun: true }, connection);
    expect(sendText).not.toHaveBeenCalled();
    expect(finalUpdate(prisma)).toMatchObject({ status: "draft" });
    expect(finalUpdate(prisma).text).toContain("状态：🟡 未接单");
  });

  it("sends to the bound group and records the receipt", async () => {
    const { service, prisma, sendText } = setup();
    prisma.errandOrder.findUnique.mockResolvedValue(errandOrder());
    await service.deliver(queued(), settings, connection);
    expect(sendText).toHaveBeenCalledWith("123@chatroom", expect.stringContaining("【新跑腿单】"));
    expect(finalUpdate(prisma)).toMatchObject({ status: "sent", remoteId: "m1" });
  });

  it("writes the masked rider and accept time into the accepted update", async () => {
    const { service, prisma, sendText } = setup();
    prisma.errandOrder.findUnique.mockResolvedValue(
      errandOrder({
        status: "accepted",
        riderId: "r9",
        acceptTime: new Date(),
        RegionRider: { realName: "张三", anonymous: false },
      }),
    );
    prisma.wechatOrderBroadcast.findUnique.mockResolvedValue({ status: "sent" });
    await service.deliver(queued({ kind: "accepted" }), settings, connection);
    expect(sendText.mock.calls[0][1]).toMatch(/状态：✅ 已接单 · 张\*\*（\d\d:\d\d）$/);
  });

  it("never sends a follow-up live when the opening was only a draft", async () => {
    const { service, prisma, sendText } = setup();
    prisma.errandOrder.findUnique.mockResolvedValue(errandOrder({ status: "cancelled" }));
    prisma.wechatOrderBroadcast.findUnique.mockResolvedValue({ status: "draft" });
    await service.deliver(queued({ kind: "cancelled" }), settings, connection);
    expect(sendText).not.toHaveBeenCalled();
    expect(finalUpdate(prisma)).toMatchObject({ status: "skipped", reason: "opening_was_draft" });
  });

  it("hands a new message back to the scan when the order was taken meanwhile", async () => {
    const { service, prisma, sendText } = setup();
    prisma.errandOrder.findUnique.mockResolvedValue(errandOrder({ status: "accepted", riderId: "r9" }));
    await service.deliver(queued(), settings, connection);
    expect(sendText).not.toHaveBeenCalled();
    expect(finalUpdate(prisma)).toMatchObject({ status: "pending" });
  });

  it("marks an ambiguous send unknown and retries a definite rejection", async () => {
    const { service, prisma, sendText } = setup();
    prisma.errandOrder.findUnique.mockResolvedValue(errandOrder());
    sendText.mockRejectedValueOnce(new WechatpadError("timeout", true));
    await service.deliver(queued(), settings, connection);
    expect(finalUpdate(prisma)).toMatchObject({ status: "unknown" });

    sendText.mockRejectedValueOnce(new WechatpadError("协议拒绝发送文本", false));
    await service.deliver(queued(), settings, connection);
    expect(finalUpdate(prisma)).toMatchObject({ status: "pending", reason: "send_rejected_retry" });

    sendText.mockRejectedValueOnce(new WechatpadError("协议拒绝发送文本", false));
    await service.deliver(queued({ attempts: 2 }), settings, connection);
    expect(finalUpdate(prisma)).toMatchObject({ status: "failed", reason: "send_rejected" });
  });
});

describe("WechatBroadcastService.sendDue", () => {
  it("waits while WeChat is offline", async () => {
    const { service, prisma, moments, sendText } = setup();
    prisma.wechatOrderBroadcast.findMany.mockResolvedValue([queued()]);
    moments.getState.mockResolvedValue({ online: false });
    expect(await service.sendDue(settings, new Date())).toBe(0);
    expect(sendText).not.toHaveBeenCalled();
  });

  it("keeps the minimum interval per group and sends one message per group per pass", async () => {
    const { service, prisma, sendText } = setup();
    prisma.errandOrder.findUnique.mockResolvedValue(errandOrder());
    prisma.wechatOrderBroadcast.findMany.mockResolvedValue([
      queued({ id: "b1", groupWxid: "a@chatroom" }),
      queued({ id: "b2", groupWxid: "a@chatroom" }),
      queued({ id: "b3", groupWxid: "b@chatroom" }),
    ]);
    const now = new Date();
    prisma.wechatOrderBroadcast.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where.groupWxid === "b@chatroom"
          ? { status: "sent", updatedAt: new Date(now.getTime() - 2000) }
          : null,
      ),
    );
    expect(await service.sendDue(settings, now)).toBe(1);
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0][0]).toBe("a@chatroom");
  });
});

describe("WechatBroadcastService.scan", () => {
  it("queues new orders to the campus group and follow-ups to the opening's group", async () => {
    const { service, prisma } = setup();
    prisma.wechatOrderBroadcastGroup.findMany.mockResolvedValue([
      { regionId: "r1", groupWxid: "now@chatroom", enabled: true },
    ]);
    prisma.errandOrder.findMany
      .mockResolvedValueOnce([{ id: "o1" }])
      .mockResolvedValueOnce([
        errandOrder({ id: "o1" }),
        errandOrder({ id: "o2", status: "accepted", riderId: "r9" }),
      ]);
    prisma.wechatOrderBroadcast.findMany
      .mockResolvedValueOnce([{ orderId: "o2" }])
      .mockResolvedValueOnce([
        {
          id: "b2",
          orderId: "o2",
          regionId: "r1",
          groupWxid: "old@chatroom",
          round: 1,
          kind: "new",
          status: "sent",
          closedAt: null,
        },
      ]);
    await service.scan(settings, new Date());
    const created = prisma.wechatOrderBroadcast.create.mock.calls.map((c: any) => c[0].data);
    expect(created).toEqual([
      expect.objectContaining({ orderId: "o1", kind: "new", groupWxid: "now@chatroom", status: "pending" }),
      expect.objectContaining({ orderId: "o2", kind: "accepted", groupWxid: "old@chatroom", status: "pending" }),
    ]);
    expect(prisma.wechatOrderBroadcast.updateMany).toHaveBeenCalledWith({
      where: { id: "b2", closedAt: null },
      data: { closedAt: expect.any(Date) },
    });
  });
});
