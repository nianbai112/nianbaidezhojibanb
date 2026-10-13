import {
  memberHash,
  memberView,
  reconcileWecomMembers,
} from "./welfare-wecom.members";
import { WelfareWecomService } from "./welfare-wecom.service";

const config = {
  corpId: "ww_test",
  unionScope: "scope-a",
  enabled: true,
  appSecret: "private-secret",
};
const now = new Date("2026-10-07T10:00:00Z");
const group = {
  id: "group-a",
  corpId: config.corpId,
  regionId: "campus-a",
  dirtyVersion: 0,
  snapshotVersion: 0,
  name: "校园福利群",
  rosterSyncedAt: now,
};
const remote = (id = "wx-a", union: string | null = "union-a") => ({
  userid: id,
  type: 2,
  unionid: union,
  group_nickname: "群昵称",
  name: "微信昵称",
  join_time: 1700000000,
});
const account = (id = "user-a", union = "union-a") => ({
  id,
  uid: 123,
  nickname: "小程序昵称",
  unionid: union,
  authIdentities: [],
  status: "ACTIVE",
  deletedAt: null,
  userType: 1,
  systemRole: null,
  studentVerify: null,
});

function persistenceFixture(users: any[] = [account()]) {
  const rows: any[] = [],
    currentGroup = { ...group };
  const match = (row: any, where: any) =>
    Object.entries(where).every(([key, value]: [string, any]) =>
      value && typeof value === "object" && !(value instanceof Date)
        ? value.in
          ? value.in.includes(row[key])
          : value.notIn
            ? !value.notIn.includes(row[key])
            : false
        : row[key] === value,
    );
  const db: any = {
    user: { findMany: jest.fn(async () => users) },
    welfareWecomGroup: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (where.dirtyVersion !== currentGroup.dirtyVersion)
          return { count: 0 };
        Object.assign(currentGroup, data);
        return { count: 1 };
      }),
    },
    welfareWecomMember: {
      findMany: jest.fn(async () => rows.map((row) => ({ ...row }))),
      createMany: jest.fn(async ({ data }: any) => {
        rows.push(...data.map((row: any) => ({ ...row, leftAt: null })));
        return { count: data.length };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const matching = rows.filter((row) => match(row, where));
        matching.forEach((row) => Object.assign(row, data));
        return { count: matching.length };
      }),
      update: jest.fn(async ({ where, data }: any) =>
        Object.assign(
          rows.find((row) => row.id === where.id),
          data,
        ),
      ),
    },
  };
  db.$transaction = jest.fn(async (fn: any) => {
    const savedRows = rows.map((row) => ({ ...row })),
      savedGroup = { ...currentGroup };
    try {
      return await fn(db);
    } catch (e) {
      rows.splice(0, rows.length, ...savedRows);
      Object.assign(currentGroup, savedGroup);
      throw e;
    }
  });
  return { db, rows, currentGroup };
}

