import { WelfareService } from "./welfare.service";
import { validateCampaign } from "./welfare.policy";
const groupId = "wg_" + "a".repeat(40),
  extraId = "wg_" + "b".repeat(40);
function fixture() {
  const now = Date.now();
  const campaign: any = {
    id: "campaign",
    title: "企业群福利",
    mode: "scheduled",
    status: "published",
    regionId: "campus-a",
    requireGroup: true,
    groupVerificationMode: "wecom_member",
    groupRecheckAtDraw: true,
    groupIds: [groupId],
    startAt: new Date(now - 86400000),
    endAt: new Date(now - 1000),
    drawAt: new Date(now - 1000),
    claimUntil: new Date(now + 86400000),
    entryCount: 3,
    maxEntries: 100,
    prizes: [{ id: "prize", name: "好礼", kind: "physical", quantity: 1 }],
  };
  const entries: any[] = [
    { id: "entry-stay", userId: "stay", outcome: "waiting" },
    { id: "entry-left", userId: "left", outcome: "waiting" },
    { id: "entry-banned", userId: "banned", outcome: "waiting" },
  ];
  const db: any = {
    welfareCampaign: {
      findUnique: jest.fn(async () => campaign),
      updateMany: jest.fn(async () => ({ count: 1 })),
      update: jest.fn(async ({ data }: any) => Object.assign(campaign, data)),
    },
    user: {
      findMany: jest.fn(async () => [
        { id: "stay", nickname: "同学A" },
        { id: "left", nickname: "同学B" },
      ]),
      findFirst: jest.fn(async () => ({
        nickname: "同学A",
        createdAt: new Date(now - 86400000),
        profile: { regionId: "campus-a" },
      })),
    },
    welfareEntry: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async ({ where }: any) =>
        entries.filter((e) =>
          where.outcome === "waiting" ? e.outcome === "waiting" : true,
        ),
      ),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const selected = entries.filter((e) =>
          where.id ? where.id.in.includes(e.id) : e.outcome === where.outcome,
        );
        selected.forEach((e) => Object.assign(e, data));
        return { count: selected.length };
      }),
      update: jest.fn(async ({ where, data }: any) =>
        Object.assign(
          entries.find((e) => e.id === where.id),
          data,
        ),
      ),
      create: jest.fn(async () => ({ id: "new-entry" })),
    },
    welfarePrize: { update: jest.fn(async () => ({ kind: "physical" })) },
    welfarePrizeReserved: {
      findMany: jest.fn(async () => [{ userId: "left" }]),
    },
    welfareShareVisit: { findFirst: jest.fn(async () => null) },
    welfareDraw: { create: jest.fn() },
    notification: { createMany: jest.fn() },
    adminOperationLog: { create: jest.fn() },
  };
  db.$transaction = jest.fn(async (fn: any) => fn(db));
  const wecom: any = {
    prepareDraw: jest.fn(async () => ({
      groupIds: [groupId],
      fingerprint: "config-fingerprint",
      checkedAt: new Date(),
      snapshots: [{ id: groupId, memberVersion: "v2", syncedAt: new Date() }],
      eligible: new Set(["stay"]),
    })),
    assertProofCurrent: jest.fn(),
    validateGroups: jest.fn(),
    checkMember: jest.fn(async () => ({ groupId, verified: true })),
  };
  const scope: any = {
    getAdminContext: async () => ({ isSuperAdmin: true, regionIds: [] }),
  };
  const service = new WelfareService(
    db,
    scope,
    { assertStudentProtectedAction: jest.fn() } as any,
    {} as any,
    undefined,
    wecom,
  );
  jest
    .spyOn(service, "myEntry")
    .mockImplementation(async (id: string) => ({ id }) as any);
  return { service, db, wecom, campaign, entries };
}
describe("企业微信群报名与开奖资格", () => {
  test("退群者和禁用账号排除奖池；内定用户也须满足群资格，仅在群者获奖", async () => {
    const { service, db, entries } = fixture();
    await expect(service.drawScheduled("campaign")).resolves.toEqual({
      randomWinners: 1,
      candidateCount: 1,
    });
    expect(entries[0]).toMatchObject({
      outcome: "won",
      prizeId: "prize",
      groupCheckedAtDraw: expect.any(Date),
    });
    expect(entries[1]).toMatchObject({
      outcome: "excluded",
      exclusionReason: "left_official_group",
    });
    expect(entries[2]).toMatchObject({
      outcome: "excluded",
      exclusionReason: "account_unavailable",
    });
    expect(
      db.welfareDraw.create.mock.calls[0][0].data.rules.groupEligibility
        .excludedCount,
    ).toBe(1);
    await expect(service.drawScheduled("campaign")).resolves.toBe(false);
    expect(db.welfareDraw.create).toHaveBeenCalledTimes(1);
  });
  test("企业微信超时不生成开奖结果、消耗奖品或取消报名资格", async () => {
    const { service, db, wecom, entries, campaign } = fixture();
    wecom.prepareDraw.mockRejectedValue(Error("企业微信查询超时"));
    await expect(service.drawScheduled("campaign")).rejects.toThrow("超时");
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.welfareDraw.create).not.toHaveBeenCalled();
    expect(db.welfarePrize.update).not.toHaveBeenCalled();
    expect(entries.every((e) => e.outcome === "waiting")).toBe(true);
    expect(campaign.status).toBe("published");
  });
  test("读取快照后群回调或名单变化，提交前拒绝旧资格结果", async () => {
    const { service, db, wecom, entries } = fixture();
    wecom.assertProofCurrent.mockRejectedValue(Error("群成员状态已更新"));
    await expect(service.drawScheduled("campaign")).rejects.toThrow(
      "状态已更新",
    );
    expect(db.welfareEntry.updateMany).not.toHaveBeenCalled();
    expect(entries.every((e) => e.outcome === "waiting")).toBe(true);
  });
  test("没有打开开奖复核的旧活动保持原有开奖流程", async () => {
    const { service, wecom, campaign } = fixture();
    campaign.groupVerificationMode = "wechat_card";
    campaign.groupRecheckAtDraw = false;
    await expect(service.drawScheduled("campaign")).resolves.toMatchObject({
      candidateCount: 2,
    });
    expect(wecom.prepareDraw).not.toHaveBeenCalled();
  });
  test("前端伪造已验证标识仍会查服务端成员；拒绝时不创建报名", async () => {
    const { service, db, campaign, wecom } = fixture();
    campaign.endAt = new Date(Date.now() + 86400000);
    wecom.checkMember.mockRejectedValue(Error("未在官方群中"));
    await expect(
      service.participate("campaign", { sub: "stay" }, "wf_test_request_1", {
        verified: true,
        groupId,
      }),
    ).rejects.toThrow("未在官方群");
    expect(db.welfareEntry.create).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  test("已报名重试或退群返回仍能看原记录；接口故障不妨碍查看", async () => {
    const { service, db, wecom } = fixture();
    db.welfareEntry.findFirst.mockResolvedValue({ id: "existing" });
    await expect(
      service.participate("campaign", { sub: "left" }, "wf_test_request_1"),
    ).resolves.toEqual({ id: "existing" });
    expect(wecom.checkMember).not.toHaveBeenCalled();
  });
  test("普通入口通过服务端身份核验可报名，无需群密文", async () => {
    const { service, db, campaign, wecom } = fixture();
    campaign.endAt = new Date(Date.now() + 86400000);
    await expect(
      service.participate("campaign", { sub: "stay" }, "wf_test_request_1"),
    ).resolves.toEqual({ id: "new-entry" });
    expect(wecom.checkMember).toHaveBeenCalledWith(campaign, "stay");
    expect(db.welfareEntry.create.mock.calls[0][0].data.groupVerifiedId).toBe(
      groupId,
    );
  });
  test("活动发布前验证已导入的群；企业微信未配置的无群草稿可保存", () => {
    const now = new Date();
    const input = {
      title: "福利",
      description: "免费福利活动",
      mode: "scheduled",
      startAt: new Date(+now + 1000),
      endAt: new Date(+now + 86400000),
      drawAt: new Date(+now + 86400000),
      claimUntil: new Date(+now + 172800000),
      claimMethod: "shipping",
      maxEntries: 100,
      prizes: [{ name: "奖品", kind: "physical", quantity: 1 }],
      requireGroup: true,
      groupVerificationMode: "wecom_member",
      groupRecheckAtDraw: true,
      groupIds: [],
    };
    expect(validateCampaign(input, now)).toMatchObject({
      groupIds: [],
      groupRecheckAtDraw: true,
    });
    expect(() =>
      validateCampaign({ ...input, groupRecheckAtDraw: false }, now),
    ).toThrow("必须开启");
    expect(() =>
      validateCampaign({ ...input, groupIds: ["client-forged-chat-id"] }, now),
    ).toThrow("官方群");
    expect(() =>
      validateCampaign({ ...input, groupVerificationMode: "unknown" }, now),
    ).toThrow("方式");
  });
  test("发布后只允许报名截止前追加官方群，不能移除原群或截止后变更", async () => {
    const { service, db, campaign } = fixture();
    campaign.endAt = new Date(Date.now() + 86400000);
    await expect(
      service.addWecomGroups("campaign", "admin", [extraId]),
    ).rejects.toThrow("不能移除");
    expect(db.welfareCampaign.update).not.toHaveBeenCalled();
    await expect(
      service.addWecomGroups("campaign", "admin", [groupId, extraId]),
    ).resolves.toEqual({ groupIds: [groupId, extraId] });
    campaign.endAt = new Date(Date.now() - 1);
    await expect(
      service.addWecomGroups("campaign", "admin", [groupId, extraId]),
    ).rejects.toThrow("截止前");
  });
});
