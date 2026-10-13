import {
  DEFAULT_PURCHASE_POLICY,
  integer,
  isOpen,
  matchCombination,
  policy,
  purchaseRoute,
  stableHash,
} from "./purchase.policy";
import {
  assertPurchaseAdvance,
  assertPurchaseReadyForDelivery,
  queuePurchaseRefund,
  applyPurchasePayment,
} from "./purchase.transactions";

describe("代买报价与采购规则", () => {
  test("自动确认默认24小时，可设置1至720的整数小时", () => {
    expect(policy({}).autoReceiptHours).toBe(24);
    expect(policy({ autoReceiptHours: 1 }).autoReceiptHours).toBe(1);
    expect(policy({ autoReceiptHours: 720 }).autoReceiptHours).toBe(720);
  });
  test.each([0, -1, 721, 1.5, "24", null, NaN, Infinity])("拒绝无效自动确认小时数 %p", value => {
    expect(() => policy({ autoReceiptHours: value })).toThrow();
  });
  test("合单必须匹配完整组合，不允许传递放开三家店", () => {
    const rules = [
      { id: "ab", shopIds: ["a", "b"], enabled: true },
      { id: "bc", shopIds: ["b", "c"], enabled: true },
    ];
    expect(matchCombination(["b", "a"], rules).id).toBe("ab");
    expect(() => matchCombination(["a", "b", "c"], rules)).toThrow("未配置");
    expect(() => matchCombination(["a", "c"], rules)).toThrow("未配置");
    expect(matchCombination(["a"], [])).toBeNull();
  });
  test.each([NaN, Infinity, -1, 1.5, "100", null])(
    "拒绝无效数量或金额 %p",
    (value) => {
      expect(() => integer(value, "金额")).toThrow();
    },
  );
  test("默认关闭，累计上限不能低于单笔上限", () => {
    expect(policy({}).enabled).toBe(false);
    expect(() =>
      policy({ maxGoodsCents: 50000, maxOutstandingCents: 20000 }),
    ).toThrow();
  });
  test("上海时区与跨午夜营业时间", () => {
    const shop = { enabled: true, opensAt: "22:00", closesAt: "02:00" };
    expect(isOpen(shop, new Date("2026-09-24T17:00:00Z"))).toBe(true);
    expect(isOpen(shop, new Date("2026-09-24T04:00:00Z"))).toBe(false);
    expect(
      isOpen({ ...shop, enabled: false }, new Date("2026-09-24T17:00:00Z")),
    ).toBe(false);
  });
  test("购物车插入顺序不改变报价路线，快照改变则报价签名改变", () => {
    const a = { id: "a", latitude: 30.02, longitude: 120 },
      b = { id: "b", latitude: 30.01, longitude: 120 };
    const target = { latitude: 30, longitude: 120 };
    expect(purchaseRoute([a, b], target)).toEqual(
      purchaseRoute([b, a], target),
    );
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }));
    expect(stableHash({ priceCents: 100 })).not.toBe(
      stableHash({ priceCents: 101 }),
    );
  });
});

