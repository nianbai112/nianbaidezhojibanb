import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import axios from "axios";
import { PrismaService } from "../../common/services/prisma.service";
import { RedisService } from "../../common/services/redis.service";
import { AdminDataScopeService } from "../../common/services/admin-data-scope.service";
import {
  memberUserSelect,
  memberView,
  reconcileWecomMembers,
} from "./welfare-wecom.members";

export const WECOM_CONFIG_KEY = "welfare_wecom";
export const WECOM_SNAPSHOT_TTL = 30000;
type WecomConfig = {
  enabled: boolean;
  corpId: string;
  appSecret: string;
  unionScope: string;
  callbackToken: string;
  encodingAESKey: string;
};
export type WecomSnapshot = {
  id: string;
  dirtyVersion: number;
  snapshotVersion: number;
  memberVersion: string | null;
  syncedAt: Date;
  configFingerprint: string;
  memberHashes: string[];
};
export type WecomDrawProof = {
  groupIds: string[];
  fingerprint: string;
  checkedAt: Date;
  snapshots: WecomSnapshot[];
  eligible: Set<string>;
};

export function wecomIdentityHash(
  corpId: string,
  scope: string,
  unionid: string,
) {
  return createHash("sha256")
    .update(JSON.stringify([corpId, scope, unionid]))
    .digest("hex");
}
export function normalizeWecomConfig(
  input: any,
  previous: any = {},
): WecomConfig {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new BadRequestException("请填写企业微信配置");
  if (input.enabled !== undefined && typeof input.enabled !== "boolean")
    throw new BadRequestException("启用状态格式错误");
  const value: any = { enabled: input.enabled === true };
  for (const key of [
    "corpId",
    "appSecret",
    "unionScope",
    "callbackToken",
    "encodingAESKey",
  ]) {
    if (input[key] !== undefined && typeof input[key] !== "string")
      throw new BadRequestException("企业微信配置格式错误");
    const incoming = input[key] === undefined ? previous[key] : input[key];
    value[key] =
      incoming === "******"
        ? String(previous[key] || "")
        : String(incoming || "").trim();
    if (value[key].length > 256 || /[\r\n]/.test(value[key]))
      throw new BadRequestException("企业微信配置长度或格式错误");
  }
  if (value.encodingAESKey && !/^[A-Za-z0-9+/]{43}$/.test(value.encodingAESKey))
    throw new BadRequestException("EncodingAESKey 应为43位");
  if (value.enabled && (!value.corpId || !value.appSecret || !value.unionScope))
    throw new BadRequestException(
      "启用前请填写企业ID、应用Secret及微信开放平台账号标识",
    );
  if (!!value.callbackToken !== !!value.encodingAESKey)
    throw new BadRequestException("回调Token和EncodingAESKey需一起填写");
  return value;
}

