import { WelfareService } from "./welfare.service";
import { validateCampaign } from "./welfare.policy";

const HOUR = 3_600_000;

function fixture(overrides: any = {}, prizes?: any[]) {
  const now = Date.now();
  const campaign: any = {
    id: "campaign",
    title: "开学福利",
    mode: "scheduled",
    status: "published",
    regionId: "campus-a",
    requireGroup: false,
    startAt: new Date(now - 48 * HOUR),
    endAt: new Date(now - 2 * HOUR),
    drawAt: new Date(now - HOUR),
    claimUntil: new Date(now + 48 * HOUR),
    entryCount: 2,
    maxEntries: 100,
    minParticipants: 3,
    extendHours: 24,
    maxExtensions: 0,
    extensionCount: 0,
    drawnAt: null,
    prizes: prizes || [{ id: "prize", name: "好礼", kind: "physical", quantity: 1 }],
    ...overrides,
  };
  const entries: any[] = [
    { id: "e1", userId: "u1", outcome: "waiting" },
    { id: "e2", userId: "u2", outcome: "waiting" },
  ];
  const db: any = {
    welfareCampaign: {
      findUnique: jest.fn(async () => campaign),
      updateMany: jest.fn(async () => ({ count: 1 })),
      update: jest.fn(async ({ data }: any) => {
        const { extensionCount, ...rest } = data;
        Object.assign(campaign, rest);
        if (extensionCount?.increment) campaign.extensionCount += extensionCount.increment;
        return campaign;
      }),
    },
    user: {
      findMany: jest.fn(async () => entries.map((e) => ({ id: e.userId, nickname: e.userId }))),
    },
    welfareEntry: {
      findMany: jest.fn(async ({ where }: any) =>
        entries.filter((e) => (where.outcome === "waiting" ? e.outcome === "waiting" : true)),
      ),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const selected = entries.filter((e) => (where.id ? where.id.in.includes(e.id) : e.outcome === where.outcome));
        selected.forEach((e) => Object.assign(e, data));
        return { count: selected.length };
      }),
      update: jest.fn(async ({ where, data }: any) => Object.assign(entries.find((e) => e.id === where.id), data)),
      count: jest.fn(async () => 0),
    },
    welfarePrize: { update: jest.fn(async () => ({})) },
    welfarePrizeReserved: { findMany: jest.fn(async () => []) },
    welfareDraw: { create: jest.fn() },
    coupon: {
      findMany: jest.fn(async () => [{ status: "active", endAt: new Date(now + 30 * 24 * HOUR) }]),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    notification: { createMany: jest.fn() },
    adminOperationLog: { create: jest.fn() },
  };
  db.$transaction = jest.fn(async (fn: any) => fn(db));
  const service = new WelfareService(db, {} as any, {} as any, {} as any);
  return { service, db, campaign, entries, now };
}