describe("企业微信群成员名册同步", () => {
  test("保存群昵称和本地账号关联，只保存微信身份摘要", async () => {
    const { db, rows } = persistenceFixture();
    await reconcileWecomMembers(db, group, config, [remote()], now);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      nickname: "群昵称",
      linkedUserId: "user-a",
      identityState: "linked",
      leftAt: null,
      lastSeenAt: now,
    });
    expect(rows[0].identityHash).toBe(
      memberHash(config.corpId, config.unionScope, "union-a"),
    );
    expect(JSON.stringify(rows)).not.toMatch(/union-a|wx-a|private-secret/);
  });
  test("退群保留历史，重新入群沿用同一成员记录并更新入群时间", async () => {
    const { db, rows } = persistenceFixture();
    await reconcileWecomMembers(db, group, config, [remote()], now);
    const id = rows[0].id,
      left = new Date(now.getTime() + 10000),
      rejoined = new Date(now.getTime() + 20000);
    await reconcileWecomMembers(db, group, config, [], left);
    expect(rows[0]).toMatchObject({ id, leftAt: left, lastSeenAt: now });
    await reconcileWecomMembers(
      db,
      group,
      config,
      [{ ...remote(), join_time: rejoined.getTime() / 1000 }],
      rejoined,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id,
      leftAt: null,
      firstSeenAt: now,
      joinedAt: rejoined,
      lastSeenAt: rejoined,
    });
  });
  test("未知身份和企业工作人员保留，但不强行关联到账号", async () => {
    const { db, rows } = persistenceFixture();
    await reconcileWecomMembers(
      db,
      group,
      config,
      [
        remote("wx-b", null),
        { userid: "staff-a", type: 1, name: "运营老师", unionid: "union-a" },
      ],
      now,
    );
    expect(rows.map((row) => [row.identityState, row.linkedUserId])).toEqual([
      ["unavailable", null],
      ["staff", null],
    ]);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });
  test("稍后使用小程序的人，在下一次同步后补上账号关联", async () => {
    const users: any[] = [],
      { db, rows } = persistenceFixture(users);
    await reconcileWecomMembers(db, group, config, [remote()], now);
    expect(rows[0].identityState).toBe("unlinked");
    users.push(account());
    await reconcileWecomMembers(
      db,
      group,
      config,
      [remote()],
      new Date(now.getTime() + 1000),
    );
    expect(rows[0]).toMatchObject({
      identityState: "linked",
      linkedUserId: "user-a",
    });
  });
  test("同一UnionID对应多个账号或账号身份冲突时，不猜测归属", async () => {
    for (const users of [
      [account(), account("user-b")],
      [{ ...account(), authIdentities: [{ subject: "other-union" }] }],
    ]) {
      const { db, rows } = persistenceFixture(users);
      await reconcileWecomMembers(db, group, config, [remote()], now);
      expect(rows[0]).toMatchObject({
        identityState: "ambiguous",
        linkedUserId: null,
      });
    }
  });
  test("使用指定开放平台的身份记录匹配，无原始User.unionid也能关联", async () => {
    const { db, rows } = persistenceFixture([
      { ...account(), unionid: null, authIdentities: [{ subject: "union-a" }] },
    ]);
    await reconcileWecomMembers(db, group, config, [remote()], now);
    expect(
      db.user.findMany.mock.calls[0][0].where.OR[1].authIdentities.some,
    ).toMatchObject({ provider: "wechat-union", appId: "scope-a" });
    expect(rows[0].linkedUserId).toBe("user-a");
  });
  test("名单不完整或出现重复成员时，不把已有成员批量标成退群", async () => {
    const { db, rows } = persistenceFixture();
    await reconcileWecomMembers(db, group, config, [remote()], now);
    for (const list of [[{ type: 2 }], [remote(), remote()]])
      await expect(
        reconcileWecomMembers(db, group, config, list, now),
      ).rejects.toThrow("群成员");
    expect(rows[0].leftAt).toBeNull();
  });
  test("同步时回调改变名单版本，拒绝落库，原历史仍然保留", async () => {
    const { db, rows, currentGroup } = persistenceFixture();
    await reconcileWecomMembers(db, group, config, [remote()], now);
    currentGroup.dirtyVersion = 1;
    await expect(
      reconcileWecomMembers(db, group, config, [], now),
    ).rejects.toThrow("正在变化");
    expect(rows[0].leftAt).toBeNull();
  });
  test("数据库事务失败回滚新增及离群标记", async () => {
    const { db, rows } = persistenceFixture();
    await reconcileWecomMembers(db, group, config, [remote()], now);
    db.welfareWecomMember.updateMany.mockRejectedValueOnce(
      Error("transaction-failed"),
    );
    await expect(
      reconcileWecomMembers(db, group, config, [remote("wx-b")], now),
    ).rejects.toThrow("transaction-failed");
    expect(rows).toHaveLength(1);
    expect(rows[0].leftAt).toBeNull();
  });
});