@Injectable()
export class WelfareWecomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly scope: AdminDataScopeService,
  ) {}

  private unavailable(message = "企业微信群成员核验暂不可用，请稍后重试") {
    return new ServiceUnavailableException({
      code: "WELFARE_WECOM_UNAVAILABLE",
      message,
    });
  }
  private failApiRequest(errorCode: unknown, authorizing = false): never {
    const code = Number(errorCode) || "响应异常";
    if (code === 60020)
      throw this.unavailable(
        "服务器尚未加入企业微信可信IP（60020）。请在当前自建应用的“企业可信IP”中添加服务器公网IP，保存1分钟后重新读取。",
      );
    if (code === 48002)
      throw this.unavailable(
        "应用尚无客户群读取权限（48002）。请在客户联系的“可调用接口的应用”中勾选当前自建应用，并确认应用可见范围包含群主。",
      );
    throw this.unavailable(
      authorizing
        ? `企业微信应用授权失败（${code}），请管理员检查应用权限`
        : `企业微信群接口返回错误（${code}），请管理员检查客户联系权限`,
    );
  }
  async config(): Promise<WecomConfig> {
    const row = await this.prisma.config.findUnique({
      where: { key: WECOM_CONFIG_KEY },
    });
    return normalizeWecomConfig(row?.value || {});
  }
  private fingerprint(config: WecomConfig) {
    return createHash("sha256")
      .update(
        JSON.stringify([config.corpId, config.unionScope, config.appSecret]),
      )
      .digest("hex");
  }
  private async ready() {
    const config = await this.config();
    if (
      !config.enabled ||
      !config.corpId ||
      !config.appSecret ||
      !config.unionScope
    )
      throw this.unavailable("企业微信尚未启用，请联系活动管理员完成配置");
    const existingScope = String(
      process.env.WX_OPEN_PLATFORM_ACCOUNT_ID || "",
    ).trim();
    if (existingScope && config.unionScope !== existingScope)
      throw this.unavailable(
        "企业微信与小程序的微信开放平台账号配置不一致，请联系管理员",
      );
    return config;
  }
  private async superAdmin(accountId: string) {
    if (!(await this.scope.getAdminContext(accountId)).isSuperAdmin)
      throw new ForbiddenException("仅超级管理员可配置企业微信及导入客户群");
  }
  private async access(accountId: string, regionId: string | null) {
    const ctx = await this.scope.getAdminContext(accountId);
    if (!ctx.isSuperAdmin && (!regionId || !ctx.regionIds.includes(regionId)))
      throw new ForbiddenException("无权管理该校区企业微信群");
  }
  async adminConfig(accountId: string) {
    await this.superAdmin(accountId);
    const config = await this.config();
    return {
      ...config,
      appSecret: config.appSecret ? "******" : "",
      callbackToken: config.callbackToken ? "******" : "",
      encodingAESKey: config.encodingAESKey ? "******" : "",
    };
  }
  async saveConfig(accountId: string, input: any) {
    await this.superAdmin(accountId);
    const value = normalizeWecomConfig(input, await this.config());
    const scope = String(process.env.WX_OPEN_PLATFORM_ACCOUNT_ID || "").trim();
    if (value.enabled && scope && value.unionScope !== scope)
      throw new BadRequestException(
        "微信开放平台账号标识须与服务端 WX_OPEN_PLATFORM_ACCOUNT_ID 一致",
      );
    await this.prisma.$transaction(async (db) => {
      await db.config.upsert({
        where: { key: WECOM_CONFIG_KEY },
        create: {
          key: WECOM_CONFIG_KEY,
          value,
          group: WECOM_CONFIG_KEY,
          createdBy: accountId,
        },
        update: { value, updatedBy: accountId },
      });
      await db.adminOperationLog.create({
        data: {
          accountId,
          module: "welfare",
          action: "WELFARE_WECOM_CONFIG",
          targetId: WECOM_CONFIG_KEY,
          targetType: "config",
          detail: {
            enabled: value.enabled,
            corpId: value.corpId,
            identityConfigured: !!value.unionScope,
            secretConfigured: !!value.appSecret,
            callbackConfigured: !!value.callbackToken,
          },
        },
      });
    });
    return this.adminConfig(accountId);
  }
  private async token(config: WecomConfig, refresh = false) {
    const key = `welfare:wecom:token:${this.fingerprint(config)}`;
    if (!refresh) {
      const cached = await this.redis.get(key);
      if (cached) return cached;
    }
    let data: any;
    try {
      ({ data } = await axios.get(
        "https://qyapi.weixin.qq.com/cgi-bin/gettoken",
        {
          params: { corpid: config.corpId, corpsecret: config.appSecret },
          timeout: 8000,
        },
      ));
    } catch {
      throw this.unavailable("企业微信连接失败，请稍后重试");
    }
    if (data?.errcode || typeof data?.access_token !== "string")
      this.failApiRequest(data?.errcode, true);
    await this.redis.set(
      key,
      data.access_token,
      Math.max(30, Math.min(7000, Number(data.expires_in) - 120 || 6000)),
    );
    return data.access_token;
  }
  private async api(config: WecomConfig, path: string, body: any) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.token(config, attempt > 0);
      let data: any;
      try {
        ({ data } = await axios.post(
          `https://qyapi.weixin.qq.com/cgi-bin/${path}`,
          body,
          { params: { access_token: token }, timeout: 8000 },
        ));
      } catch {
        throw this.unavailable("企业微信群成员查询失败，请稍后重试");
      }
      if ([40014, 42001].includes(data?.errcode) && attempt === 0) continue;
      if (data?.errcode !== 0) this.failApiRequest(data?.errcode);
      return data;
    }
    throw this.unavailable();
  }
  private async detail(config: WecomConfig, chatId: string, needName = false) {
    const data = await this.api(config, "externalcontact/groupchat/get", {
      chat_id: chatId,
      need_name: needName ? 1 : 0,
    });
    const group = data.group_chat;
    if (
      !group ||
      group.chat_id !== chatId ||
      !Array.isArray(group.member_list) ||
      group.member_list.length > 10000
    )
      throw this.unavailable("企业微信群详情不完整，暂不能确认成员资格");
    return group;
  }
  async discover(accountId: string, cursor?: string) {
    await this.superAdmin(accountId);
    if (cursor && (typeof cursor !== "string" || cursor.length > 2048))
      throw new BadRequestException("分页参数无效");
    const config = await this.ready();
    const data = await this.api(config, "externalcontact/groupchat/list", {
      cursor: cursor || "",
      limit: 20,
    });
    if (!Array.isArray(data.group_chat_list))
      throw this.unavailable("企业微信未返回客户群列表");
    const unique = new Map<string, any>();
    for (const group of data.group_chat_list) {
      if (
        !group ||
        typeof group.chat_id !== "string" ||
        !group.chat_id.trim() ||
        group.chat_id.length > 191
      )
        throw this.unavailable("企业微信返回的群编号不完整，请重新读取");
      unique.set(group.chat_id, group);
    }
    const groups = [...unique.values()];
    const list: any[] = [];
    // Read display metadata without importing groups or exposing member identities.
    // Bound concurrency so a large enterprise does not burst the WeCom API.
    for (let offset = 0; offset < groups.length; offset += 4) {
      const batch = await Promise.all(
        groups.slice(offset, offset + 4).map(async (group) => {
          const candidate = { chatId: group.chat_id, status: group.status };
          try {
            const detail = await this.detail(config, group.chat_id);
            return {
              ...candidate,
              name:
                typeof detail.name === "string" && detail.name.trim()
                  ? detail.name
                  : "未命名客户群",
              memberCount: detail.member_list.length,
              error: null,
            };
          } catch (error) {
            return {
              ...candidate,
              name: "群信息暂不可用",
              memberCount: null,
              error:
                error instanceof ServiceUnavailableException
                  ? error.message
                  : "群信息读取失败，请重新读取客户群列表",
            };
          }
        }),
      );
      list.push(...batch);
    }
    return { list, cursor: data.next_cursor || "" };
  }
  private publicGroup(group: any) {
    return {
      id: group.id,
      name: group.name,
      chatId: group.chatId,
      owner: group.owner,
      regionId: group.regionId,
      memberCount: group.memberCount,
      identifiableCount: group.identifiableCount,
      isDismissed: group.isDismissed,
      syncedAt: group.syncedAt,
      rosterSyncedAt: group.rosterSyncedAt,
      needsSync: group.dirtyVersion !== group.snapshotVersion,
      syncError: group.syncError,
    };
  }
  async groups(accountId: string) {
    const ctx = await this.scope.getAdminContext(accountId);
    const config = await this.config();
    const rows = await this.prisma.welfareWecomGroup.findMany({
      where: {
        corpId: config.corpId,
        ...(!ctx.isSuperAdmin ? { regionId: { in: ctx.regionIds } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    return {
      configured: config.enabled && !!config.appSecret && !!config.unionScope,
      list: rows.map((row) => this.publicGroup(row)),
    };
  }
  async members(accountId: string, id: string, query: any = {}) {
    const group = await this.prisma.welfareWecomGroup.findUnique({
      where: { id },
    });
    if (!group) throw new BadRequestException("官方群不存在");
    await this.access(accountId, group.regionId);
    const config = await this.config();
    if (group.corpId !== config.corpId)
      throw new ForbiddenException("无权查看其他企业的客户群");
    const choices: Record<string, string[]> = {
      presence: ["current", "all", "left"],
      participation: ["all", "registered", "unregistered", "unknown"],
      studentStatus: [
        "all",
        "approved",
        "none",
        "pending",
        "rejected",
        "revoked",
        "unknown",
      ],
      memberType: ["customers", "all", "staff"],
    };
    const filters: any = {
      presence: "current",
      participation: "all",
      studentStatus: "all",
      memberType: "customers",
    };
    for (const [key, values] of Object.entries(choices)) {
      if (query[key] !== undefined && !values.includes(query[key]))
        throw new BadRequestException("成员筛选参数无效");
      filters[key] = query[key] || filters[key];
    }
    if (
      query.search !== undefined &&
      (typeof query.search !== "string" || query.search.length > 60)
    )
      throw new BadRequestException("搜索关键词最多60字");
    if (
      query.campaignId !== undefined &&
      (typeof query.campaignId !== "string" || query.campaignId.length > 191)
    )
      throw new BadRequestException("活动参数无效");
    const page = Number(query.page ?? 1),
      pageSize = Number(query.pageSize ?? 25);
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 100000 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    )
      throw new BadRequestException("分页参数无效");
    const ctx = await this.scope.getAdminContext(accountId);
    const campaigns = (
      await this.prisma.welfareCampaign.findMany({
        where: {
          mode: "scheduled",
          ...(ctx.isSuperAdmin
            ? { OR: [{ regionId: group.regionId }, { regionId: null }] }
            : { regionId: group.regionId }),
        },
        select: {
          id: true,
          title: true,
          status: true,
          groupIds: true,
          requireGroup: true,
          groupVerificationMode: true,
        },
        orderBy: { createdAt: "desc" },
      })
    ).filter(
      (c) =>
        c.requireGroup &&
        c.groupVerificationMode === "wecom_member" &&
        Array.isArray(c.groupIds) &&
        c.groupIds.includes(id),
    );
    const campaignId = query.campaignId || "";
    if (campaignId && !campaigns.some((c) => c.id === campaignId))
      throw new ForbiddenException("该活动未使用本群，或不在你的管理范围内");
    if (!campaignId && filters.participation !== "all")
      throw new BadRequestException("请先选择活动，再筛选报名情况");
    const roster = await this.prisma.welfareWecomMember.findMany({
      where: { groupId: id },
      orderBy: [{ firstSeenAt: "asc" }, { id: "asc" }],
    });
    const userIds = [
      ...new Set(
        roster
          .filter(
            (m) => m.linkedUserId && m.identityScope === config.unionScope,
          )
          .map((m) => m.linkedUserId!),
      ),
    ];
    const users: any[] = [],
      entries: any[] = [];
    for (let offset = 0; offset < userIds.length; offset += 500) {
      const ids = userIds.slice(offset, offset + 500);
      users.push(
        ...(await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: memberUserSelect(config.unionScope),
        })),
      );
      if (campaignId)
        entries.push(
          ...(await this.prisma.welfareEntry.findMany({
            where: { campaignId, userId: { in: ids } },
            select: {
              userId: true,
              outcome: true,
              exclusionReason: true,
              createdAt: true,
            },
          })),
        );
    }
    const userMap = new Map(users.map((user) => [user.id, user])),
      entryMap = new Map(entries.map((entry) => [entry.userId, entry]));
    const rows = roster.map((member) =>
      memberView(
        member,
        userMap.get(member.linkedUserId),
        entryMap.get(member.linkedUserId),
        config,
        !!campaignId,
      ),
    );
    const current = rows.filter(
      (row) => row.presence === "current" && row.memberType === 2,
    );
    const summary = {
      currentCustomers: current.length,
      linked: current.filter((row) => row.identityStatus === "linked").length,
      unknown: current.filter((row) => row.identityStatus !== "linked").length,
      registered: campaignId
        ? current.filter((row) => row.participation === "registered").length
        : null,
      unregistered: campaignId
        ? current.filter((row) => row.participation === "unregistered").length
        : null,
      studentApproved: current.filter((row) => row.studentStatus === "approved")
        .length,
      historicalCustomers: rows.filter(
        (row) => row.presence === "left" && row.memberType === 2,
      ).length,
    };
    const keyword = String(query.search || "")
      .trim()
      .toLocaleLowerCase();
    const filtered = rows.filter(
      (row) =>
        (filters.presence === "all" || row.presence === filters.presence) &&
        (filters.memberType === "all" ||
          row.memberType === (filters.memberType === "staff" ? 1 : 2)) &&
        (filters.participation === "all" ||
          row.participation === filters.participation) &&
        (filters.studentStatus === "all" ||
          row.studentStatus === filters.studentStatus) &&
        (!keyword ||
          [row.nickname, row.platformNickname, row.uid].some((value) =>
            String(value ?? "")
              .toLocaleLowerCase()
              .includes(keyword),
          )),
    );
    return {
      group: this.publicGroup(group),
      campaigns: campaigns.map(({ id, title, status }) => ({
        id,
        title,
        status,
      })),
      campaignId: campaignId || null,
      summary,
      total: filtered.length,
      page,
      pageSize,
      list: filtered.slice((page - 1) * pageSize, page * pageSize),
    };
  }
  async importGroups(accountId: string, input: any) {
    await this.superAdmin(accountId);
    const ids = input?.chatIds;
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 20 ||
      ids.some((id) => typeof id !== "string" || !id.trim() || id.length > 191)
    )
      throw new BadRequestException("每次请选择1至20个有效客户群");
    const regionId = input.regionId ? String(input.regionId) : null;
    if (
      regionId &&
      !(await this.prisma.region.findUnique({
        where: { id: regionId },
        select: { id: true },
      }))
    )
      throw new BadRequestException("校区不存在");
    const config = await this.ready();
    // Validate all selected groups with the official API before registering any.
    const details: any[] = [];
    for (const chatId of [...new Set<string>(ids)])
      details.push(await this.detail(config, chatId));
    const imported = await this.prisma.$transaction(async (db) => {
      const rows: any[] = [];
      for (const group of details) {
        const id =
          "wg_" +
          createHash("sha256")
            .update(JSON.stringify([config.corpId, group.chat_id]))
            .digest("hex")
            .slice(0, 40);
        const previous = await db.welfareWecomGroup.findUnique({
          where: { id },
        });
        if (previous && previous.regionId !== regionId)
          throw new BadRequestException("该群已归属其他校区，请保持原归属");
        rows.push(
          await db.welfareWecomGroup.upsert({
            where: { id },
            create: {
              id,
              corpId: config.corpId,
              chatId: group.chat_id,
              name: String(group.name || "企业微信客户群"),
              owner: String(group.owner || ""),
              regionId,
              createdBy: accountId,
            },
            update: {
              name: String(group.name || "企业微信客户群"),
              owner: String(group.owner || ""),
              dirtyVersion: { increment: 1 },
            },
          }),
        );
      }
      await db.adminOperationLog.create({
        data: {
          accountId,
          module: "welfare",
          action: "WELFARE_WECOM_GROUP_IMPORT",
          targetId: config.corpId,
          targetType: "wecom_group",
          detail: { regionId, groupIds: rows.map((row) => row.id) },
        },
      });
      return rows;
    });
    for (const group of imported) {
      try {
        await this.snapshot(group.id, config, true);
      } catch {
        /* Registered groups remain visible with syncError, ready for retry. */
      }
    }
    return this.groups(accountId);
  }
  private async snapshot(
    id: string,
    config: WecomConfig,
    force = false,
  ): Promise<WecomSnapshot> {
    const fingerprint = this.fingerprint(config);
    const fresh = (row: any) =>
      !force &&
      row?.configFingerprint === fingerprint &&
      row.syncedAt &&
      Date.now() - row.syncedAt.getTime() < WECOM_SNAPSHOT_TTL &&
      row.dirtyVersion === row.snapshotVersion &&
      Array.isArray(row.memberHashes);
    const row = await this.prisma.welfareWecomGroup.findUnique({
      where: { id },
    });
    if (!row || row.corpId !== config.corpId)
      throw this.unavailable(
        "活动官方群与当前企业微信配置不一致，请联系管理员",
      );
    if (fresh(row)) return row as WecomSnapshot;
    const result = await this.redis.withLock(
      `welfare:wecom:sync:${id}`,
      30,
      async () => {
        const current = await this.prisma.welfareWecomGroup.findUniqueOrThrow({
          where: { id },
        });
        if (fresh(current)) return current as WecomSnapshot;
        try {
          // A verified dismiss event is authoritative. The deleted chat can no
          // longer be queried, so keep an empty snapshot without API retries.
          const remote = current.isDismissed
            ? { member_list: [], member_version: "dismissed" }
            : await this.detail(config, current.chatId, true);
          await reconcileWecomMembers(
            this.prisma,
            current,
            config,
            remote.member_list,
            new Date(),
          );
          const hashes = [
            ...new Set<string>(
              remote.member_list
                .filter(
                  (member: any) =>
                    typeof member.unionid === "string" &&
                    member.unionid.length > 0 &&
                    member.unionid.length <= 191,
                )
                .map((member: any) =>
                  wecomIdentityHash(
                    config.corpId,
                    config.unionScope,
                    member.unionid,
                  ),
                ),
            ),
          ];
          if (
            !hashes.length &&
            remote.member_list.some((member: any) => member.type === 2)
          )
            throw this.unavailable(
              "客户群未返回可识别的微信身份，请管理员检查微信开放平台绑定与客户联系权限",
            );
          const syncedAt = new Date();
          const updated = await this.prisma.welfareWecomGroup.updateMany({
            where: { id, dirtyVersion: current.dirtyVersion },
            data: {
              name: String(remote.name || current.name),
              owner: String(remote.owner || current.owner),
              memberCount: remote.member_list.length,
              identifiableCount: hashes.length,
              memberHashes: hashes,
              memberVersion: String(remote.member_version || ""),
              configFingerprint: fingerprint,
              snapshotVersion: current.dirtyVersion,
              syncedAt,
              syncError: null,
            },
          });
          if (!updated.count)
            throw this.unavailable("群成员正在变化，请稍后重新核验");
          return {
            id,
            dirtyVersion: current.dirtyVersion,
            snapshotVersion: current.dirtyVersion,
            memberVersion: String(remote.member_version || ""),
            syncedAt,
            configFingerprint: fingerprint,
            memberHashes: hashes,
          };
        } catch (error) {
          await this.prisma.welfareWecomGroup.updateMany({
            where: { id },
            data: {
              syncError: "成员同步失败，请检查企业微信配置和客户群权限后重试",
            },
          });
          throw error;
        }
      },
    );
    if (!result) throw this.unavailable("群成员正在同步，请稍后重新核验");
    return result;
  }
  async sync(accountId: string, id: string) {
    const group = await this.prisma.welfareWecomGroup.findUnique({
      where: { id },
    });
    if (!group) throw new BadRequestException("官方群不存在");
    await this.access(accountId, group.regionId);
    await this.snapshot(id, await this.ready(), true);
    return this.publicGroup(
      await this.prisma.welfareWecomGroup.findUniqueOrThrow({ where: { id } }),
    );
  }
  async validateGroups(
    campaign: { regionId?: string | null; groupIds?: any },
    db: any = this.prisma,
  ) {
    const config = await this.ready();
    const ids = campaign.groupIds;
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 100 ||
      ids.some((id) => typeof id !== "string")
    )
      throw new BadRequestException("请选择本活动的企业微信官方群");
    const groups = await db.welfareWecomGroup.findMany({
      where: { id: { in: ids }, corpId: config.corpId },
    });
    if (
      groups.length !== new Set(ids).size ||
      groups.some(
        (group: any) => group.regionId && group.regionId !== campaign.regionId,
      )
    )
      throw new BadRequestException(
        "官方群不存在、属于其他企业或与活动校区不匹配",
      );
  }
  private async identities(userIds: string[], config: WecomConfig) {
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, unionid: true },
    });
    const identities = await this.prisma.userAuthIdentity.findMany({
      where: {
        userId: { in: userIds },
        provider: "wechat-union",
        appId: config.unionScope,
      },
      select: { userId: true, subject: true },
    });
    const map = new Map(
      users
        .filter((user) => user.unionid)
        .map((user) => [user.id, user.unionid!]),
    );
    for (const identity of identities) {
      if (
        map.has(identity.userId) &&
        map.get(identity.userId) !== identity.subject
      )
        throw this.unavailable("微信身份记录不一致，请联系管理员");
      map.set(identity.userId, identity.subject);
    }
    return map;
  }
  async checkMember(campaign: any, userId: string) {
    const config = await this.ready();
    await this.validateGroups(campaign);
    const unionid = (await this.identities([userId], config)).get(userId);
    if (!unionid)
      throw new ForbiddenException({
        code: "WELFARE_WECOM_IDENTITY_REQUIRED",
        message:
          "暂未取得你的微信身份，请重新核验；仍无法核验时请联系管理员检查微信开放平台绑定",
      });
    const hash = wecomIdentityHash(config.corpId, config.unionScope, unionid);
    let unavailable: any;
    for (const id of campaign.groupIds as string[]) {
      try {
        const snapshot = await this.snapshot(id, config);
        if (snapshot.memberHashes.includes(hash))
          return {
            verified: true,
            groupId: id,
            checkedAt: new Date(),
            snapshot,
            fingerprint: this.fingerprint(config),
          };
      } catch (error) {
        unavailable = error;
      }
    }
    if (unavailable) throw unavailable;
    throw new ForbiddenException({
      code: "WELFARE_WECOM_NOT_MEMBER",
      message: "尚未在本活动指定的官方群中找到你，请入群后返回重新核验",
    });
  }
  async sharedGroupSource(campaign: any, opengid: string) {
    const config = await this.ready();
    if (typeof opengid !== "string" || !opengid || opengid.length > 256)
      throw new BadRequestException("群来源无效");
    if (Array.isArray(campaign.groupIds) && campaign.groupIds.length)
      await this.validateGroups(campaign);
    const data = await this.api(config, "externalcontact/opengid_to_chatid", {
      opengid,
    });
    if (
      typeof data.chat_id !== "string" ||
      !data.chat_id ||
      data.chat_id.length > 191
    )
      throw this.unavailable("企业微信群来源暂无法确认");
    const id =
      "wg_" +
      createHash("sha256")
        .update(JSON.stringify([config.corpId, data.chat_id]))
        .digest("hex")
        .slice(0, 40);
    return Array.isArray(campaign.groupIds) && campaign.groupIds.includes(id)
      ? "official"
      : "other_group";
  }
  async prepareDraw(campaign: any): Promise<WecomDrawProof> {
    const config = await this.ready();
    await this.validateGroups(campaign);
    const snapshots: WecomSnapshot[] = [];
    // At draw, require fresh authoritative data for every accepted group. A
    // timeout leaves the draw pending; it never means that everyone left.
    const groupIds = campaign.groupIds as string[];
    for (let start = 0; start < groupIds.length; start += 4) {
      const batch = await Promise.all(
        groupIds
          .slice(start, start + 4)
          .map((id) => this.snapshot(id, config, true)),
      );
      snapshots.push(...batch);
    }
    const entries = await this.prisma.welfareEntry.findMany({
      where: { campaignId: campaign.id, outcome: "waiting" },
      select: { userId: true },
    });
    const ids = entries.map((entry) => entry.userId);
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: ids },
        status: "ACTIVE",
        deletedAt: null,
        userType: 1,
        systemRole: null,
      },
      select: { id: true },
    });
    const identity = await this.identities(
      users.map((user) => user.id),
      config,
    );
    if (users.some((user) => !identity.has(user.id)))
      throw this.unavailable(
        "部分报名用户的微信身份暂无法核验，开奖将自动重试",
      );
    const memberHashes = new Set(
      snapshots.flatMap((snapshot) => snapshot.memberHashes),
    );
    const eligible = new Set(
      users
        .filter((user) =>
          memberHashes.has(
            wecomIdentityHash(
              config.corpId,
              config.unionScope,
              identity.get(user.id)!,
            ),
          ),
        )
        .map((user) => user.id),
    );
    return {
      groupIds: [...campaign.groupIds],
      fingerprint: this.fingerprint(config),
      checkedAt: new Date(),
      snapshots,
      eligible,
    };
  }
  async assertProofCurrent(
    db: any,
    proof: {
      fingerprint: string;
      snapshot?: WecomSnapshot;
      snapshots?: WecomSnapshot[];
    },
  ) {
    if (this.fingerprint(await this.ready()) !== proof.fingerprint)
      throw this.unavailable("企业微信配置已变化，请重新核验");
    for (const snapshot of proof.snapshots ||
      (proof.snapshot ? [proof.snapshot] : [])) {
      const current = await db.welfareWecomGroup.findUnique({
        where: { id: snapshot.id },
      });
      if (
        !current ||
        current.dirtyVersion !== snapshot.dirtyVersion ||
        current.snapshotVersion !== snapshot.snapshotVersion ||
        current.memberVersion !== snapshot.memberVersion ||
        current.syncedAt?.getTime() !== snapshot.syncedAt.getTime() ||
        current.configFingerprint !== proof.fingerprint ||
        Date.now() - snapshot.syncedAt.getTime() > 120000
      )
        throw this.unavailable("群成员状态已更新，请重新核验");
    }
  }
  async invalidate(corpId: string, chatId: string, changeType?: string) {
    // Full reconciliation avoids applying incomplete/duplicate/out-of-order
    // member deltas. Unknown groups are never silently registered as official.
    await this.prisma.welfareWecomGroup.updateMany({
      where: { corpId, chatId },
      data: {
        dirtyVersion: { increment: 1 },
        syncedAt: null,
        ...(changeType === "dismiss"
          ? {
              isDismissed: true,
              memberHashes: [],
              memberCount: 0,
              identifiableCount: 0,
            }
          : {}),
      },
    });
  }
  async sweep() {
    const config = await this.config();
    if (!config.enabled) return;
    const rows = await this.prisma.welfareWecomGroup.findMany({
      where: {
        corpId: config.corpId,
        OR: [
          { syncedAt: null },
          { syncedAt: { lt: new Date(Date.now() - 300000) } },
        ],
      },
      orderBy: { updatedAt: "asc" },
      take: 10,
    });
    for (const row of rows) {
      try {
        await this.snapshot(row.id, await this.ready(), true);
      } catch {
        /* Individual sync errors are persisted; the next sweep retries. */
      }
    }
  }
}
