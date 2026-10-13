import { additionalEligibility, validateCampaign } from "./welfare.policy";
import { WelfareService } from "./welfare.service";

const now = new Date("2026-09-27T08:30:00.000Z");
const day = 86400000;
const input = (patch: any = {}) => ({
  title: "校园福利",
  description: "测试参与条件",
  mode: "scheduled",
  startAt: "2026-09-27T00:00:00Z",
  endAt: "2026-09-28T00:00:00Z",
  drawAt: "2026-09-28T00:00:00Z",
  claimUntil: "2026-09-30T00:00:00Z",
  maxEntries: 100,
  claimMethod: "shipping",
  prizes: [{ name: "好礼", kind: "physical", quantity: 1 }],
  ...patch,
});
const completeUser = (patch: any = {}) => ({
  id: "user-1",
  openid: "test-openid-abcdef",
  phone: "13800138000",
  nickname: "小林同学",
  avatar: "/uploads/avatar.png",
  createdAt: new Date(now.getTime() - 8 * day),
  ...patch,
});

function fixture(campaignPatch: any = {}, userPatch: any = {}) {
  const campaign: any = {
    id: "campaign-1", ...input(),
    startAt: new Date(now.getTime() - day),
    endAt: new Date(now.getTime() + day),
    requireStudent: false, requireOfficial: false,
    requireProfile: true, minRegistrationDays: 7,
    status: "published", entryCount: 0, ...campaignPatch,
  };
  const user = completeUser(userPatch);
  const db: any = {
    welfareCampaign: {
      findUnique: jest.fn(async () => campaign),
      updateMany: jest.fn(async () => ({ count: 1 })),
      update: jest.fn(),
    },
    user: { findFirst: jest.fn(async () => user), findUnique: jest.fn(async () => user) },
    welfareEntry: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      create: jest.fn(async () => ({ id: "entry-1" })),
    },
    welfareShareVisit: { findFirst: jest.fn(async () => null) },
    wechatOfficialBinding: { findUnique: jest.fn(async () => null) },
    $transaction: async (run: any) => run(db),
  };
  const service = new WelfareService(db, {} as any,
    { assertStudentProtectedAction: jest.fn() } as any,
    { hasBenefit: jest.fn() } as any);
  jest.spyOn(service, "myEntry").mockImplementation(async (id: string) => ({ id }) as any);
  return { service, db, user, campaign,
    join: () => service.participate(campaign.id, { sub: user.id }, "wf_valid_request_0001") };
}