function readFixture() {
  const users: any[] = [account(), account("user-b", "union-b")];
  users[0].studentVerify = {
    status: "APPROVED",
    schoolId: "school-a",
    proofMethod: "MANUAL_REVIEW",
    school: {
      id: "school-a",
      name: "测试学院",
      regionId: "campus-a",
      isEnabled: true,
    },
  };
  const member = (id: string, user: any) => ({
    id,
    groupId: group.id,
    nickname: id,
    memberType: 2,
    firstSeenAt: now,
    lastSeenAt: now,
    joinedAt: now,
    leftAt: null,
    linkedUserId: user?.id || null,
    identityState: user ? "linked" : "unlinked",
    identityScope: config.unionScope,
    identityHash: user
      ? memberHash(config.corpId, config.unionScope, user.unionid)
      : null,
  });
  const roster: any[] = [
    member("同学甲", users[0]),
    member("同学乙", users[1]),
    member("尚未关联同学", null),
    { ...member("退群同学", users[0]), leftAt: now },
    { ...member("老师", null), memberType: 1, identityState: "staff" },
  ];
  const campaigns = [
    {
      id: "campaign-a",
      title: "校园抽奖",
      status: "published",
      requireGroup: true,
      groupVerificationMode: "wecom_member",
      groupIds: [group.id],
    },
    {
      id: "unrelated",
      groupIds: ["other-group"],
      requireGroup: true,
      groupVerificationMode: "wecom_member",
    },
  ];
  const db: any = {
    config: { findUnique: jest.fn(async () => ({ value: config })) },
    welfareWecomGroup: { findUnique: jest.fn(async () => group) },
    welfareWecomMember: { findMany: jest.fn(async () => roster) },
    welfareCampaign: { findMany: jest.fn(async () => campaigns) },
    user: { findMany: jest.fn(async () => users) },
    welfareEntry: {
      findMany: jest.fn(async () => [
        {
          userId: users[0].id,
          outcome: "excluded",
          exclusionReason: "left_official_group",
          createdAt: now,
        },
      ]),
    },
  };
  const scope: any = {
    getAdminContext: jest.fn(async () => ({
      isSuperAdmin: true,
      regionIds: ["campus-a"],
    })),
  };
  return {
    service: new WelfareWecomService(db, {} as any, scope),
    db,
    users,
    roster,
    scope,
  };
}

