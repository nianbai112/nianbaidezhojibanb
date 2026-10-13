import { createHash } from "node:crypto";
import { ServiceUnavailableException } from "@nestjs/common";
import { effectiveStudentIdentity } from "../student-identity/student-identity.policy";

export const memberHash = (...parts: unknown[]) =>
  createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const unavailable = (message: string) =>
  new ServiceUnavailableException({
    code: "WELFARE_WECOM_UNAVAILABLE",
    message,
  });

export const memberUserSelect = (scope: string) =>
  ({
    id: true,
    uid: true,
    nickname: true,
    unionid: true,
    status: true,
    deletedAt: true,
    userType: true,
    systemRole: true,
    authIdentities: {
      where: { provider: "wechat-union", appId: scope },
      select: { subject: true },
    },
    studentVerify: {
      select: {
        status: true,
        schoolId: true,
        proofMethod: true,
        rosterStudentId: true,
        school: {
          select: { id: true, name: true, regionId: true, isEnabled: true },
        },
        rosterStudent: {
          select: {
            id: true,
            schoolId: true,
            enrollmentStatus: true,
            boundUserId: true,
          },
        },
      },
    },
  }) as const;

export function consistentUnion(user: any): string | null {
  const values = new Set<string>([
    ...(user.unionid ? [user.unionid] : []),
    ...(user.authIdentities || [])
      .map((identity: any) => identity.subject)
      .filter(Boolean),
  ]);
  return values.size === 1 ? [...values][0] : null;
}

// Keep raw WeCom member IDs and UnionIDs in memory only. The directory stores
// hashes and the resolved local account; a later sync resolves new accounts.
export async function reconcileWecomMembers(
  prisma: any,
  group: any,
  config: { corpId: string; unionScope: string },
  remoteMembers: any[],
  now: Date,
) {
  const unique = new Map<string, any>();
  for (const member of remoteMembers) {
    if (
      !member ||
      ![1, 2].includes(member.type) ||
      typeof member.userid !== "string" ||
      !member.userid.trim() ||
      member.userid.length > 191
    )
      throw unavailable("群成员信息不完整，请稍后重新同步");
    const memberKey = memberHash(config.corpId, member.type, member.userid);
    if (unique.has(memberKey))
      throw unavailable("群成员名单重复，请稍后重新同步");
    unique.set(memberKey, member);
  }
  const unions = [
    ...new Set<string>(
      remoteMembers
        .filter(
          (m) =>
            m.type === 2 &&
            typeof m.unionid === "string" &&
            m.unionid &&
            m.unionid.length <= 191,
        )
        .map((m) => m.unionid),
    ),
  ];
  const users = unions.length
    ? await prisma.user.findMany({
        where: {
          OR: [
            { unionid: { in: unions } },
            {
              authIdentities: {
                some: {
                  provider: "wechat-union",
                  appId: config.unionScope,
                  subject: { in: unions },
                },
              },
            },
          ],
        },
        select: {
          id: true,
          unionid: true,
          authIdentities: {
            where: { provider: "wechat-union", appId: config.unionScope },
            select: { subject: true },
          },
        },
      })
    : [];
  const matches = new Map<string, Set<string>>();
  const conflicting = new Set<string>();
  for (const user of users) {
    const union = consistentUnion(user);
    if (!union) {
      for (const value of [
        user.unionid,
        ...(user.authIdentities || []).map((i: any) => i.subject),
      ])
        if (value) conflicting.add(value);
      continue;
    }
    if (!matches.has(union)) matches.set(union, new Set());
    matches.get(union)!.add(user.id);
  }
  const records = [...unique].map(([memberKey, member]) => {
    const union =
      member.type === 2 && unions.includes(member.unionid)
        ? member.unionid
        : null;
    const candidates = union ? matches.get(union) : undefined;
    const ambiguous =
      union && (conflicting.has(union) || (candidates?.size || 0) > 1);
    const linkedUserId =
      !ambiguous && candidates?.size === 1 ? [...candidates][0] : null;
    const joinTime =
      typeof member.join_time === "number" &&
      Number.isFinite(member.join_time) &&
      member.join_time > 0 &&
      member.join_time * 1000 <= now.getTime()
        ? new Date(member.join_time * 1000)
        : null;
    return {
      id: "wgm_" + memberHash(group.id, memberKey).slice(0, 40),
      groupId: group.id,
      memberKey,
      identityHash: union
        ? memberHash(config.corpId, config.unionScope, union)
        : null,
      identityScope: union ? config.unionScope : null,
      linkedUserId,
      identityState:
        member.type === 1
          ? "staff"
          : ambiguous
            ? "ambiguous"
            : linkedUserId
              ? "linked"
              : union
                ? "unlinked"
                : "unavailable",
      nickname: Array.from(
        String(member.group_nickname || member.name || "未提供昵称").trim() ||
          "未提供昵称",
      )
        .slice(0, 191)
        .join(""),
      memberType: member.type,
      joinedAt: joinTime,
    };
  });
  await prisma.$transaction(
    async (db: any) => {
      const updated = await db.welfareWecomGroup.updateMany({
        where: { id: group.id, dirtyVersion: group.dirtyVersion },
        data: { rosterSyncedAt: now },
      });
      if (!updated.count) throw unavailable("群成员正在变化，请稍后重新同步");
      const old = await db.welfareWecomMember.findMany({
        where: { groupId: group.id },
      });
      const oldMap = new Map<string, any>(
        old.map((row: any) => [row.memberKey, row]),
      );
      const fresh = records.filter((row) => !oldMap.has(row.memberKey));
      if (fresh.length)
        await db.welfareWecomMember.createMany({
          data: fresh.map((row) => ({
            ...row,
            firstSeenAt: now,
            lastSeenAt: now,
          })),
        });
      const keys = records.map((row) => row.memberKey);
      await db.welfareWecomMember.updateMany({
        where: {
          groupId: group.id,
          ...(keys.length
            ? { memberKey: { in: keys } }
            : { id: "__no_member__" }),
        },
        data: { lastSeenAt: now, leftAt: null },
      });
      for (const row of records) {
        const previous = oldMap.get(row.memberKey);
        if (
          previous &&
          Object.entries(row).some(([key, value]) =>
            value instanceof Date
              ? previous[key]?.getTime() !== value.getTime()
              : previous[key] !== value,
          )
        )
          await db.welfareWecomMember.update({
            where: { id: row.id },
            data: row,
          });
      }
      await db.welfareWecomMember.updateMany({
        where: {
          groupId: group.id,
          leftAt: null,
          ...(keys.length ? { memberKey: { notIn: keys } } : {}),
        },
        data: { leftAt: now },
      });
    },
    { timeout: 30000 },
  );
}