describe("福利资料与注册天数参与条件", () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(now); });
  afterEach(() => jest.useRealTimers());

  test("旧活动及未勾选条件默认不限；新条件按活动独立保存", () => {
    expect(validateCampaign(input(), now)).toMatchObject({ requireProfile: false, minRegistrationDays: 0 });
    expect(validateCampaign(input({ requireProfile: true, minRegistrationDays: 7 }), now))
      .toMatchObject({ requireProfile: true, minRegistrationDays: 7 });
  });
  test.each([-1, 1.5, 3651, "7", null, true, NaN, Infinity])("拒绝非法注册天数 %p", (days) => {
    expect(() => validateCampaign(input({ minRegistrationDays: days }), now)).toThrow("最低注册天数");
  });
  test("资料开关只接受布尔值", () => {
    expect(() => validateCampaign(input({ requireProfile: "false" }), now)).toThrow("参与条件");
  });
  test.each([
    { avatar: null }, { avatar: "  " }, { avatar: "/static/logo.png" },
    { avatar: "https://cdn.test/static/logo.png?v=1" }, { avatar: "wxfile://tmp/avatar" },
    { nickname: " " }, { nickname: "用户abcdef" }, { nickname: "用户8000" },
  ])("缺少头像/昵称或沿用默认资料不算完善：%p", (patch) => {
    expect(additionalEligibility(completeUser(patch), {}, now).profileComplete).toBe(false);
  });
  test("已有自定义头像昵称直接达标，无需再次点击保存", () => {
    expect(additionalEligibility(completeUser(), {}, now)).toMatchObject({ profileComplete: true, profileMissing: [] });
  });
  test("注册满7天按168小时，差1毫秒拒绝，恰好达标允许", () => {
    const user = completeUser({ createdAt: new Date(now.getTime() - 7 * day) });
    expect(additionalEligibility(user, { minRegistrationDays: 7 }, new Date(now.getTime() - 1)))
      .toMatchObject({ registeredDays: 6, registrationEligible: false, registrationEligibleAt: now.toISOString() });
    expect(additionalEligibility(user, { minRegistrationDays: 7 }, now))
      .toMatchObject({ registeredDays: 7, registrationEligible: true });
  });
  test.each([null, "invalid", new Date(now.getTime() + day)])("无效或未来注册时间不能放行：%p", (createdAt) => {
    expect(additionalEligibility(completeUser({ createdAt }), { minRegistrationDays: 7 }, now))
      .toMatchObject({ registeredDays: null, registrationEligible: false, registrationEligibleAt: null });
  });
  test("关闭天数条件时无注册时间也不增加新限制", () => {
    expect(additionalEligibility(null, { minRegistrationDays: 0 }, now).registrationEligible).toBe(true);
  });
  test("状态接口返回未完成项、已满天数和达标时间", async () => {
    const { service } = fixture({}, { avatar: null, createdAt: new Date(now.getTime() - 3 * day) });
    expect((await service.myState("campaign-1", { sub: "user-1" })).eligibility).toMatchObject({
      profileComplete: false, profileMissing: ["头像"], registeredDays: 3, registrationEligible: false,
      registrationEligibleAt: new Date(now.getTime() + 4 * day).toISOString(),
    });
  });
  test("公开详情公布两项门槛和24小时口径", async () => {
    const { service } = fixture();
    const detail = await service.publicDetail("campaign-1");
    expect(detail).toMatchObject({ requireProfile: true, minRegistrationDays: 7 });
    expect(detail.automaticRules).toContain("头像与昵称");
    expect(detail.automaticRules).toContain("24 小时");
  });
  test("绕过小程序直接报名仍拒绝不完整资料，不增加报名数量", async () => {
    const { join, db } = fixture({}, { avatar: null });
    await expect(join()).rejects.toMatchObject({ response: { code: "WELFARE_PROFILE_REQUIRED" } });
    expect(db.welfareEntry.create).not.toHaveBeenCalled();
    expect(db.welfareCampaign.update).not.toHaveBeenCalled();
  });
  test("注册天数不足不能通过报名，达到边界后同一请求可重试成功", async () => {
    const { join, db } = fixture({}, { createdAt: new Date(now.getTime() - 7 * day + 1) });
    await expect(join()).rejects.toMatchObject({ response: { code: "WELFARE_REGISTRATION_DAYS_REQUIRED" } });
    expect(db.welfareEntry.create).not.toHaveBeenCalled();
    jest.setSystemTime(new Date(now.getTime() + 1));
    await expect(join()).resolves.toEqual({ id: "entry-1" });
    expect(db.welfareEntry.create).toHaveBeenCalledTimes(1);
  });
  test("资料在页面核验后被清空，报名再次读取数据库并拒绝", async () => {
    const { service, user, join, db } = fixture();
    expect((await service.myState("campaign-1", { sub: user.id })).eligibility.profileComplete).toBe(true);
    user.nickname = "";
    await expect(join()).rejects.toThrow("请先完善个人资料");
    expect(db.welfareEntry.create).not.toHaveBeenCalled();
  });
  test("关闭两项条件仍可参与；已报名重试始终返回原记录", async () => {
    const disabled = fixture({ requireProfile: false, minRegistrationDays: 0 }, { avatar: null, createdAt: now });
    await expect(disabled.join()).resolves.toEqual({ id: "entry-1" });
    const existing = fixture({}, { avatar: null, createdAt: now });
    existing.db.welfareEntry.findFirst.mockResolvedValue({ id: "existing-entry" });
    await expect(existing.join()).resolves.toEqual({ id: "existing-entry" });
    expect(existing.db.welfareEntry.create).not.toHaveBeenCalled();
  });
});