describe("企业微信群成员报名和认证查询", () => {
  test("关联成功才判断未报名，未知身份始终是无法判断；统计不含退群和工作人员", async () => {
    const { service } = readFixture();
    const result = await service.members("admin", group.id, {
      campaignId: "campaign-a",
    });
    expect(result.summary).toEqual({
      currentCustomers: 3,
      linked: 2,
      unknown: 1,
      registered: 1,
      unregistered: 1,
      studentApproved: 1,
      historicalCustomers: 1,
    });
    expect(
      result.list.map((row) => [
        row.nickname,
        row.participation,
        row.studentStatus,
      ]),
    ).toEqual([
      ["同学甲", "registered", "approved"],
      ["同学乙", "unregistered", "none"],
      ["尚未关联同学", "unknown", "unknown"],
    ]);
    expect(result.list[0]).toMatchObject({
      outcome: "excluded",
      exclusionReason: "开奖前已不在指定官方群",
      schoolName: "测试学院",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /union-a|identityHash|memberKey|private-secret/,
    );
  });
  test("未选择活动不会虚构未报名状态，也不查询报名表", async () => {
    const { service, db } = readFixture();
    const result = await service.members("admin", group.id);
    expect(
      result.list.every((row) => row.participation === "not_selected"),
    ).toBe(true);
    expect(result.summary.registered).toBeNull();
    expect(db.welfareEntry.findMany).not.toHaveBeenCalled();
  });
  test("筛选已认证但未报名的人，并支持昵称、用户编号搜索和分页", async () => {
    const { service, users } = readFixture();
    users[1].studentVerify = users[0].studentVerify;
    users[1].uid = 456;
    const result = await service.members("admin", group.id, {
      campaignId: "campaign-a",
      studentStatus: "approved",
      participation: "unregistered",
      search: "456",
      pageSize: 1,
    });
    expect(result.total).toBe(1);
    expect(result.list[0].nickname).toBe("同学乙");
    expect(
      (await service.members("admin", group.id, { page: 2, pageSize: 1 }))
        .list[0].nickname,
    ).toBe("同学乙");
  });
  test("只展示退群历史时，保留原有参与记录，不改成未参加", async () => {
    const { service } = readFixture();
    const result = await service.members("admin", group.id, {
      presence: "left",
      campaignId: "campaign-a",
    });
    expect(result.list).toHaveLength(1);
    expect(result.list[0]).toMatchObject({
      presence: "left",
      participation: "registered",
      outcome: "excluded",
    });
  });
  test("审核标记通过但学校停用、学籍失效或认证已撤销时，不显示当前已通过", async () => {
    const { service, users } = readFixture();
    users[0].studentVerify.school.isEnabled = false;
    expect(
      (await service.members("admin", group.id)).list[0].studentStatus,
    ).toBe("revoked");
    users[0].studentVerify.school.isEnabled = true;
    users[0].studentVerify.status = "REVOKED";
    expect(
      (await service.members("admin", group.id)).list[0].studentStatus,
    ).toBe("revoked");
  });
  test("查询时微信身份变化、账号注销、停用或机器人账号，不泄露原账号信息", async () => {
    for (const patch of [
      { unionid: "changed" },
      { deletedAt: now },
      { status: "BANNED" },
      { userType: 4 },
      { authIdentities: [{ subject: "conflict" }] },
    ]) {
      const { service, users } = readFixture();
      Object.assign(users[0], patch);
      const row = (
        await service.members("admin", group.id, { campaignId: "campaign-a" })
      ).list[0];
      expect(row).toMatchObject({
        uid: null,
        platformNickname: null,
        schoolName: null,
        participation: "unknown",
        studentStatus: "unknown",
      });
    }
  });
  test("拒绝跨校区和跨企业访问，拒绝无关活动，不提前查询成员信息", async () => {
    const { service, db, scope } = readFixture();
    scope.getAdminContext.mockResolvedValue({
      isSuperAdmin: false,
      regionIds: ["other-campus"],
    });
    await expect(service.members("regional", group.id)).rejects.toThrow("无权");
    expect(db.welfareWecomMember.findMany).not.toHaveBeenCalled();
    scope.getAdminContext.mockResolvedValue({ isSuperAdmin: true });
    await expect(
      service.members("admin", group.id, { campaignId: "unrelated" }),
    ).rejects.toThrow("未使用本群");
    db.welfareWecomGroup.findUnique.mockResolvedValue({
      ...group,
      corpId: "other-company",
    });
    await expect(service.members("admin", group.id)).rejects.toThrow(
      "其他企业",
    );
  });
  test("地域管理员的活动查询限制在该群校区", async () => {
    const { service, db, scope } = readFixture();
    scope.getAdminContext.mockResolvedValue({
      isSuperAdmin: false,
      regionIds: ["campus-a"],
    });
    await service.members("regional", group.id);
    expect(db.welfareCampaign.findMany.mock.calls[0][0].where.regionId).toBe(
      "campus-a",
    );
  });
  test.each([
    { presence: "invalid" },
    { search: ["bad"] },
    { campaignId: ["bad"] },
    { page: 0 },
    { pageSize: 101 },
    { page: "1.5" },
    { participation: "unregistered" },
  ])("拒绝无效筛选参数 %j", async (query) => {
    await expect(
      readFixture().service.members("admin", group.id, query),
    ).rejects.toThrow();
  });
  test("开放平台配置变化后旧名册关联失效，不复用其他平台的身份", () => {
    const member = {
      id: "m",
      memberType: 2,
      identityState: "linked",
      identityScope: "other-scope",
      identityHash: memberHash(config.corpId, "other-scope", "union-a"),
    };
    expect(memberView(member, account(), null, config, true)).toMatchObject({
      identityStatus: "unlinked",
      participation: "unknown",
      studentStatus: "unknown",
    });
  });
});
