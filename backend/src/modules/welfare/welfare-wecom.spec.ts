import axios from "axios";
import { createHash } from "node:crypto";
import {
  WelfareWecomService,
  normalizeWecomConfig,
  wecomIdentityHash,
} from "./welfare-wecom.service";
import { SystemConfigService } from "../system-config/system-config.service";
import { SystemAdminService } from "../system-admin/system-admin.service";

const config = {
  enabled: true,
  corpId: "ww_test",
  appSecret: "private-app-secret",
  unionScope: "open-platform-test",
  callbackToken: "",
  encodingAESKey: "",
};
const groupId = "wg_" + "a".repeat(40),
  secondId = "wg_" + "b".repeat(40);
const campaign = { id: "campaign", regionId: "campus-a", groupIds: [groupId] };
function fixture() {
  const rows: any[] = [
    {
      id: groupId,
      corpId: config.corpId,
      chatId: "chat-a",
      name: "官方群A",
      owner: "teacher",
      regionId: "campus-a",
      dirtyVersion: 0,
      snapshotVersion: -1,
      syncedAt: null,
    },
  ];
  const users: any[] = [
    {
      id: "student",
      unionid: "union-student",
      status: "ACTIVE",
      userType: 1,
      deletedAt: null,
      systemRole: null,
    },
  ];
  const identities: any[] = [];
  const cache = new Map<string, string>();
  const db: any = {
    config: {
      findUnique: jest.fn(async () => ({ value: config })),
      upsert: jest.fn(),
    },
    region: { findUnique: jest.fn(async () => ({ id: "campus-a" })) },
    user: {
      findMany: jest.fn(async ({ where }: any) =>
        users.filter(
          (u) =>
            (where.OR
              ? where.OR[0].unionid.in.includes(u.unionid)
              : where.id.in.includes(u.id)) &&
            (!where.status || u.status === where.status),
        ),
      ),
    },
    userAuthIdentity: {
      findMany: jest.fn(async ({ where }: any) =>
        identities.filter(
          (i) =>
            where.userId.in.includes(i.userId) &&
            i.appId === where.appId &&
            i.provider === where.provider,
        ),
      ),
    },
    welfareEntry: { findMany: jest.fn(async () => [{ userId: "student" }]) },
    welfareWecomMember: {
      findMany: jest.fn(async () => []),
      createMany: jest.fn(async () => ({ count: 1 })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      update: jest.fn(),
    },
    welfareWecomGroup: {
      findUnique: jest.fn(async ({ where }: any) =>
        rows.find((r) => r.id === where.id),
      ),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const row = rows.find((r) => r.id === where.id);
        if (!row) throw Error("missing");
        return { ...row };
      }),
      findMany: jest.fn(async ({ where }: any) =>
        rows.filter(
          (r) =>
            (!where.id || where.id.in.includes(r.id)) &&
            r.corpId === where.corpId &&
            (!where.regionId || where.regionId.in.includes(r.regionId)),
        ),
      ),
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const row of rows) {
          if (
            (where.id && row.id !== where.id) ||
            (where.corpId && row.corpId !== where.corpId) ||
            (where.chatId && row.chatId !== where.chatId) ||
            (where.dirtyVersion !== undefined &&
              row.dirtyVersion !== where.dirtyVersion)
          )
            continue;
          for (const [key, value] of Object.entries<any>(data))
            row[key] =
              value?.increment !== undefined
                ? row[key] + value.increment
                : value;
          count++;
        }
        return { count };
      }),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const row = rows.find((r) => r.id === where.id);
        if (row) {
          Object.assign(row, update);
          return row;
        }
        const added = {
          ...create,
          dirtyVersion: 0,
          snapshotVersion: -1,
          syncedAt: null,
        };
        rows.push(added);
        return added;
      }),
    },
    adminOperationLog: { create: jest.fn() },
  };
  db.$transaction = jest.fn(async (fn: any) => fn(db));
  const scope: any = {
    getAdminContext: jest.fn(async () => ({
      isSuperAdmin: true,
      regionIds: ["campus-a"],
    })),
  };
  const redis: any = {
    get: jest.fn(async (k: string) => cache.get(k)),
    set: jest.fn(async (k: string, v: string) => cache.set(k, v)),
    withLock: jest.fn(async (_k: string, _ttl: number, run: any) => run()),
  };
  const service = new WelfareWecomService(db, redis, scope);
  jest.spyOn(axios, "get").mockResolvedValue({
    data: { errcode: 0, access_token: "private-token", expires_in: 7200 },
  });
  const post = jest
    .spyOn(axios, "post")
    .mockImplementation(async (_url: any, body: any) => ({
      data: {
        errcode: 0,
        group_chat: {
          chat_id: body.chat_id,
          name: "官方群A",
          owner: "teacher",
          member_version: "v1",
          member_list: [
            { userid: "external-student", type: 2, unionid: "union-student" },
          ],
        },
      },
    }));
  return { service, db, scope, redis, rows, users, identities, post };
}
describe("企业微信群身份与官方群边界", () => {
  test("已验签的解散事件清空该群资格，乱序更新不会恢复已解散群，也不再请求不存在的群", async () => {
    const { service, rows, post } = fixture();
    await service.checkMember(campaign, "student");
    const calls = post.mock.calls.length;
    await service.invalidate(config.corpId, "chat-a", "dismiss");
    await service.invalidate(config.corpId, "chat-a");
    expect(rows[0].isDismissed).toBe(true);
    await expect(service.prepareDraw(campaign)).resolves.toMatchObject({
      eligible: new Set(),
    });
    expect(post).toHaveBeenCalledTimes(calls);
  });
  const originalScope = process.env.WX_OPEN_PLATFORM_ACCOUNT_ID;
  beforeEach(() => {
    delete process.env.WX_OPEN_PLATFORM_ACCOUNT_ID;
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (originalScope === undefined)
      delete process.env.WX_OPEN_PLATFORM_ACCOUNT_ID;
    else process.env.WX_OPEN_PLATFORM_ACCOUNT_ID = originalScope;
  });
  test("没有配置时允许读空列表，核验明确拒绝；旧活动无需启用", async () => {
    const { service, db } = fixture();
    db.config.findUnique.mockResolvedValue(null);
    await expect(service.groups("admin")).resolves.toMatchObject({
      configured: false,
      list: [],
    });
    await expect(
      service.checkMember(campaign, "student"),
    ).rejects.toMatchObject({
      response: { code: "WELFARE_WECOM_UNAVAILABLE" },
    });
  });
  test("配置只接受真实布尔值；掩码保留原密钥，回调密钥成对填写", () => {
    expect(
      normalizeWecomConfig({ ...config, appSecret: "******" }, config)
        .appSecret,
    ).toBe(config.appSecret);
    expect(() => normalizeWecomConfig({ ...config, enabled: "false" })).toThrow(
      "启用",
    );
    expect(() =>
      normalizeWecomConfig({ ...config, callbackToken: "token" }),
    ).toThrow("一起");
    expect(() => normalizeWecomConfig({ ...config, unionScope: "" })).toThrow(
      "启用前",
    );
  });
  test("只有超级管理员能读取密钥配置、导入或保存；读取与审计不泄露Secret", async () => {
    const { service, scope, db } = fixture();
    expect((await service.adminConfig("admin")).appSecret).toBe("******");
    await service.saveConfig("admin", config);
    expect(
      JSON.stringify(db.adminOperationLog.create.mock.calls),
    ).not.toContain(config.appSecret);
    scope.getAdminContext.mockResolvedValue({
      isSuperAdmin: false,
      regionIds: ["campus-a"],
    });
    await expect(service.adminConfig("regional")).rejects.toThrow("超级管理员");
    await expect(service.saveConfig("regional", config)).rejects.toThrow(
      "超级管理员",
    );
    await expect(
      service.importGroups("regional", {
        chatIds: ["chat-a"],
        regionId: "campus-a",
      }),
    ).rejects.toThrow("超级管理员");
  });
  test("同一身份在本活动群内无需卡片，数据库与管理员响应不保存原始成员ID", async () => {
    const { service, rows, post } = fixture();
    await expect(
      service.checkMember(campaign, "student"),
    ).resolves.toMatchObject({ verified: true, groupId });
    expect(rows[0].memberHashes).toEqual([
      wecomIdentityHash(config.corpId, config.unionScope, "union-student"),
    ]);
    expect(JSON.stringify(rows)).not.toContain("union-student");
    expect(JSON.stringify(rows)).not.toContain("external-student");
    const publicRows = await service.groups("admin");
    expect(JSON.stringify(publicRows)).not.toContain("memberHashes");
    expect(post.mock.calls[0][1]).toEqual({ chat_id: "chat-a", need_name: 1 });
  });
  test("导入前显示真实群名和人数，不返回群成员身份，也不提前导入", async () => {
    const { service, post, db } = fixture();
    post.mockImplementation(async (url: any, body: any) => ({
      data: String(url).endsWith("/list")
        ? {
            errcode: 0,
            group_chat_list: [{ chat_id: "chat-a", status: 0 }],
            next_cursor: "next-page",
          }
        : {
            errcode: 0,
            group_chat: {
              chat_id: body.chat_id,
              name: "校小伴校园福利群",
              owner: "private-owner",
              member_list: [
                { userid: "private-member", unionid: "private-union" },
              ],
            },
          },
    }));
    const result = await service.discover("admin");
    expect(result).toEqual({
      list: [
        {
          chatId: "chat-a",
          status: 0,
          name: "校小伴校园福利群",
          memberCount: 1,
          error: null,
        },
      ],
      cursor: "next-page",
    });
    expect(post.mock.calls[0][1]).toEqual({ cursor: "", limit: 20 });
    expect(JSON.stringify(result)).not.toContain("private-");
    expect(db.welfareWecomGroup.upsert).not.toHaveBeenCalled();
  });
  test("部分群无法读取时保留其他群名，并返回可操作且不泄密的失败原因", async () => {
    const { service, post } = fixture();
    post.mockImplementation(async (url: any, body: any) => ({
      data: String(url).endsWith("/list")
        ? {
            errcode: 0,
            group_chat_list: [{ chat_id: "chat-a" }, { chat_id: "chat-b" }],
          }
        : body.chat_id === "chat-a"
          ? { errcode: 48002, errmsg: "private-secret-from-provider" }
          : {
              errcode: 0,
              group_chat: {
                chat_id: body.chat_id,
                name: "可用官方群",
                member_list: [],
              },
            },
    }));
    const result = await service.discover("admin");
    expect(result.list[0]).toMatchObject({
      name: "群信息暂不可用",
      memberCount: null,
      error: expect.stringContaining("可调用接口的应用"),
    });
    expect(result.list[1]).toMatchObject({
      name: "可用官方群",
      memberCount: 0,
      error: null,
    });
    expect(JSON.stringify(result)).not.toContain("private-secret");
  });
  test("群名查询并发不超过4个，分页顺序保持一致", async () => {
    const { service, post } = fixture();
    const chats = Array.from({ length: 9 }, (_, index) => ({
      chat_id: "chat-" + index,
    }));
    let active = 0,
      peak = 0;
    post.mockImplementation(async (url: any, body: any) => {
      if (String(url).endsWith("/list"))
        return { data: { errcode: 0, group_chat_list: chats } };
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      active--;
      return {
        data: {
          errcode: 0,
          group_chat: {
            chat_id: body.chat_id,
            name: "官方群" + body.chat_id,
            member_list: [],
          },
        },
      };
    });
    const result = await service.discover("admin", "cursor-a");
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
    expect(result.list.map((group) => group.chatId)).toEqual(
      chats.map((group) => group.chat_id),
    );
    expect(post.mock.calls[0][1]).toEqual({ cursor: "cursor-a", limit: 20 });
  });
  test("群列表编号异常时明确失败，不使用错误编号查询或导入", async () => {
    const { service, post } = fixture();
    post.mockResolvedValue({ data: { errcode: 0, group_chat_list: [null] } });
    await expect(service.discover("admin")).rejects.toThrow("群编号不完整");
    expect(post).toHaveBeenCalledTimes(1);
  });
  test.each([
    [60020, "企业可信IP"],
    [48002, "可调用接口的应用"],
  ])("客户群接口错误%s给出对应的配置入口", async (code, guidance) => {
    const { service, post } = fixture();
    post.mockResolvedValue({
      data: { errcode: code, errmsg: "private-provider-message" },
    });
    await expect(service.discover("admin")).rejects.toThrow(String(guidance));
  });
  test("其他活动群、其他企业、其他校区不能提供资格", async () => {
    const { service, rows, post } = fixture();
    rows.push({ ...rows[0], id: secondId, chatId: "chat-b" });
    post.mockResolvedValue({
      data: {
        errcode: 0,
        group_chat: {
          chat_id: "chat-a",
          member_version: "v1",
          member_list: [],
        },
      },
    });
    await expect(
      service.checkMember(campaign, "student"),
    ).rejects.toMatchObject({ response: { code: "WELFARE_WECOM_NOT_MEMBER" } });
    rows[0].corpId = "other-enterprise";
    await expect(service.validateGroups(campaign)).rejects.toThrow("其他企业");
    rows[0].corpId = config.corpId;
    rows[0].regionId = "campus-b";
    await expect(service.validateGroups(campaign)).rejects.toThrow("校区");
  });
  test("分享来源先将opengid转换为本企业chat_id；不能拿两种不同的群标识直接比较", async () => {
    const { service, rows, post } = fixture();
    const id =
      "wg_" +
      createHash("sha256")
        .update(JSON.stringify([config.corpId, "chat-a"]))
        .digest("hex")
        .slice(0, 40);
    rows[0].id = id;
    post.mockResolvedValue({ data: { errcode: 0, chat_id: "chat-a" } });
    await expect(
      service.sharedGroupSource(
        { ...campaign, groupIds: [id] },
        "wx-open-group-id",
      ),
    ).resolves.toBe("official");
    post.mockResolvedValue({
      data: { errcode: 0, chat_id: "unselected-own-group" },
    });
    await expect(
      service.sharedGroupSource(
        { ...campaign, groupIds: [id] },
        "wx-open-group-id",
      ),
    ).resolves.toBe("other_group");
    expect(post.mock.calls[0][1]).toEqual({ opengid: "wx-open-group-id" });
    post.mockResolvedValue({ data: { errcode: 48009 } });
    await expect(
      service.sharedGroupSource(
        { ...campaign, groupIds: [id] },
        "wx-open-group-id",
      ),
    ).rejects.toThrow("接口返回错误");
  });
  test("缺少UnionID、身份记录冲突、开放平台配置错配均不能放行", async () => {
    const { service, users, identities } = fixture();
    users[0].unionid = null;
    await expect(
      service.checkMember(campaign, "student"),
    ).rejects.toMatchObject({
      response: { code: "WELFARE_WECOM_IDENTITY_REQUIRED" },
    });
    identities.push({
      provider: "wechat-union",
      appId: config.unionScope,
      userId: "student",
      subject: "union-student",
    });
    await expect(
      service.checkMember(campaign, "student"),
    ).resolves.toMatchObject({ verified: true });
    users[0].unionid = "conflict";
    await expect(service.checkMember(campaign, "student")).rejects.toThrow(
      "身份记录不一致",
    );
    process.env.WX_OPEN_PLATFORM_ACCOUNT_ID = "wrong-platform";
    await expect(service.checkMember(campaign, "student")).rejects.toThrow(
      "不一致",
    );
  });
  test("成功快照短期复用；退群回调立即失效缓存，重复/乱序回调只触发全量查询", async () => {
    const { service, post } = fixture();
    const proof = await service.checkMember(campaign, "student");
    await service.checkMember(campaign, "student");
    expect(post).toHaveBeenCalledTimes(1);
    await service.invalidate(config.corpId, "chat-a");
    await service.invalidate(config.corpId, "chat-a");
    await expect(
      service.assertProofCurrent((service as any).prisma, proof),
    ).rejects.toThrow("状态已更新");
    post.mockResolvedValue({
      data: {
        errcode: 0,
        group_chat: {
          chat_id: "chat-a",
          member_version: "v2",
          member_list: [],
        },
      },
    });
    await expect(
      service.checkMember(campaign, "student"),
    ).rejects.toMatchObject({ response: { code: "WELFARE_WECOM_NOT_MEMBER" } });
    expect(post).toHaveBeenCalledTimes(2);
  });
  test("同步中的成员变化不落库为有效快照；查询失败不当作退群", async () => {
    const { service, post, rows } = fixture();
    post.mockImplementationOnce(async () => {
      await service.invalidate(config.corpId, "chat-a");
      return {
        data: {
          errcode: 0,
          group_chat: {
            chat_id: "chat-a",
            member_list: [
              { type: 2, userid: "external-student", unionid: "union-student" },
            ],
          },
        },
      };
    });
    await expect(
      service.checkMember(campaign, "student"),
    ).rejects.toMatchObject({
      response: { code: "WELFARE_WECOM_UNAVAILABLE" },
    });
    expect(rows[0].snapshotVersion).toBe(-1);
    post.mockRejectedValue(Error("secret-url-token"));
    await expect(service.checkMember(campaign, "student")).rejects.toThrow(
      "查询失败",
    );
    expect(JSON.stringify(rows)).not.toContain("secret-url-token");
  });
  test("权限变化导致客户群不返回任何UnionID时暂缓核验，不能判定所有人退群", async () => {
    const { service, post } = fixture();
    post.mockResolvedValue({
      data: {
        errcode: 0,
        group_chat: {
          chat_id: "chat-a",
          member_list: [{ type: 2, userid: "unidentifiable" }],
        },
      },
    });
    await expect(service.prepareDraw(campaign)).rejects.toMatchObject({
      response: { code: "WELFARE_WECOM_UNAVAILABLE" },
    });
  });
  test("开奖强制刷新所有群；任意群查询失败都不返回部分资格集合", async () => {
    const { service, post, rows } = fixture();
    await service.checkMember(campaign, "student");
    await expect(service.prepareDraw(campaign)).resolves.toMatchObject({
      eligible: new Set(["student"]),
    });
    expect(post).toHaveBeenCalledTimes(2);
    rows.push({ ...rows[0], id: secondId, chatId: "chat-b" });
    post.mockImplementation(async (_url: any, body: any) => {
      if (body.chat_id === "chat-b") throw Error("timeout");
      return {
        data: {
          errcode: 0,
          group_chat: { chat_id: "chat-a", member_list: [] },
        },
      };
    });
    await expect(
      service.prepareDraw({ ...campaign, groupIds: [groupId, secondId] }),
    ).rejects.toMatchObject({
      response: { code: "WELFARE_WECOM_UNAVAILABLE" },
    });
  });
  test("名单只认指定开放平台身份；其他平台标识不能填补缺失身份", async () => {
    const { service, users, identities } = fixture();
    users[0].unionid = null;
    identities.push({
      provider: "wechat-union",
      appId: "other-platform",
      userId: "student",
      subject: "union-student",
    });
    await expect(service.prepareDraw(campaign)).rejects.toThrow("自动重试");
  });
  test("外部回调不会自动注册未知群；地域管理员只能读取和同步本校区", async () => {
    const { service, rows, scope } = fixture();
    await service.invalidate(config.corpId, "unknown");
    expect(rows).toHaveLength(1);
    scope.getAdminContext.mockResolvedValue({
      isSuperAdmin: false,
      regionIds: ["campus-b"],
    });
    await expect(service.groups("regional")).resolves.toMatchObject({
      list: [],
    });
    await expect(service.sync("regional", groupId)).rejects.toThrow("无权");
  });
  test("导入前验证所有群；错误chat_id不会产生部分官方群注册", async () => {
    const { service, post, db } = fixture();
    post.mockImplementation(async (_url: any, body: any) => {
      if (body.chat_id === "bad") throw Error("timeout");
      return {
        data: {
          errcode: 0,
          group_chat: { chat_id: body.chat_id, member_list: [] },
        },
      };
    });
    await expect(
      service.importGroups("admin", {
        chatIds: ["new", "bad"],
        regionId: "campus-a",
      }),
    ).rejects.toThrow("查询失败");
    expect(db.welfareWecomGroup.upsert).not.toHaveBeenCalled();
  });
  test("token过期只刷新一次；无法获取授权不会输出原始密钥或token", async () => {
    const { service, post } = fixture();
    post.mockResolvedValueOnce({ data: { errcode: 42001, errmsg: "secret" } });
    await expect(
      service.checkMember(campaign, "student"),
    ).resolves.toMatchObject({ verified: true });
    expect(axios.get).toHaveBeenCalledTimes(2);
    await service.invalidate(config.corpId, "chat-a");
    post.mockResolvedValue({
      data: { errcode: 48009, errmsg: config.appSecret },
    });
    await expect(service.checkMember(campaign, "student")).rejects.toThrow(
      "48009",
    );
  });
  test("通用配置接口掩码所有密钥，且无法绕过专用入口更新或删除企业微信配置", async () => {
    const db: any = {
      config: {
        findUnique: jest.fn(async () => ({
          key: "welfare_wecom",
          value: {
            ...config,
            callbackToken: "callback-secret",
            encodingAESKey: "aes-secret",
          },
        })),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    const generic = new SystemConfigService(db, {} as any);
    expect(
      (await generic.getConfigByKey("welfare_wecom")).data.value,
    ).toMatchObject({
      appSecret: "******",
      callbackToken: "******",
      encodingAESKey: "******",
    });
    await expect(
      generic.updateConfigs(
        [{ key: "welfare_wecom", value: { enabled: false } }],
        "regional",
      ),
    ).rejects.toThrow("接入配置");
    await expect(
      generic.setNamedConfig("welfare_wecom", {}, "regional"),
    ).rejects.toThrow("接入配置");
    await expect(
      generic.resetGroup("welfare_wecom", "regional"),
    ).rejects.toThrow("接入配置");
    const grouped = Object.create(
      SystemAdminService.prototype,
    ) as SystemAdminService;
    await expect(
      grouped.saveConfigGroup("other", { welfare_wecom: { enabled: false } }),
    ).rejects.toThrow("接入配置");
    for (const alias of ["WELFARE_WECOM", "welfare_wecom "]) {
      await expect(
        generic.updateConfigs(
          [{ key: alias, value: { enabled: false } }],
          "regional",
        ),
      ).rejects.toThrow("接入配置");
      await expect(generic.resetGroup(alias, "regional")).rejects.toThrow(
        "接入配置",
      );
      await expect(
        grouped.saveConfigGroup("other", { [alias]: { enabled: false } }),
      ).rejects.toThrow("接入配置");
    }
    await expect(
      generic.resetGroup({ not: null } as any, "regional"),
    ).rejects.toThrow("格式错误");
    expect(db.config.upsert).not.toHaveBeenCalled();
    expect(db.config.deleteMany).not.toHaveBeenCalled();
  });
});