describe("福利抽奖开奖人数门槛", () => {
  test("人数达到门槛时照常开奖", async () => {
    const { service, db, entries } = fixture({ minParticipants: 2 });
    await expect(service.drawScheduled("campaign")).resolves.toMatchObject({ candidateCount: 2, randomWinners: 1 });
    expect(entries.map((e) => e.outcome).sort()).toEqual(["lost", "won"]);
    expect(db.welfareDraw.create).toHaveBeenCalled();
  });

  test("人数不足时报名和开奖一起顺延，保持截止与开奖的间隔，不动报名记录", async () => {
    const { service, db, campaign, entries, now } = fixture();
    const before = { endAt: campaign.endAt, drawAt: campaign.drawAt, claimUntil: campaign.claimUntil };
    const result: any = await service.drawScheduled("campaign");
    expect(result).toMatchObject({ extended: true, candidateCount: 2 });
    // The worker ran an hour late, so the new window counts from now.
    expect(campaign.drawAt.getTime()).toBeGreaterThanOrEqual(now + 24 * HOUR);
    expect(campaign.drawAt.getTime() - campaign.endAt.getTime()).toBe(
      before.drawAt.getTime() - before.endAt.getTime(),
    );
    expect(campaign.claimUntil.getTime() - before.claimUntil.getTime()).toBe(
      campaign.drawAt.getTime() - before.drawAt.getTime(),
    );
    expect(campaign.extensionCount).toBe(1);
    expect(campaign.status).toBe("published");
    expect(entries.every((e) => e.outcome === "waiting")).toBe(true);
    expect(db.welfareDraw.create).not.toHaveBeenCalled();
    expect(db.notification.createMany).not.toHaveBeenCalled();
    expect(db.adminOperationLog.create).not.toHaveBeenCalled();
  });

  test("截止距开奖很久时，顺延后报名至少还开放半个顺延周期", async () => {
    const { service, campaign, now } = fixture({ endAt: new Date(Date.now() - 72 * HOUR) });
    await service.drawScheduled("campaign");
    expect(campaign.endAt.getTime()).toBeGreaterThanOrEqual(now + 12 * HOUR);
    expect(campaign.endAt.getTime()).toBeLessThanOrEqual(campaign.drawAt.getTime());
  });

  test("顺延次数用完仍不足：活动作废、通知报名者并退回优惠券预留", async () => {
    const { service, db, campaign, entries } = fixture(
      { maxExtensions: 2, extensionCount: 2 },
      [{ id: "prize", name: "满减券", kind: "coupon", couponId: "coupon-1", couponReserved: 1, quantity: 1 }],
    );
    await expect(service.drawScheduled("campaign")).resolves.toMatchObject({ cancelled: true, candidateCount: 2 });
    expect(campaign.status).toBe("cancelled");
    expect(campaign.lastError).toContain("参与人数不足 3 人，已顺延 2 次");
    expect(entries.every((e) => e.outcome === "cancelled")).toBe(true);
    expect(db.coupon.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { receivedCount: { decrement: 1 } } }),
    );
    const notices = db.notification.createMany.mock.calls[0][0].data;
    expect(notices).toHaveLength(2);
    expect(notices[0].content).toContain("人数不足未开奖，活动已取消");
    expect(db.welfareDraw.create).not.toHaveBeenCalled();
  });

  test("奖品优惠券撑不到新的开奖时间时不再顺延，直接作废", async () => {
    const { service, db, campaign } = fixture({}, [
      { id: "prize", name: "满减券", kind: "coupon", couponId: "coupon-1", couponReserved: 1, quantity: 1 },
    ]);
    db.coupon.findMany.mockResolvedValue([{ status: "active", endAt: new Date(Date.now() + HOUR) }]);
    await expect(service.drawScheduled("campaign")).resolves.toMatchObject({ cancelled: true });
    expect(campaign.lastError).toContain("优惠券有效期不足以继续顺延");
  });

  test("不设门槛（0）时人数再少也照常开奖", async () => {
    const { service, db } = fixture({ minParticipants: 0 });
    await expect(service.drawScheduled("campaign")).resolves.toMatchObject({ candidateCount: 2 });
    expect(db.welfareDraw.create).toHaveBeenCalled();
  });
});

describe("开奖人数门槛的设置校验", () => {
  const base = () => {
    const now = Date.now();
    return {
      title: "福利",
      description: "说明",
      mode: "scheduled",
      startAt: new Date(now).toISOString(),
      endAt: new Date(now + 2 * 86400000).toISOString(),
      drawAt: new Date(now + 3 * 86400000).toISOString(),
      claimUntil: new Date(now + 10 * 86400000).toISOString(),
      maxEntries: 100,
      claimMethod: "pickup",
      pickupLocation: "学生活动中心",
      prizes: [{ name: "好礼", kind: "physical", quantity: 1 }],
    };
  };

  test("不填时默认不设门槛、顺延 24 小时、不限次数", () => {
    expect(validateCampaign(base())).toMatchObject({ minParticipants: 0, extendHours: 24, maxExtensions: 0 });
  });

  test("门槛不能超过参与上限，顺延时长和次数有范围", () => {
    expect(() => validateCampaign({ ...base(), minParticipants: 101 })).toThrow("开奖人数门槛不能超过参与上限");
    expect(() => validateCampaign({ ...base(), minParticipants: 10, extendHours: 0 })).toThrow("顺延");
    expect(() => validateCampaign({ ...base(), minParticipants: 10, maxExtensions: 31 })).toThrow("最多顺延次数");
    expect(validateCampaign({ ...base(), minParticipants: 50, extendHours: 12, maxExtensions: 3 })).toMatchObject({
      minParticipants: 50,
      extendHours: 12,
      maxExtensions: 3,
    });
  });
});