describe("代买垫款与配送约束", () => {
  const current = {
    id: "p",
    approvedGoodsCents: 20000,
    policySnapshot: DEFAULT_PURCHASE_POLICY,
    feeSnapshot: {},
    changes: [],
  };
  const order = { id: "p", type: "purchase", regionId: "school" };
  const db = (outstanding: any[] = [], regionPolicy: any = {}) => ({
    regionRider: {
      findUnique: jest.fn().mockResolvedValue({
        userId: "rider",
        regionId: "school",
        verifyStatus: "approved",
        riderType: "part_time",
      }),
    },
    studentVerify: { findUnique: jest.fn().mockResolvedValue(null) },
    config: {
      findUnique: jest.fn().mockResolvedValue({ value: regionPolicy }),
    },
    errandPurchase: {
      findUnique: jest.fn().mockResolvedValue(current),
      findMany: jest.fn().mockResolvedValue(outstanding),
    },
  });
  const student = {
    status: "APPROVED",
    schoolId: "s1",
    proofMethod: "MANUAL_REVIEW",
    school: { id: "s1", regionId: "school", isEnabled: true },
  };
  test("已完成但未返还的货款仍占额度，待补款变更也预留额度", async () => {
    const database = db([
      {
        ...current,
        approvedGoodsCents: 29000,
        changes: [{ status: "awaiting_payment", deltaCents: 1001 }],
      },
    ]);
    await expect(
      assertPurchaseAdvance(database, order, "rider"),
    ).rejects.toThrow("累计");
    expect(
      database.errandPurchase.findMany.mock.calls[0][0].where.order.status
        .notIn,
    ).not.toContain("completed");
  });
  test("不能让普通用户或跨区域骑手垫款", async () => {
    const database = db();
    database.regionRider.findUnique.mockResolvedValue({
      regionId: "another",
      verifyStatus: "approved",
    });
    await expect(
      assertPurchaseAdvance(database, order, "rider"),
    ).rejects.toThrow("认证骑手");
  });
  test("关闭的身份不能接新单，但已接的单仍可发起变更", async () => {
    const database = db([], { riderTiers: { part_time: { enabled: false } } });
    await expect(
      assertPurchaseAdvance(database, order, "rider"),
    ).rejects.toThrow("暂未向兼职骑手开放代买服务");
    await expect(
      assertPurchaseAdvance(database, order, "rider", 20000),
    ).resolves.toBeUndefined();
  });
  test("学生按本校有效学生认证识别，专职不查学生认证", async () => {
    const database = db([], { riderTiers: { student: { enabled: false } } });
    database.studentVerify.findUnique.mockResolvedValue(student);
    await expect(
      assertPurchaseAdvance(database, order, "rider"),
    ).rejects.toThrow("学生骑手");
    database.studentVerify.findUnique.mockResolvedValue({
      ...student,
      school: { ...student.school, regionId: "another" },
    });
    await expect(
      assertPurchaseAdvance(database, order, "rider"),
    ).resolves.toBeUndefined();
    database.regionRider.findUnique.mockResolvedValue({
      userId: "rider",
      regionId: "school",
      verifyStatus: "approved",
      riderType: "official",
    });
    database.studentVerify.findUnique.mockResolvedValue(student);
    await expect(
      assertPurchaseAdvance(database, order, "rider"),
    ).resolves.toBeUndefined();
    expect(database.studentVerify.findUnique).toHaveBeenCalledTimes(2);
  });
  test("身份上限只能比区域上限更严", async () => {
    const database = db([], {
      riderTiers: {
        student: { maxGoodsCents: 10000, maxOutstandingCents: 20000 },
      },
    });
    database.studentVerify.findUnique.mockResolvedValue(student);
    await expect(
      assertPurchaseAdvance(database, order, "rider"),
    ).rejects.toThrow("学生骑手单笔垫付限额 ¥100");
    await expect(
      assertPurchaseAdvance(
        db([{ ...current, approvedGoodsCents: 15000 }], {
          riderTiers: { part_time: { maxOutstandingCents: 30000 } },
        }),
        order,
        "rider",
      ),
    ).rejects.toThrow("兼职骑手 ¥300");
  });
  test("身份设置默认全部开放并跟随区域上限，且校验非法值", () => {
    expect(policy({}).riderTiers).toEqual({
      official: { enabled: true, maxGoodsCents: null, maxOutstandingCents: null },
      part_time: { enabled: true, maxGoodsCents: null, maxOutstandingCents: null },
      student: { enabled: true, maxGoodsCents: null, maxOutstandingCents: null },
    });
    expect(
      policy({ riderTiers: { student: { maxGoodsCents: "", maxOutstandingCents: null } } })
        .riderTiers.student,
    ).toEqual({ enabled: true, maxGoodsCents: null, maxOutstandingCents: null });
    expect(() => policy({ riderTiers: { student: { enabled: "no" } } })).toThrow("开关");
    expect(() =>
      policy({ riderTiers: { student: { maxGoodsCents: 20000, maxOutstandingCents: 10000 } } }),
    ).toThrow("学生骑手累计垫付上限");
    expect(() => policy({ riderTiers: [] })).toThrow("接单身份");
  });
  test("服务收入仍使用旧订单机制，其他业务不受采购校验影响", async () => {
    await expect(
      assertPurchaseAdvance({}, { type: "pickup" }, "rider"),
    ).resolves.toBeUndefined();
  });
  test("少一家店的凭证或者还在补款时不能开始配送", async () => {
    const database = db();
    database.errandPurchase.findUnique.mockResolvedValue({
      stops: [{ status: "purchased", actualCents: 100 }, { status: "pending" }],
      changes: [],
    });
    await expect(
      assertPurchaseReadyForDelivery(database, order),
    ).rejects.toThrow("凭证");
    database.errandPurchase.findUnique.mockResolvedValue({
      stops: [{ status: "purchased", actualCents: 100 }],
      changes: [{ status: "awaiting_payment" }],
    });
    await expect(
      assertPurchaseReadyForDelivery(database, order),
    ).rejects.toThrow("变更");
    database.errandPurchase.findUnique.mockResolvedValue({
      stops: [{ status: "empty", actualCents: 0 }],
      changes: [],
    });
    await expect(
      assertPurchaseReadyForDelivery(database, order),
    ).rejects.toThrow("全部商品缺货");
    database.errandPurchase.findUnique.mockResolvedValue({
      stops: [
        { status: "purchased", actualCents: 100 },
        { status: "empty", actualCents: 0 },
      ],
      changes: [],
    });
    await expect(
      assertPurchaseReadyForDelivery(database, order),
    ).resolves.toBeUndefined();
  });
});

