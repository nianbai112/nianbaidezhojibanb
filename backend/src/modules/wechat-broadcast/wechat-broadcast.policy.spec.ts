import {
  buildingPart,
  decideBroadcast,
  DEFAULT_SETTINGS,
  dormArea,
  dormLine,
  maskRiderName,
  orderPhase,
  renderMessage,
  shanghaiDayStart,
  stripSensitive,
  validateSettings,
} from "./wechat-broadcast.policy";

const now = new Date("2026-10-06T06:40:00.000Z"); // 14:40 北京时间
const settings = {
  ...DEFAULT_SETTINGS,
  enabled: true,
  enabledAt: "2026-10-06T00:00:00.000Z",
};
const minutesAgo = (n: number) => new Date(now.getTime() - n * 60_000);
const order = (patch: Record<string, any> = {}) => ({
  status: "pending_accept",
  riderId: null,
  payTime: minutesAgo(1),
  regionId: "r1",
  refundStatus: "none",
  updatedAt: minutesAgo(1),
  ...patch,
});
const row = (patch: Record<string, any>) => ({
  id: "b1",
  round: 1,
  kind: "new",
  status: "sent",
  closedAt: null,
  ...patch,
});

describe("decideBroadcast", () => {
  it("announces a freshly paid order once", () => {
    expect(decideBroadcast(order(), [], settings, now)).toEqual([
      { type: "create", kind: "new", round: 1, status: "pending" },
    ]);
    expect(decideBroadcast(order(), [row({ status: "pending" })], settings, now)).toEqual([]);
  });

  it("ignores orders paid before enabling or longer ago than the delay limit", () => {
    expect(
      decideBroadcast(order({ payTime: new Date("2026-10-05T23:00:00Z") }), [], settings, now),
    ).toEqual([]);
    expect(decideBroadcast(order({ payTime: minutesAgo(11) }), [], settings, now)).toEqual([]);
  });

  it("follows a shown opening with an accepted message and closes the round", () => {
    const taken = order({ status: "accepted", riderId: "u9" });
    expect(decideBroadcast(taken, [row({})], settings, now)).toEqual([
      { type: "create", kind: "accepted", round: 1, status: "pending" },
      { type: "close", id: "b1" },
    ]);
    // Dry-run drafts are followed up as drafts too.
    expect(decideBroadcast(taken, [row({ status: "draft" })], settings, now)[0]).toMatchObject({
      kind: "accepted",
      status: "pending",
    });
  });

  it("announces cancellation and refunds of a shown order", () => {
    for (const patch of [{ status: "cancelled" }, { refundStatus: "refunding" }]) {
      expect(decideBroadcast(order(patch), [row({})], settings, now)).toEqual([
        { type: "create", kind: "cancelled", round: 1, status: "pending" },
        { type: "close", id: "b1" },
      ]);
    }
  });

  it("never announces an order that was taken before its message went out", () => {
    const taken = order({ status: "accepted", riderId: "u9" });
    expect(decideBroadcast(taken, [row({ status: "pending" })], settings, now)).toEqual([
      { type: "skip", id: "b1", reason: "taken_before_send" },
      { type: "create", kind: "accepted", round: 1, status: "skipped", reason: "not_announced" },
    ]);
  });

  it("records a silent follow-up when the switch is off", () => {
    const off = { ...settings, notifyCancelled: false };
    expect(decideBroadcast(order({ status: "cancelled" }), [row({})], off, now)[0]).toEqual({
      type: "create",
      kind: "cancelled",
      round: 1,
      status: "skipped",
      reason: "notify_disabled",
    });
  });

  it("waits while the opening is being sent and closes failed openings", () => {
    const taken = order({ status: "accepted", riderId: "u9" });
    expect(decideBroadcast(taken, [row({ status: "sending" })], settings, now)).toEqual([]);
    expect(decideBroadcast(taken, [row({ status: "failed" })], settings, now)).toEqual([
      { type: "close", id: "b1" },
    ]);
  });

  it("starts a new round when a rider returns the order to the pool", () => {
    const rows = [
      row({ closedAt: minutesAgo(3) }),
      row({ id: "b2", kind: "accepted", status: "sent" }),
    ];
    expect(decideBroadcast(order({ updatedAt: minutesAgo(1) }), rows, settings, now)).toEqual([
      { type: "create", kind: "new", round: 2, status: "pending" },
    ]);
    // An old return is not re-announced, and a closed round without a rider is left alone.
    expect(decideBroadcast(order({ updatedAt: minutesAgo(30) }), rows, settings, now)).toEqual([]);
    expect(
      decideBroadcast(order(), [row({ status: "expired", closedAt: minutesAgo(1) })], settings, now),
    ).toEqual([]);
  });
});

describe("orderPhase", () => {
  it("classifies order states", () => {
    expect(orderPhase(order())).toBe("available");
    expect(orderPhase(order({ status: "in_progress", riderId: "u" }))).toBe("taken");
    expect(orderPhase(order({ status: "refunded" }))).toBe("closed");
    expect(orderPhase(order({ payTime: null }))).toBe("other");
  });
});

describe("validateSettings", () => {
  it("restarts the clock when sending starts or dry run ends", () => {
    const off = { ...DEFAULT_SETTINGS, enabledAt: "2026-01-01T00:00:00.000Z" };
    expect(validateSettings({ enabled: true }, off, now).enabledAt).toBe(now.toISOString());
    const dry = { ...off, enabled: true };
    expect(validateSettings({ dryRun: false }, dry, now).enabledAt).toBe(now.toISOString());
    expect(validateSettings({ minIntervalSeconds: 8 }, dry, now).enabledAt).toBe(off.enabledAt);
  });

  it("rejects unknown fields and out-of-range numbers", () => {
    expect(() => validateSettings({ foo: 1 }, DEFAULT_SETTINGS, now)).toThrow("不允许");
    expect(() => validateSettings({ minIntervalSeconds: 1 }, DEFAULT_SETTINGS, now)).toThrow("3–300");
    expect(() => validateSettings({ enabled: "yes" }, DEFAULT_SETTINGS, now)).toThrow("开关");
  });
});