export function memberView(
  member: any,
  user: any,
  entry: any,
  config: { corpId: string; unionScope: string },
  campaignSelected: boolean,
) {
  const union = user && consistentUnion(user);
  const linked =
    member.memberType === 2 &&
    member.identityState === "linked" &&
    member.identityScope === config.unionScope &&
    user &&
    union &&
    memberHash(config.corpId, config.unionScope, union) ===
      member.identityHash &&
    user.status === "ACTIVE" &&
    !user.deletedAt &&
    user.userType !== 4 &&
    !user.systemRole;
  const identityStatus =
    member.memberType === 1
      ? "staff"
      : linked
        ? "linked"
        : member.identityState === "ambiguous"
          ? "ambiguous"
          : "unlinked";
  const verification = linked ? user.studentVerify : null;
  const studentStatus = !linked
    ? "unknown"
    : !verification
      ? "none"
      : effectiveStudentIdentity(verification, user.id)
        ? "approved"
        : verification.status === "APPROVED"
          ? "revoked"
          : String(verification.status).toLowerCase();
  return {
    id: member.id,
    nickname: member.nickname,
    memberType: member.memberType,
    presence: member.leftAt ? "left" : "current",
    joinedAt: member.joinedAt,
    firstSeenAt: member.firstSeenAt,
    lastSeenAt: member.lastSeenAt,
    leftAt: member.leftAt,
    identityStatus,
    platformNickname: linked ? user.nickname : null,
    uid: linked ? user.uid : null,
    participation: !campaignSelected
      ? "not_selected"
      : !linked
        ? "unknown"
        : entry
          ? "registered"
          : "unregistered",
    registeredAt: linked && entry ? entry.createdAt : null,
    outcome: linked && entry ? entry.outcome : null,
    exclusionReason:
      linked && entry
        ? entry.exclusionReason === "left_official_group"
          ? "开奖前已不在指定官方群"
          : entry.exclusionReason === "account_unavailable"
            ? "开奖时账号不可用"
            : entry.exclusionReason === "post_requirement_unmet"
              ? "开奖前没有审核通过且仍可见的合格帖子"
            : null
        : null,
    studentStatus,
    schoolName: verification?.school?.name || null,
  };
}