describe("退款货款预留", () => {
  function refundDb() {
    const jobs: any[] = [];
    return {
      jobs,
      purchaseChange: {
        findMany: jest.fn().mockResolvedValue([{ id: "change" }]),
      },
      paymentOrder: {
        findMany: jest.fn().mockResolvedValue([
          { id: "pay1", bizType: "errand_purchase", bizId: "p", amount: 27 },
          {
            id: "pay2",
            bizType: "errand_purchase_change",
            bizId: "change",
            amount: 3,
          },
        ]),
      },
      purchaseRefund: {
        findUnique: jest.fn(async ({ where }) =>
          jobs.find((r) => r.requestKey === where.requestKey),
        ),
        findMany: jest.fn(async () => jobs),
        create: jest.fn(async ({ data }) => {
          jobs.push(data);
          return data;
        }),
      },
    };
  }
  test("退款可跨主支付和补价支付分摊，重复任务不再占用款项", async () => {
    const tx = refundDb(),
      p = { id: "p" };
    await queuePurchaseRefund(tx, p, 2800, "one", "cancel", "取消");
    expect(tx.jobs[0].allocations.map((a: any) => a.amountCents)).toEqual([
      2700, 100,
    ]);
    await queuePurchaseRefund(tx, p, 2800, "one", "cancel", "取消");
    expect(tx.jobs).toHaveLength(1);
    await queuePurchaseRefund(tx, p, 200, "two", "difference", "差价");
    await expect(
      queuePurchaseRefund(tx, p, 1, "three", "difference", "差价"),
    ).rejects.toThrow("可退货款不足");
  });
});

describe("迟到的微信付款", () => {
  test("取消后到账必须进入退款任务，不能重新放入接单池", async () => {
    const order = {
      id: "p",
      userId: "buyer",
      type: "purchase",
      riderId: null,
      status: "cancelled",
    };
    const p = {
      id: "p",
      userId: "buyer",
      order,
      stops: [],
      changes: [],
      refunds: [],
      createdAt: new Date(),
      initialGoodsCents: 2000,
      serviceCents: 700,
    };
    const tx: any = {
      errandOrder: {
        findUnique: jest.fn().mockResolvedValue(order),
        update: jest.fn(),
      },
      errandPurchase: {
        update: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(p),
      },
      purchaseChange: { findMany: jest.fn().mockResolvedValue([]) },
      purchaseRefund: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      paymentOrder: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: "pay", bizType: "errand_purchase", bizId: "p", amount: 27 },
          ]),
      },
    };
    await applyPurchasePayment(tx, {
      id: "pay",
      bizType: "errand_purchase",
      bizId: "p",
      userId: "buyer",
      amount: 27,
    });
    expect(tx.purchaseRefund.create.mock.calls[0][0].data.amountCents).toBe(
      2700,
    );
    expect(
      tx.errandOrder.update.mock.calls.every(
        ([call]: any) => call.data.status !== "pending_accept",
      ),
    ).toBe(true);
  });
});
