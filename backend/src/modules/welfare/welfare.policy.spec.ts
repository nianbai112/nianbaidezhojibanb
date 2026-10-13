import {
  choose,
  maskNickname,
  validateCampaign,
} from "./welfare.policy";
const input = () => ({
  title: "校园好礼",
  description: "免费参与",
  mode: "scheduled",
  startAt: "2099-01-01T00:00:00Z",
  endAt: "2099-01-02T00:00:00Z",
  drawAt: "2099-01-03T00:00:00Z",
  claimUntil: "2099-01-10T00:00:00Z",
  maxEntries: 100,
  claimMethod: "shipping",
  prizes: [{ name: "礼物", kind: "physical", quantity: 1 }],
});
describe("新版定时抽奖规则", () => {
  test("人数不足不重复选人且不修改候选集合", () => {
    const pool = [1, 2, 3];
    expect(new Set(choose(pool, 10, () => 0)).size).toBe(3);
    expect(pool).toEqual([1, 2, 3]);
  });
  test("每个候选位置都能被随机抽到", () => {
    for (let i = 0; i < 4; i++)
      expect(choose(["a", "b", "c", "d"], 1, () => i)).toEqual([
        ["a", "b", "c", "d"][i],
      ]);
    expect(choose([], 5)).toEqual([]);
  });
  test("拒绝旧即时模式与非法配置", () => {
    for (const patch of [
      { mode: "instant" },
      { drawAt: "2099-01-01" },
      { claimUntil: "2098-01-01" },
      { maxEntries: 1.5 },
      { prizes: [null] },
      { requireGroup: "true" },
      { claimMethod: "unknown" },
    ])
      expect(() => validateCampaign({ ...input(), ...patch })).toThrow();
  });
  test("只接收业务白名单，群绑定与中奖结果不能随表单写入", () => {
    const result = validateCampaign({
      ...input(),
      status: "published",
      groupIds: ["forged"],
      createdBy: "evil",
      dailyLimit: 99,
      gifts: [{ userId: "x" }],
    });
    for (const key of [
      "status",
      "groupIds",
      "createdBy",
      "dailyLimit",
      "totalLimit",
      "gifts",
    ])
      expect(result).not.toHaveProperty(key);
    expect(result.prizes[0]).not.toHaveProperty("probabilityBps");
  });
  test("分享卡片标题和封面独立保存，并校验图片来源", () => {
    const result = validateCampaign({
      ...input(),
      shareTitle: "转发给同学一起参加",
      shareCover: "/uploads/share-card.png",
    });
    expect(result.shareTitle).toBe("转发给同学一起参加");
    expect(result.shareCover).toBe("/uploads/share-card.png");
    expect(() => validateCampaign({ ...input(), shareCover: "http://bad.test/a.png" })).toThrow();
  });
  test("邮寄无需自提点，自提实物必须配置地点", () => {
    expect(validateCampaign(input()).claimMethod).toBe("shipping");
    expect(() =>
      validateCampaign({ ...input(), claimMethod: "pickup" }),
    ).toThrow("领取地点");
  });
  test("人工兑奖支持奶茶等现场奖品，并拒绝误配邮寄", () => {
    const manual = validateCampaign({
      ...input(),
      claimMethod: "pickup",
      pickupLocation: "奶茶店前台",
      contact: "活动管理员微信号",
      prizes: [{ name: "奶茶", kind: "manual", quantity: 10 }],
    });
    expect(manual.prizes[0]).toMatchObject({ kind: "manual", quantity: 10 });
    expect(() =>
      validateCampaign({
        ...input(),
        claimMethod: "shipping",
        prizes: [{ name: "奶茶", kind: "manual", quantity: 10 }],
      }),
    ).toThrow("现场");
  });
  test("人工兑奖必须留下文字联系方式或联系二维码", () => {
    const base = {
      ...input(),
      claimMethod: "pickup",
      pickupLocation: "奶茶店前台",
      prizes: [{ name: "奶茶", kind: "manual", quantity: 1 }],
    };
    expect(() => validateCampaign(base)).toThrow("联系方式");
    expect(
      validateCampaign({ ...base, claimContactImage: "/uploads/contact.png" })
        .claimInstructions,
    ).toBeNull();
    expect(() =>
      validateCampaign({ ...base, claimContactImage: "http://contact.png" }),
    ).toThrow("HTTPS");
  });
  test("新建活动默认开启学生认证与公众号绑定", () => {
    const c = validateCampaign(input());
    expect(c.requireStudent).toBe(true);
    expect(c.requireOfficial).toBe(true);
  });
  test("核销员按奖品保存，兼容后台单选值并去重", () => {
    const c = validateCampaign({
      ...input(),
      prizes: [
        {
          name: "奶茶",
          kind: "manual",
          quantity: 10,
          verifierUserIds: ["user-a", "user-a", "user-b"],
        },
      ],
      claimMethod: "pickup",
      pickupLocation: "店内前台",
      contact: "管理员",
    });
    expect(c.prizes[0].verifierUserIds).toEqual(["user-a", "user-b"]);
    expect(
      validateCampaign({
        ...input(),
        prizes: [{ name: "奖品", kind: "physical", quantity: 1, verifierUserIds: "user-a" }],
      }).prizes[0].verifierUserIds,
    ).toEqual(["user-a"]);
  });
  test("掩码支持非 BMP 昵称", () =>
    expect(maskNickname("🐰同学")).toBe("🐰**"));
});