describe("privacy helpers", () => {
  it("removes phone numbers, pickup codes and long digit runs", () => {
    expect(stripSensitive("菜鸟驿站 13812345678 取件码: 8-2-1031")).toBe("菜鸟驿站");
    expect(stripSensitive("东门快递柜 取件码 123456")).toBe("东门快递柜");
  });

  it("keeps the building and drops the room", () => {
    expect(buildingPart("8舍-3楼-305")).toBe("8舍");
    expect(buildingPart("5栋512")).toBe("5栋");
    expect(buildingPart("512")).toBe("");
    expect(
      dormArea({ fullAddress: "重庆城乡发展职业学院西区宿舍", dormitoryNumber: "8舍-3楼-305" }, ""),
    ).toBe("重庆城乡发展职业学院西区宿舍 8舍");
    expect(dormArea(null, "西区宿舍 5-3-512")).toBe("西区宿舍 5");
    expect(dormArea(null, "西区宿舍 512")).toBe("西区宿舍");
  });

  it("masks rider names", () => {
    expect(maskRiderName({ realName: "张三丰" })).toBe("张**");
    expect(maskRiderName({ realName: "李四", anonymous: true })).toBe("匿名骑手");
    expect(maskRiderName(null)).toBe("");
  });
});

describe("dormLine", () => {
  it("uses the declared dorm rule and flags a contradicting contact gender", () => {
    expect(
      dormLine(
        { dorm_access_rule: "female_only", handoff_mode: "room", rider_gender_requirement: "female" },
        2,
        false,
      ),
    ).toBe("女生宿舍 · 送到寝室 · 仅女骑手");
    expect(dormLine({ dorm_access_rule: "male_only", handoff_mode: "room" }, 2, false)).toBe(
      "⚠️待核实：订单写男生宿舍，收件人为女生 · 送到寝室",
    );
  });

  it("falls back to the contact gender, then to unknown", () => {
    expect(dormLine({ handoff_mode: "downstairs" }, 1, false)).toBe(
      "男生宿舍（按收件人性别） · 楼下交接",
    );
    expect(dormLine({}, 0, true)).toBe("未注明男女");
    expect(dormLine({ handoff_mode: "room" }, 2, true)).toBe(
      "女生宿舍（按寄件人性别） · 到寝室取件",
    );
  });
});

describe("renderMessage", () => {
  const view = {
    orderNo: "EO20261006abc8a3f",
    purchase: false,
    serviceName: "快递代取",
    regionName: "南校区",
    riderIncome: 5.4,
    advance: null,
    pickup: "菜鸟驿站",
    delivery: "西区宿舍 5栋",
    dorm: "女生宿舍 · 送到寝室 · 仅女骑手",
    orderedAt: new Date("2026-10-06T06:32:00.000Z"),
  };

  it("renders a new errand order with its status line last", () => {
    expect(renderMessage(view, "new", 1, {}, now)).toBe(
      [
        "【新跑腿单】快递代取 · 南校区",
        "骑手收入：¥5.40",
        "取件：菜鸟驿站",
        "送达：西区宿舍 5栋",
        "宿舍：女生宿舍 · 送到寝室 · 仅女骑手",
        "下单 14:32 · 尾号8a3f",
        "状态：🟡 未接单",
      ].join("\n"),
    );
  });

  it("updates only the status line for accepted and cancelled", () => {
    const accepted = renderMessage(
      view,
      "accepted",
      1,
      { at: new Date("2026-10-06T06:35:00Z"), rider: "张**" },
      now,
    );
    expect(accepted.split("\n").pop()).toBe("状态：✅ 已接单 · 张**（14:35）");
    const cancelled = renderMessage(view, "cancelled", 1, { at: new Date("2026-10-06T06:40:00Z") }, now);
    expect(cancelled.split("\n").pop()).toBe("状态：❌ 已取消（14:40）");
    expect(accepted.split("\n").slice(0, -1)).toEqual(cancelled.split("\n").slice(0, -1));
  });

  it("shows the advance for purchase orders and marks re-announced rounds", () => {
    const purchase = { ...view, purchase: true, serviceName: "代买服务", advance: 28.5, pickup: "蜜雪冰城 → 瑞幸" };
    const lines = renderMessage(purchase, "new", 1, {}, now).split("\n");
    expect(lines[0]).toBe("【新代买单】南校区");
    expect(lines[1]).toBe("骑手收入：¥5.40　预计垫付：¥28.50");
    expect(lines[2]).toBe("取货：蜜雪冰城 → 瑞幸");
    expect(renderMessage(view, "new", 2, {}, now).split("\n")[0]).toBe("【重新待接】快递代取 · 南校区");
  });

  it("prints the date for orders from another day", () => {
    const old = { ...view, orderedAt: new Date("2026-10-05T12:00:00Z") };
    expect(renderMessage(old, "new", 1, {}, now)).toContain("下单 10/05 20:00");
  });
});

describe("shanghaiDayStart", () => {
  it("returns Beijing midnight", () => {
    expect(shanghaiDayStart(new Date("2026-10-06T17:00:00Z")).toISOString()).toBe(
      "2026-10-06T16:00:00.000Z",
    );
  });
});
