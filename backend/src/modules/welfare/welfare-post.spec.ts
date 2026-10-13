import { postEligibility, qualifiedPostUsers, requiredPostWhere } from "./welfare-post.policy";
import { validateCampaign } from "./welfare.policy";
import { WelfareService } from "./welfare.service";

const now = new Date("2026-10-07T12:00:00Z");
const publishedAt = new Date("2026-10-05T12:00:00Z");
const post = (patch: any = {}) => ({ id: "post", userId: "valid", regionId: "campus", status: "PUBLISHED", auditStatus: "approved", deletedAt: null, createdAt: new Date("2026-10-06T12:00:00Z"), ...patch });
const input = (patch: any = {}) => ({ title: "校园福利", description: "发帖后报名", mode: "scheduled", startAt: new Date(now.getTime() - 86400000), endAt: new Date(now.getTime() + 86400000), drawAt: new Date(now.getTime() + 86400000), claimUntil: new Date(now.getTime() + 3 * 86400000), maxEntries: 100, claimMethod: "shipping", prizes: [{ id: "prize", name: "好礼", kind: "physical", quantity: 1 }], ...patch });
function fixture(patch: any = {}, posts: any[] = []) {
  const campaign: any = { id: "campaign", ...input(), status: "published", regionId: "campus", requireStudent: false, requireOfficial: false, requirePost: true, publishedAt, entryCount: 0, ...patch };
  const entries: any[] = [];
  const matches = (p: any, where: any) => Object.entries(where).every(([key, value]: any) => {
    if (key === "createdAt") return p.createdAt >= value.gte && p.createdAt <= value.lte;
    if (value && typeof value === "object" && value.in) return value.in.includes(p[key]);
    return p[key] === value;
  });
  const user = { id: "valid", nickname: "同学", profile: { regionId: "campus" } };
  const db: any = {
    post: {
      findFirst: jest.fn(async ({ where }: any) => posts.find(p => matches(p, where)) || null),
      groupBy: jest.fn(async ({ where }: any) => [...new Set(posts.filter(p => matches(p, where)).map(p => p.userId))].map(userId => ({ userId }))),
    },
    user: { findFirst: jest.fn(async () => user), findUnique: jest.fn(async () => user), findMany: jest.fn(async () => [{ id: "valid" }, { id: "missing" }]) },
    welfareCampaign: { findUnique: jest.fn(async () => campaign), updateMany: jest.fn(async () => ({ count: 1 })), update: jest.fn(async ({ data }: any) => Object.assign(campaign, data)) },
    welfareEntry: {
      findFirst: jest.fn(async () => null), findMany: jest.fn(async () => entries),
      create: jest.fn(async () => ({ id: "entry" })),
      updateMany: jest.fn(async ({ where, data }: any) => { const rows = entries.filter(e => where.id ? where.id.in.includes(e.id) : e.outcome === where.outcome); rows.forEach(e => Object.assign(e, data)); return { count: rows.length }; }),
      update: jest.fn(async ({ where, data }: any) => Object.assign(entries.find(e => e.id === where.id), data)),
    },
    welfarePrize: { update: jest.fn(async () => ({ kind: "physical" })) },
    welfarePrizeReserved: { findMany: jest.fn(async () => [{ userId: "missing" }]) },
    welfareDraw: { create: jest.fn() }, welfareShareVisit: { findFirst: jest.fn(async () => null) },
    wechatOfficialBinding: { findUnique: jest.fn(async () => null) }, notification: { createMany: jest.fn() }, adminOperationLog: { create: jest.fn() },
  };
  db.$transaction = jest.fn(async (run: any) => run(db));
  const service = new WelfareService(db, {} as any, { assertStudentProtectedAction: jest.fn() } as any, {} as any);
  jest.spyOn(service, "myEntry").mockImplementation(async (id: string) => ({ id }) as any);
  return { service, db, campaign, entries, posts, join: () => service.participate("campaign", { sub: "valid" }, "wf_post_request_0001") };
}

describe("发一篇帖子参与条件", () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(now); });
  afterEach(() => jest.useRealTimers());

  test("默认关闭，只接受布尔值且不能伪造起算时间", () => {
    expect(validateCampaign(input(), now).requirePost).toBe(false);
    expect(validateCampaign(input({ requirePost: true, publishedAt: "2000-01-01" }), now)).toMatchObject({ requirePost: true });
    expect(validateCampaign(input({ requirePost: true }), now)).not.toHaveProperty("publishedAt");
    for (const requirePost of [null, "true", 1, {}]) expect(() => validateCampaign(input({ requirePost }), now)).toThrow("参与条件");
  });
  test.each([
    { createdAt: new Date(publishedAt.getTime() - 1) },
    { createdAt: new Date(now.getTime() + 1) },
    { userId: "another-user" }, { regionId: "other-campus" },
    { status: "DRAFT" }, { status: "REJECTED", auditStatus: "rejected" },
    { status: "DELETED" }, { auditStatus: "rejected" }, { deletedAt: now },
  ])("旧帖、他人帖、其他校区、未发布或不可见帖子不能报名：%p", async patch => {
    const { join, db } = fixture({}, [post(patch)]);
    await expect(join()).rejects.toMatchObject({ response: { code: "WELFARE_POST_REQUIRED" } });
    expect(db.welfareEntry.create).not.toHaveBeenCalled();
    expect(db.welfareCampaign.update).not.toHaveBeenCalled();
  });
  test("待审核只提示等待，状态接口不误报完成", async () => {
    const { service, join } = fixture({}, [post({ status: "PENDING", auditStatus: "pending" })]);
    expect((await service.myState("campaign", { sub: "valid" })).eligibility).toMatchObject({ postCompleted: false, postPending: true });
    await expect(join()).rejects.toMatchObject({ response: { code: "WELFARE_POST_PENDING" } });
  });
  test("发布时间边界、审核通过后允许报名；同一用户多篇只需一篇合格", async () => {
    const { service, join } = fixture({}, [post({ deletedAt: now }), post({ id: "new", createdAt: publishedAt })]);
    expect((await service.myState("campaign", { sub: "valid" })).eligibility).toMatchObject({ postCompleted: true, postPending: false });
    await expect(join()).resolves.toEqual({ id: "entry" });
  });
  test("全平台活动接受任意校区的合格校园帖子", async () => {
    const { join } = fixture({ regionId: null }, [post({ regionId: "other-campus" })]);
    await expect(join()).resolves.toEqual({ id: "entry" });
  });
  test("核验后帖子被删除，直接调用报名也会再次核验并拒绝", async () => {
    const f = fixture({}, [post()]);
    expect((await f.service.myState("campaign", { sub: "valid" })).eligibility.postCompleted).toBe(true);
    f.posts[0].deletedAt = now;
    await expect(f.join()).rejects.toThrow("请先发布");
    expect(f.db.welfareEntry.create).not.toHaveBeenCalled();
  });
  test("已报名重试可查看原记录，不重复报名或强迫再次发帖", async () => {
    const f = fixture(); f.db.welfareEntry.findFirst.mockResolvedValue({ id: "existing" });
    await expect(f.join()).resolves.toEqual({ id: "existing" });
    expect(f.db.post.findFirst).not.toHaveBeenCalled();
    expect(f.db.welfareEntry.create).not.toHaveBeenCalled();
  });
  test("未开启条件不查帖子、不改变旧活动资格", async () => {
    const f = fixture({ requirePost: false, publishedAt: null });
    await expect(f.join()).resolves.toEqual({ id: "entry" });
    expect(f.db.post.findFirst).not.toHaveBeenCalled();
  });
  test.each([null, new Date("invalid"), new Date(now.getTime() + 1)])("起算时间损坏或异常不能放行：%p", async publishedAt => {
    const { join, db } = fixture({ publishedAt }, [post()]);
    await expect(join()).rejects.toMatchObject({ response: { code: "WELFARE_POST_UNAVAILABLE" } });
    expect(db.post.findFirst).not.toHaveBeenCalled();
  });
  test("公开详情、参与记录公布规则，不返回帖子正文", async () => {
    const f = fixture(); const detail = await f.service.publicDetail("campaign");
    expect(detail).toMatchObject({ requirePost: true, postRequiredSince: publishedAt });
    expect(detail.automaticRules).toContain("活动发布前的帖子不计入");
    expect(detail.automaticRules).toContain("开奖前再次核验");
    expect((f.service as any).ownView({ campaign: f.campaign, outcome: "excluded", exclusionReason: "post_requirement_unmet" })).toMatchObject({ requirePost: true, exclusionReason: expect.stringContaining("合格帖子") });
  });
  test("开奖复核删除帖子用户及禁用账号，内定也不能绕过；保留资格失效原因", async () => {
    const f = fixture({ endAt: new Date(now.getTime()-1000), drawAt: new Date(now.getTime()-1000) }, [post(), post({ userId: "missing", deletedAt: now })]);
    f.entries.push({ id: "entry-valid", userId: "valid", outcome: "waiting" }, { id: "entry-missing", userId: "missing", outcome: "waiting" }, { id: "entry-banned", userId: "banned", outcome: "waiting" });
    await expect(f.service.drawScheduled("campaign")).resolves.toMatchObject({ candidateCount: 1, randomWinners: 1 });
    expect(f.entries[0]).toMatchObject({ outcome: "won", prizeId: "prize" });
    expect(f.entries[1]).toMatchObject({ outcome: "excluded", exclusionReason: "post_requirement_unmet" });
    expect(f.entries[2]).toMatchObject({ outcome: "excluded", exclusionReason: "account_unavailable" });
    expect(f.db.welfareDraw.create.mock.calls[0][0].data.rules.postEligibility).toMatchObject({ requiredSince: publishedAt.toISOString(), excludedCount: 1 });
    await expect(f.service.drawScheduled("campaign")).resolves.toBe(false);
  });
  test("发帖资格查询故障不生成结果或消耗奖品", async () => {
    const f = fixture({ endAt: publishedAt, drawAt: publishedAt });
    f.entries.push({ id: "entry", userId: "valid", outcome: "waiting" });
    f.db.post.groupBy.mockRejectedValue(Error("database unavailable"));
    await expect(f.service.drawScheduled("campaign")).rejects.toThrow("database unavailable");
    expect(f.db.welfareEntry.updateMany).not.toHaveBeenCalled();
    expect(f.db.welfarePrize.update).not.toHaveBeenCalled();
    expect(f.db.welfareDraw.create).not.toHaveBeenCalled();
  });
  test("人数门槛按真正符合发帖条件的候选人数判断", async () => {
    const f = fixture({ minParticipants: 2, endAt: publishedAt, drawAt: publishedAt }, [post()]);
    f.entries.push({ id: "e1", userId: "valid", outcome: "waiting" }, { id: "e2", userId: "missing", outcome: "waiting" });
    const extend = jest.spyOn(f.service as any, "extendOrAbandon").mockResolvedValue({ extended: true });
    await expect(f.service.drawScheduled("campaign")).resolves.toEqual({ extended: true });
    expect(extend.mock.calls[0][2]).toBe(1);
    expect(f.db.welfareEntry.updateMany).not.toHaveBeenCalled();
  });
  test("查询仅包含目标用户并分批聚合，不读取帖子内容", async () => {
    const db: any = { post: { groupBy: jest.fn(async () => [{ userId: "u1" }]) } };
    const ids = Array.from({ length: 1001 }, (_, i) => "u" + i);
    expect(await qualifiedPostUsers(db, { publishedAt, regionId: "campus" }, ids, now)).toEqual(new Set(["u1"]));
    expect(db.post.groupBy.mock.calls.map(([q]: any) => q.where.userId.in.length)).toEqual([500, 500, 1]);
    expect(requiredPostWhere({ publishedAt, regionId: "campus" }, now)).toMatchObject({ status: "PUBLISHED", auditStatus: "approved", deletedAt: null, regionId: "campus", createdAt: { gte: publishedAt, lte: now } });
    expect(await postEligibility(db, "u1", { requirePost: false })).toEqual({ postCompleted: true, postPending: false });
  });
});
