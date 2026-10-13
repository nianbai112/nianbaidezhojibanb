import { WelfareWechatService } from "./welfare-wechat.service";
import { WelfareWecomService } from "./welfare-wecom.service";
import { checkinSessionSelect } from "./welfare-checkin.service";
import {
  effectiveStudentIdentity,
  identityInclude,
} from "../student-identity/student-identity.policy";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Prisma, WelfareCampaign } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { PrismaService } from "../../common/services/prisma.service";
import { AdminDataScopeService } from "../../common/services/admin-data-scope.service";
import { UserAccessPolicyService } from "../../common/services/user-access-policy.service";
import { MembershipService } from "../membership/membership.service";
import { additionalEligibility, choose, maskNickname, validateCampaign } from "./welfare.policy";
import { postEligibility, qualifiedPostUsers } from "./welfare-post.policy";

const adminUserSelect = { id: true, uid: true, publicUid: true, nickname: true, avatar: true } as const;
type AdminUser = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>;
const adminUserView = (user: AdminUser | null | undefined) =>
  user ? { ...user, uid: user.publicUid ?? user.uid } : null;

const includeCampaign = {
  checkinSession: { select: checkinSessionSelect },
  prizes: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      verifiers: {
        select: {
          userId: true,
          user: { select: adminUserSelect },
        },
      },
      reservedUsers: {
        select: {
          userId: true,
          assignedBy: true,
          createdAt: true,
          user: { select: adminUserSelect },
        },
      },
    },
  },
};
const eligibleUser = {
  status: "ACTIVE" as const,
  deletedAt: null,
  userType: 1,
  systemRole: null,
};
type DB = Prisma.TransactionClient;

@Injectable()
export class WelfareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AdminDataScopeService,
    private readonly access: UserAccessPolicyService,
    private readonly membership: MembershipService,
    @Optional() private readonly wechat?: WelfareWechatService,
    @Optional() private readonly wecom?: WelfareWecomService,
  ) {}

  private paging(q: any) {
    const page = Math.max(1, Math.min(10000, Math.trunc(Number(q.page) || 1)));
    const size = Math.max(1, Math.min(50, Math.trunc(Number(q.size) || 20)));
    return { page, size, skip: (page - 1) * size };
  }
  private async adminEntrySearch(input: unknown): Promise<Prisma.WelfareEntryWhereInput> {
    const keyword = String(input ?? "").trim().slice(0, 100);
    if (!keyword) return {};
    const uidText = keyword.replace(/^uid\s*[:：]?\s*/i, "");
    const uid = Number(uidText);
    if (/^\d+$/.test(uidText) && Number.isSafeInteger(uid) && uid > 0 && uid <= 2147483647) {
      // Match the UID shown to the user, never a different account's internal sequence.
      // A UID search is exact so numeric nicknames cannot crowd it out of the first page.
      const users = await this.prisma.user.findMany({
        where: { OR: [{ publicUid: uid }, { publicUid: null, uid }] },
        select: { id: true },
        take: 2,
      });
      return { userId: { in: users.map(user => user.id) } };
    }
    return { OR: [{ nickname: { contains: keyword } }, { id: keyword }, { userId: keyword }] };
  }
  private async adminEntryUsers(entries: { userId: string }[]) {
    const users = entries.length ? await this.prisma.user.findMany({
      where: { id: { in: [...new Set(entries.map(entry => entry.userId))] } },
      select: adminUserSelect,
    }) : [];
    return new Map(users.map(user => [user.id, adminUserView(user)]));
  }
  private userId(user: any) {
    if (!user?.sub || user.isAdmin)
      throw new ForbiddenException("请使用小程序用户账号参与");
    return String(user.sub);
  }
  private async adminAccess(accountId: string, regionId: string | null) {
    if (!accountId) throw new ForbiddenException("请登录管理后台");
    const ctx = await this.scope.getAdminContext(accountId);
    if (!ctx.isSuperAdmin && (!regionId || !ctx.regionIds.includes(regionId)))
      throw new ForbiddenException("无权管理该校区活动");
  }
  private async campaign(id: string, db: DB = this.prisma) {
    const row = await db.welfareCampaign.findUnique({
      where: { id },
      include: includeCampaign,
    });
    if (!row) throw new NotFoundException("活动不存在");
    return row;
  }
  // All campaign mutations acquire this lock first. The DB unique constraints are
  // the final guard; Redis is not the authority for prizes or user eligibility.
  private async locked(id: string, db: DB) {
    const claimed = await db.welfareCampaign.updateMany({
      where: { id },
      data: { version: { increment: 1 } },
    });
    if (claimed.count !== 1) throw new NotFoundException("活动不存在");
    return this.campaign(id, db);
  }
  private async tx<T>(run: (db: DB) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(run, {
          isolationLevel: "ReadCommitted",
          maxWait: 10000,
          timeout: 60000,
        });
      } catch (error: any) {
        if (error.code !== "P2034" || attempt >= 2) throw error;
      }
    }
  }
  private async audit(
    db: DB,
    accountId: string,
    id: string,
    action: string,
    detail: any = {},
  ) {
    await db.adminOperationLog.create({
      data: {
        accountId,
        module: "welfare",
        action,
        targetId: id,
        targetType: "welfare_campaign",
        detail,
      },
    });
  }
  private publicView(c: any) {
    return {
      id: c.id,
      title: c.title,
      shareTitle: c.shareTitle,
      description: c.description,
      cover: c.cover,
      shareCover: c.shareCover,
      mode: c.mode,
      status: c.status,
      regionId: c.regionId,
      requireStudent: c.requireStudent,
      requireProfile: c.requireProfile === true,
      requirePost: c.requirePost === true,
      postRequiredSince: c.requirePost ? c.publishedAt : null,
      minRegistrationDays: c.minRegistrationDays || 0,
      checkinSessionId: c.checkinSessionId || null,
      checkinSession: c.checkinSession || null,
      requireOfficial: c.requireOfficial,
      memberOnly: c.memberOnly,
      startAt: c.startAt,
      endAt: c.endAt,
      drawAt: c.drawAt,
      claimUntil: c.claimUntil,
      drawnAt: c.drawnAt,
      entryCount: c.entryCount,
      maxEntries: c.maxEntries,
      minParticipants: c.minParticipants || 0,
      extendHours: c.extendHours,
      maxExtensions: c.maxExtensions || 0,
      extensionCount: c.extensionCount || 0,
      requireGroup: c.requireGroup,
      groupVerificationMode: c.groupVerificationMode || 'wechat_card',
      groupRecheckAtDraw: c.groupRecheckAtDraw === true,
      joinImage: c.joinImage,
      joinGuide: c.joinGuide,
      claimMethod: c.claimMethod,
      pickupLocation: c.pickupLocation,
      contact: c.prizes.some((p: any) => p.kind === "manual") ? null : c.contact,
      claimInstructions: c.claimInstructions,
      prizes: c.prizes.map((p: any) => ({
        id: p.id,
        name: p.name,
        image: p.image,
        kind: p.kind,
        quantity: p.quantity,
      })),
      serverTime: new Date(),
      automaticRules:
        "免费报名，每人一次，每人最多获得一个奖品。截止后从符合资格的报名用户中随机抽选；人数不足按实际人数发放。分享不增加次数，每人中奖概率相同。" +
        (c.requireProfile ? "报名时须完善头像与昵称，默认头像和系统默认昵称不计入。" : "") +
        (c.requirePost ? `活动发布后须在${c.regionId ? "本活动校区" : "校园社区"}发布至少一篇审核通过且仍可见的帖子，活动发布前的帖子不计入。开奖前再次核验，删除或下架后没有其他符合条件帖子的用户取消资格。` : "") +
        (c.minRegistrationDays > 0 ? `报名时须注册满 ${c.minRegistrationDays} 天，按每满 24 小时计一天。` : "") +
        (c.minParticipants > 0
          ? `满 ${c.minParticipants} 人开奖：到开奖时间不足 ${c.minParticipants} 人时，报名和开奖自动顺延 ${c.extendHours} 小时${c.maxExtensions > 0 ? `，最多顺延 ${c.maxExtensions} 次，仍不足则活动取消` : "，直到人数达到"}。`
          : "") +
        (c.checkinSessionId ? `报名之前须完成「${c.checkinSession?.title || "指定场次"}」线下签到；开启的签到方式完成任一种即可。` : "") +
        (c.requireGroup && c.groupVerificationMode === 'wecom_member' ? c.groupRecheckAtDraw ? '报名及开奖前核验时须仍在本活动任一指定官方群内；已退群且未加入其他指定群的用户取消资格。群成员核验暂不可用时将延后开奖并自动重试。' : '报名时须加入本活动任一指定的企业微信官方群，报名成功后保留资格。' : ''),
    };
  }
  async listPublic(q: any) {
    const { page, size, skip } = this.paging(q);
    const where: Prisma.WelfareCampaignWhereInput = {
      status: { in: ["published", "paused", "finished"] },
      OR: q.regionId
        ? [{ regionId: String(q.regionId) }, { regionId: null }]
        : [{ regionId: null }],
      mode: "scheduled",
    };
    const [list, total] = await Promise.all([
      this.prisma.welfareCampaign.findMany({
        where,
        include: includeCampaign,
        orderBy: { createdAt: "desc" },
        skip,
        take: size,
      }),
      this.prisma.welfareCampaign.count({ where }),
    ]);
    return { list: list.map((c) => this.publicView(c)), total, page, size };
  }
  async publicDetail(id: string) {
    const c = await this.campaign(id);
    if (c.status === "draft" || c.mode !== "scheduled")
      throw new NotFoundException("活动尚未发布或已停用");
    return this.publicView(c);
  }
  private ownView(entry: any) {
    const c = entry.campaign;
    return {
      id: entry.id,
      campaignId: entry.campaignId,
      title: c?.title,
      shareTitle: c?.shareTitle,
      mode: c?.mode,
      requestKey: entry.requestKey,
      campaignStatus: c?.status,
      outcome: entry.outcome,
      prize: entry.prize
        ? {
            name: entry.prize.name,
            image: entry.prize.image,
            kind: entry.prize.kind,
          }
        : null,
      claimStatus:
        ["physical", "manual"].includes(entry.prize?.kind) &&
        entry.claimStatus === "pending" &&
        c?.claimUntil <= new Date()
          ? "expired"
          : entry.claimStatus,
      claimCode:
        c?.claimMethod !== "shipping" &&
        c?.claimUntil > new Date() &&
        entry.claimStatus === "pending" &&
        ["physical", "manual"].includes(entry.prize?.kind)
          ? entry.claimCode
          : null,
      couponReceiveId: entry.couponReceiveId,
      deliveryError: entry.deliveryError
        ? "奖品发放处理中，系统将自动重试"
        : null,
      drawAt: c?.drawAt,
      claimUntil: c?.claimUntil,
      pickupLocation: c?.pickupLocation,
      contact: entry.outcome === "won" ? c?.contact : null,
      claimContactImage:
        entry.outcome === "won" ? c?.claimContactImage : null,
      claimInstructions:
        entry.outcome === "won" ? c?.claimInstructions : null,
      claimMethod: c?.claimMethod || "pickup",
      endAt: c?.endAt,
      recipientName: entry.recipientName,
      recipientPhone: entry.recipientPhone,
      recipientAddress: entry.recipientAddress,
      addressSubmittedAt: entry.addressSubmittedAt,
      shippingCarrier: entry.shippingCarrier,
      trackingNumber: entry.trackingNumber,
      shippedAt: entry.shippedAt,
      groupVerifiedAt: entry.groupVerifiedAt,
      groupRecheckAtDraw: c?.groupRecheckAtDraw === true,
      requirePost: c?.requirePost === true,
      groupCheckedAtDraw: entry.groupCheckedAtDraw,
      exclusionReason: entry.exclusionReason === 'left_official_group' ? '开奖前核验时已不在本活动指定的官方群内' : entry.exclusionReason === 'account_unavailable' ? '开奖时账号已停用或注销' : entry.exclusionReason === 'post_requirement_unmet' ? '开奖前没有活动发布后审核通过且仍可见的合格帖子' : null,
      previewPrize: c?.prizes?.[0]
        ? { name: c.prizes[0].name, image: c.prizes[0].image }
        : null,
      cover: c?.cover,
      shareCover: c?.shareCover,
      createdAt: entry.createdAt,
      serverTime: new Date(),
    };
  }
  async myState(id: string, user: any) {
    const userId = this.userId(user);
    const c = await this.campaign(id);
    if (c.status === "draft" || c.mode !== "scheduled")
      throw new NotFoundException("活动尚未发布或已停用");
    const entries = await this.prisma.welfareEntry.findMany({
      where: { campaignId: id, userId },
      include: {
        prize: true,
        campaign: {
          include: { prizes: { orderBy: { sortOrder: "asc" }, take: 1 } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    const [profile, binding] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true, studentVerify: { include: identityInclude } },
      }),
      this.prisma.wechatOfficialBinding.findUnique({
        where: { userId },
        select: { subscribe: true, officialOpenid: true },
      }),
    ]);
    const studentVerified = effectiveStudentIdentity(
      profile?.studentVerify,
      userId,
      c.regionId || profile?.profile?.regionId,
    );
    const checkinRecord = c.checkinSessionId ? await this.prisma.welfareCheckinRecord.findUnique({
      where: {sessionId_userId: {sessionId: c.checkinSessionId, userId}},
    }) : null;
    const eligibility = {
      ...await postEligibility(this.prisma, userId, c),
      checkinCompleted: !!checkinRecord,
      checkinSignedAt: checkinRecord?.signedAt || null,
      ...additionalEligibility(profile, c),
      studentVerified,
      studentStatus: studentVerified
        ? "approved"
        : String(profile?.studentVerify?.status || "none").toLowerCase(),
      officialBound: !!binding?.officialOpenid && binding.subscribe,
    };
    return {
      eligibility,
      registered: entries.length > 0,
      entry: entries[0] ? this.ownView(entries[0]) : null,
      serverTime: new Date(),
    };
  }

  async mine(user: any, q: any) {
    const userId = this.userId(user),
      { page, size, skip } = this.paging(q);
    const now = new Date();
    const common: Prisma.WelfareEntryWhereInput = {
      userId,
      campaign: { mode: "scheduled" },
    };
    const filters: Record<string, Prisma.WelfareEntryWhereInput> = {
      ongoing: { outcome: "waiting", campaign: { endAt: { gt: now } } },
      upcoming: { outcome: "waiting", campaign: { endAt: { lte: now } } },
      ended: { outcome: { in: ["won", "lost", "excluded", "cancelled"] } },
      waiting: { outcome: "waiting" },
      won: { outcome: "won" },
    };
    const where: Prisma.WelfareEntryWhereInput = {
      AND: [common, filters[q.tab] || {}],
    };
    const counts = Object.fromEntries(
      await Promise.all(
        ["ongoing", "upcoming", "ended"].map(async (key) => [
          key,
          await this.prisma.welfareEntry.count({
            where: { AND: [common, filters[key]] },
          }),
        ]),
      ),
    );
    const [rows, total] = await Promise.all([
      this.prisma.welfareEntry.findMany({
        where,
        include: {
          prize: true,
          campaign: {
            include: { prizes: { orderBy: { sortOrder: "asc" }, take: 1 } },
          },
        },
        orderBy: { createdAt: "desc" },
        take: size,
        skip,
      }),
      this.prisma.welfareEntry.count({ where }),
    ]);
    return {
      list: rows.map((e) => this.ownView(e)),
      total,
      counts,
      page,
      size,
      serverTime: now,
    };
  }
  async myEntry(id: string, user: any) {
    const e = await this.prisma.welfareEntry.findFirst({
      where: { id, userId: this.userId(user) },
      include: {
        prize: true,
        campaign: {
          include: { prizes: { orderBy: { sortOrder: "asc" }, take: 1 } },
        },
      },
    });
    if (!e) throw new NotFoundException("参与记录不存在");
    return this.ownView(e);
  }
  async claimQr(id: string, user: any) {
    const e = await this.prisma.welfareEntry.findFirst({
      where: { id, userId: this.userId(user) },
      include: { campaign: true, prize: true },
    });
    if (!e || !e.claimCode) throw new NotFoundException("领奖码不存在");
    if (
      e.outcome !== "won" ||
      e.claimStatus !== "pending" ||
      e.campaign.claimUntil <= new Date() ||
      e.campaign.claimMethod === "shipping" ||
      !e.prize ||
      !["physical", "manual"].includes(e.prize.kind)
    )
      throw new BadRequestException("当前奖品暂不可出示核销码");
    const image = await QRCode.toDataURL(
      `https://yuntingzhe.cn/pagesWelfare/verify?code=${e.claimCode}`,
      { width: 560, margin: 2, errorCorrectionLevel: "M" },
    );
    return { image, code: e.claimCode };
  }
  async winners(id: string, q: any) {
    await this.publicDetail(id);
    const { page, size, skip } = this.paging(q);
    const where = { campaignId: id, outcome: "won" };
    const [rows, total] = await Promise.all([
      this.prisma.welfareEntry.findMany({
        where,
        select: {
          nickname: true,
          updatedAt: true,
          prize: { select: { name: true, image: true } },
        },
        orderBy: { createdAt: "desc" },
        take: size,
        skip,
      }),
      this.prisma.welfareEntry.count({ where }),
    ]);
    return {
      list: rows.map((e) => ({
        nickname: maskNickname(e.nickname),
        prize: e.prize,
      })),
      total,
      page,
      size,
    };
  }
  private async eligible(db: DB, userId: string, c: WelfareCampaign) {
    const user = await db.user.findFirst({
      where: { id: userId, ...eligibleUser },
      include: { profile: true, studentVerify: { include: identityInclude } },
    });
    if (!user) throw new ForbiddenException("当前账号不能参与活动");
    const post = await postEligibility(db, userId, c);
    if (!post.postCompleted) throw new ForbiddenException({
      code: post.postPending ? "WELFARE_POST_PENDING" : "WELFARE_POST_REQUIRED",
      message: post.postPending ? "你的帖子仍在审核中，通过后返回活动重新核验" : "请先发布一篇活动发布后审核通过且仍可见的校园帖子",
    });
    const extra = additionalEligibility(user, c);
    if (c.requireProfile && !extra.profileComplete)
      throw new ForbiddenException({
        code: "WELFARE_PROFILE_REQUIRED",
        message: `请先完善个人资料：${extra.profileMissing.join("、")}`,
      });
    if (!extra.registrationEligible)
      throw new ForbiddenException({
        code: "WELFARE_REGISTRATION_DAYS_REQUIRED",
        message: extra.registeredDays === null
          ? "注册时间暂无法核验，请联系管理员"
          : `本活动需注册满 ${c.minRegistrationDays} 天，你已满 ${extra.registeredDays} 天`,
      });
    if (c.checkinSessionId && !await db.welfareCheckinRecord.findUnique({
      where: {sessionId_userId: {sessionId: c.checkinSessionId, userId}},
    })) throw new ForbiddenException({code: "WELFARE_CHECKIN_REQUIRED", message: "请先完成本活动指定场次的线下签到"});
    if (c.regionId && user.profile?.regionId !== c.regionId)
      throw new ForbiddenException("该活动仅限所属校区用户参与");
    if (
      c.requireStudent &&
      !effectiveStudentIdentity(
        user.studentVerify,
        userId,
        c.regionId || user.profile?.regionId,
      )
    )
      throw new ForbiddenException("请先完成学生认证");
    return user;
  }
  async participate(
    id: string,
    user: any,
    requestKey: unknown,
    groupProof?: any,
  ) {
    const userId = this.userId(user);
    if (
      typeof requestKey !== "string" ||
      !/^[a-zA-Z0-9_-]{12,80}$/.test(requestKey)
    )
      throw new BadRequestException("请求编号无效，请重新进入活动");
    const initial = await this.campaign(id);
    if (initial.mode !== "scheduled")
      throw new BadRequestException("旧版即时抽奖已停用，请选择新版活动");
    await this.access.assertStudentProtectedAction(
      userId,
      initial.regionId,
      "参加抽奖",
    );
    let memberProof: Awaited<ReturnType<WelfareWecomService['checkMember']>> | undefined;
    if (initial.requireGroup && initial.groupVerificationMode === 'wecom_member') {
      const existing = await this.prisma.welfareEntry.findFirst({ where: { campaignId: id, userId } });
      if (existing) return this.myEntry(existing.id, user);
      if (initial.status !== 'published' || new Date() < initial.startAt || new Date() >= initial.endAt) throw new BadRequestException('当前不在可参与时间内');
      if (!this.wecom) throw new BadRequestException('企业微信群验证服务未配置');
      memberProof = await this.wecom.checkMember(initial, userId);
    }
    const responseId = await this.tx(async (db) => {
      const c = await this.locked(id, db);
      // Return a committed result before time/limit checks, including network retries after closing.
      const previous = await db.welfareEntry.findFirst({
        where: { campaignId: id, userId },
      });
      if (previous) return previous.id;
      const now = new Date();
      if (c.status !== "published" || now < c.startAt || now >= c.endAt)
        throw new BadRequestException("当前不在可参与时间内");
      if (c.entryCount >= c.maxEntries)
        throw new BadRequestException("本场参与名额已满");
      if (c.requireGroup) {
        if (c.groupVerificationMode === 'wecom_member') {
          if (!this.wecom || !memberProof || !Array.isArray(c.groupIds) || !c.groupIds.includes(memberProof.groupId)) throw new BadRequestException('官方群规则已变化，请重新核验');
          await this.wecom.assertProofCurrent(db, memberProof);
        } else {
        if (!this.wechat) throw new BadRequestException("群验证服务未配置");
        const gid = await this.wechat.groupId(userId, groupProof);
        if (!Array.isArray(c.groupIds) || !c.groupIds.includes(gid))
          throw new ForbiddenException({
            code: "WELFARE_GROUP_REQUIRED",
            message: "请从本活动官方群内的小程序卡片进入报名",
          });
        }
      }
      const profile = await this.eligible(db, userId, c);
      if (c.requireOfficial) {
        const binding = await db.wechatOfficialBinding.findUnique({
          where: { userId },
          select: { officialOpenid: true, subscribe: true },
        });
        if (!binding?.officialOpenid || !binding.subscribe)
          throw new ForbiddenException("请先完成公众号绑定");
      }
      if (
        c.memberOnly &&
        !(await this.membership.hasBenefit(userId, "member_only_activity"))
      )
        throw new ForbiddenException("本活动仅限有效会员参与");
      // Attribution is recorded only after the visitor completes every
      // eligibility check and this transaction creates a real entry. It never
      // changes draw odds or creates another entry.
      const visitorKey = createHash("sha256")
        .update(`${id}:${userId}`)
        .digest("hex");
      const referral = await db.welfareShareVisit.findFirst({
        where: {
          visitorKey,
          source: "other_group",
          link: { campaignId: id, userId: { not: userId } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: { link: { select: { userId: true } } },
      });
      const e = await db.welfareEntry.create({
        data: {
          campaignId: id,
          userId,
          nickname: profile.nickname || "同学",
          requestKey,
          groupVerifiedAt: c.requireGroup ? now : null,
          groupVerifiedId: memberProof?.groupId || null,
          referredByUserId: referral?.link.userId || null,
          referralToken: referral?.linkToken || null,
          outcome: "waiting",
        },
      });
      await db.welfareCampaign.update({
        where: { id },
        data: { entryCount: { increment: 1 } },
      });
      return e.id;
    });
    return this.myEntry(responseId, user);
  }
  private async award(db: DB, entryId: string, prizeId: string) {
    const p = await db.welfarePrize.update({
      where: { id: prizeId },
      data: { issuedCount: { increment: 1 } },
    });
    await db.welfareEntry.update({
      where: { id: entryId },
      data: {
        outcome: "won",
        prizeId,
        claimStatus: "pending",
        claimCode:
          ["physical", "manual"].includes(p.kind)
            ? randomBytes(12).toString("hex").toUpperCase()
            : null,
      },
    });
  }
  private async resultNotifications(
    db: DB,
    entries: any[],
    c: WelfareCampaign,
    cancelText = "已取消",
  ) {
    // Bound SQL parameter count and packet size at the maximum 10,000 entrants.
    for (let start = 0; start < entries.length; start += 250) {
      await db.notification.createMany({
        data: entries.slice(start, start + 250).map((e) => ({
          userId: e.userId,
          eventKey: `welfare:${e.id}`,
          regionId: c.regionId,
          type: "SYSTEM",
          scene: "welfare_draw",
          title:
            e.outcome === "won"
              ? "恭喜中奖"
              : e.outcome === "cancelled"
                ? "活动已取消"
                : "抽奖结果已公布",
          content:
            e.outcome === "won"
              ? `「${c.title}」：获得${e.prize?.name}，请查看领取方式。`
              : `「${c.title}」${e.outcome === "cancelled" ? cancelText : e.outcome === "excluded" ? "参与资格已失效" : "本次未中奖"}，查看你的参与记录。`,
          data: {
            campaignId: c.id,
            entryId: e.id,
            activityName: c.title,
            prizeName: e.prize?.name || "",
            result: e.outcome,
            drawTime: new Date().toISOString(),
          },
          linkType: "page",
          linkValue: `/pagesWelfare/result?id=${e.id}`,
          channelMask: {
            inApp: true,
            websocket: true,
            wechatSubscribe: true,
            officialAccount: false,
            push: false,
          },
        })),
        skipDuplicates: true,
      });
    }
  }
  async adminOptions(accountId: string) {
    const ctx = await this.scope.getAdminContext(accountId);
    const regions = await this.prisma.region.findMany({
      where: ctx.isSuperAdmin ? {} : { id: { in: ctx.regionIds } },
      select: { id: true, name: true },
      take: 500,
    });
    const coupons = await this.prisma.coupon.findMany({
      where: {
        status: "active",
        endAt: { gt: new Date() },
        ...(!ctx.isSuperAdmin ? { regionId: { in: ctx.regionIds } } : {}),
      },
      select: {
        id: true,
        name: true,
        regionId: true,
        totalCount: true,
        receivedCount: true,
        startAt: true,
        endAt: true,
      },
      take: 500,
      orderBy: { createdAt: "desc" },
    });
    return { regions, coupons, canGlobal: ctx.isSuperAdmin };
  }
  async adminCapabilities(_accountId: string) {
    return {
      isSuperAdmin: (await this.scope.getAdminContext(_accountId)).isSuperAdmin,
      claimMethods: ["pickup", "shipping"],
      mode: "scheduled",
      maxEntries: 10000,
    };
  }
  async adminList(accountId: string, q: any) {
    const ctx = await this.scope.getAdminContext(accountId),
      { page, size, skip } = this.paging(q);
    const where: Prisma.WelfareCampaignWhereInput = {
      mode: "scheduled",
      ...(!ctx.isSuperAdmin ? { regionId: { in: ctx.regionIds } } : {}),
      ...(q.status ? { status: String(q.status) } : {}),
      ...(q.keyword
        ? { title: { contains: String(q.keyword).slice(0, 80) } }
        : {}),
    };
    const [list, total] = await Promise.all([
      this.prisma.welfareCampaign.findMany({
        where,
        include: { prizes: true },
        take: size,
        skip,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.welfareCampaign.count({ where }),
    ]);
    return { list, total, page, size };
  }
  async adminDetail(id: string, accountId: string) {
    const c = await this.campaign(id);
    await this.adminAccess(accountId, c.regionId);
    return {
      ...c,
      prizes: c.prizes.map(prize => ({
        ...prize,
        verifiers: prize.verifiers.map(verifier => ({ ...verifier, user: adminUserView(verifier.user) })),
        reservedUsers: prize.reservedUsers.map(reserved => ({ ...reserved, user: adminUserView(reserved.user) })),
      })),
      draw: await this.prisma.welfareDraw.findUnique({
        where: { campaignId: id },
      }),
      pendingAwards: await this.prisma.welfareEntry.count({
        where: {
          campaignId: id,
          outcome: "won",
          claimStatus: "pending",
          prize: { kind: "coupon" },
        },
      }),
    };
  }
  async save(id: string | null, input: any, accountId: string) {
    const parsed = validateCampaign(input),
      { prizes, ...data } = parsed;
    await this.adminAccess(accountId, data.regionId);
    if (
      data.regionId &&
      !(await this.prisma.region.findUnique({
        where: { id: data.regionId },
        select: { id: true },
      }))
    )
      throw new BadRequestException("校区不存在");
    const verifierIds: string[] = Array.from(
      new Set<string>(
        prizes.flatMap((p: any): string[] =>
          Array.isArray(p.verifierUserIds)
            ? p.verifierUserIds.map((id: unknown) => String(id))
            : [],
        ),
      ),
    );
    if (verifierIds.length) {
      const users = await this.prisma.user.findMany({
        where: {
          id: { in: verifierIds },
          ...eligibleUser,
        },
        select: { id: true },
      });
      if (users.length !== verifierIds.length)
        throw new BadRequestException("核销员账号不存在、已停用或不是普通小程序用户");
    }
    const createPrizes = prizes.map(({ verifierUserIds, ...prize }: any) => ({
      ...prize,
      ...(verifierUserIds?.length
        ? {
            verifiers: {
              create: verifierUserIds.map((userId: string) => ({
                userId,
                assignedBy: accountId,
              })),
            },
          }
        : {}),
    }));
    return this.tx(async (db) => {
      let savedId = id;
      if (id) {
        const c = await this.locked(id, db);
        await this.adminAccess(accountId, c.regionId);
        if (c.publishedAt || c.status !== "draft")
          throw new BadRequestException("已发布活动的规则已锁定");
        await this.validateCheckinLink(db, data);
        await db.welfarePrize.deleteMany({ where: { campaignId: id } });
        await db.welfareCampaign.update({
          where: { id },
          data: { ...data, ...(c.groupVerificationMode === 'wecom_member' && data.groupVerificationMode === 'wechat_card' ? { groupIds: [] } : {}), prizes: { create: createPrizes } },
        });
      } else {
        await this.validateCheckinLink(db, data);
        const c = await db.welfareCampaign.create({
          data: {
            ...data,
            createdBy: accountId,
            prizes: { create: createPrizes },
          },
        });
        savedId = c.id;
      }
      await this.audit(db, accountId, savedId!, "WELFARE_SAVE", {
        mode: data.mode,
      });
      return this.campaign(savedId!, db);
    });
  }
  private async validateCheckinLink(db: DB, campaign: {checkinSessionId?: string | null; regionId?: string | null; endAt: Date}) {
    const group = campaign as any;
    if (group.requireGroup && group.groupVerificationMode === 'wecom_member' && Array.isArray(group.groupIds) && group.groupIds.length) {
      if (!this.wecom) throw new BadRequestException('企业微信服务未配置');
      await this.wecom.validateGroups(group, db);
    }
    if (!campaign.checkinSessionId) return;
    const locked = await db.welfareCheckinSession.updateMany({where: {id: campaign.checkinSessionId}, data: {version: {increment: 1}}});
    if (!locked.count) throw new BadRequestException("签到场次不存在");
    const session = await db.welfareCheckinSession.findUniqueOrThrow({where: {id: campaign.checkinSessionId}});
    if (session.regionId && session.regionId !== campaign.regionId) throw new BadRequestException("签到场次必须与抽奖活动校区匹配");
    if (session.status !== "active") throw new BadRequestException("请选择未暂停的签到场次");
    if (session.startAt >= campaign.endAt) throw new BadRequestException("签到开始时间必须早于抽奖报名截止");
  }
  private async reserveCoupons(db: DB, c: any) {
    // Stable coupon lock order avoids deadlocks when campaigns share coupon types.
    for (const p of [...c.prizes].sort((a: any, b: any) =>
      String(a.couponId).localeCompare(String(b.couponId)),
    )) {
      if (p.kind !== "coupon") continue;
      await db.coupon.updateMany({
        where: { id: p.couponId },
        data: { receivedCount: { increment: 0 } },
      });
      const coupon = await db.coupon.findUnique({ where: { id: p.couponId } });
      const count = p.quantity;
      if (
        !coupon ||
        coupon.status !== "active" ||
        coupon.startAt > c.startAt ||
        coupon.endAt < c.claimUntil ||
        (coupon.regionId && coupon.regionId !== c.regionId)
      )
        throw new BadRequestException(
          `「${p.name}」优惠券状态、校区或有效期不满足活动要求`,
        );
      const reserved = await db.coupon.updateMany({
        where: {
          id: coupon.id,
          receivedCount: { lte: coupon.totalCount - count },
        },
        data: { receivedCount: { increment: count } },
      });
      if (reserved.count !== 1)
        throw new BadRequestException(`「${p.name}」优惠券库存不足`);
      await db.welfarePrize.update({
        where: { id: p.id },
        data: { couponReserved: count },
      });
    }
  }
  private async releaseUnused(db: DB, c: any) {
    for (const p of [...c.prizes].sort((a: any, b: any) =>
      String(a.couponId).localeCompare(String(b.couponId)),
    )) {
      if (!p.couponId || !p.couponReserved) continue;
      const pending = await db.welfareEntry.count({
        where: { prizeId: p.id, outcome: "won", claimStatus: "pending" },
      });
      const release = Math.max(0, p.couponReserved - pending);
      if (!release) continue;
      const updated = await db.coupon.updateMany({
        where: { id: p.couponId, receivedCount: { gte: release } },
        data: { receivedCount: { decrement: release } },
      });
      if (updated.count !== 1)
        throw new BadRequestException("优惠券预留库存异常，请核对库存");
      await db.welfarePrize.update({
        where: { id: p.id },
        data: { couponReserved: { decrement: release } },
      });
    }
  }
  async transition(id: string, action: string, accountId: string) {
    if (!["publish", "pause", "resume", "cancel", "retry"].includes(action))
      throw new BadRequestException("操作不存在");
    return this.tx(async (db) => {
      const c = await this.locked(id, db);
      await this.adminAccess(accountId, c.regionId);
      const now = new Date();
      let status = c.status;
      if (action === "publish") {
        if (c.status !== "draft" || c.publishedAt)
          throw new BadRequestException("活动已发布");
        validateCampaign({ ...c, prizes: c.prizes });
        await this.validateCheckinLink(db, c);
        if (c.requireGroup && c.groupVerificationMode === 'wecom_member') {
          if (!this.wecom) throw new BadRequestException('企业微信服务未配置');
          await this.wecom.validateGroups(c, db);
        } else if (
          c.requireGroup &&
          (!Array.isArray(c.groupIds) || !c.groupIds.length)
        )
          throw new BadRequestException("请先完成官方群绑定");
        if (c.requireGroup && !c.joinGuide)
          throw new BadRequestException(
            "请填写入群说明，包含无法扫码时的邀请方式",
          );
        await this.reserveCoupons(db, c);
        status = "published";
      } else if (action === "pause" || action === "resume") {
        if (
          c.status !== (action === "pause" ? "published" : "paused") ||
          now >= c.endAt
        )
          throw new BadRequestException("活动当前不能执行该操作");
        status = action === "pause" ? "paused" : "published";
      } else if (action === "cancel") {
        if (!["published", "paused"].includes(c.status) || now >= c.endAt)
          throw new BadRequestException("仅报名截止前可取消定时活动");
        status = "cancelled";
        await db.welfareEntry.updateMany({
          where: { campaignId: id, outcome: "waiting" },
          data: { outcome: "cancelled" },
        });
        const entries = await db.welfareEntry.findMany({
          where: { campaignId: id },
          include: { prize: true },
        });
        await this.resultNotifications(db, entries, c);
        await this.releaseUnused(db, c);
      } else {
        if (!c.publishedAt) throw new BadRequestException("草稿不能重试");
        // Retry schedules existing work. It never deletes a draw or redraws winners.
      }
      await db.welfareCampaign.update({
        where: { id },
        data: {
          status,
          lastError: null,
          ...(action === "publish" ? { publishedAt: now } : {}),
        },
      });
      await this.audit(db, accountId, id, `WELFARE_${action.toUpperCase()}`, {
        previousStatus: c.status,
        status,
      });
      return { id, status };
    });
  }
  async drawScheduled(id: string) {
    const initial = await this.campaign(id);
    if (!['published', 'paused'].includes(initial.status) || !initial.drawAt || initial.drawAt > new Date() || initial.drawnAt) return false;
    const needsGroupRecheck = initial.requireGroup && initial.groupVerificationMode === 'wecom_member' && initial.groupRecheckAtDraw;
    if (needsGroupRecheck && !this.wecom) throw new BadRequestException('企业微信服务未配置');
    const groupProof = needsGroupRecheck ? await this.wecom!.prepareDraw(initial) : undefined;
    return this.tx(async (db) => {
      const c = await this.locked(id, db),
        now = new Date();
      if (
        !["published", "paused"].includes(c.status) ||
        !c.drawAt ||
        c.drawAt > now ||
        c.drawnAt
      )
        return false;
      if (c.requireGroup && c.groupVerificationMode === 'wecom_member' && c.groupRecheckAtDraw) {
        if (!groupProof || JSON.stringify(c.groupIds) !== JSON.stringify(groupProof.groupIds)) throw new BadRequestException('开奖前官方群规则已变化，请重试');
        await this.wecom!.assertProofCurrent(db, groupProof);
      }
      const entries = await db.welfareEntry.findMany({
        where: { campaignId: id, outcome: "waiting" },
        orderBy: { id: "asc" },
      });
      const ids = [...new Set(entries.map((e) => e.userId))];
      const users = ids.length
        ? await db.user.findMany({
            where: { id: { in: ids }, ...eligibleUser },
            select: { id: true, nickname: true },
          })
        : [];
      // Account availability, configured group membership and visible posts are checked again at draw.
      const valid = new Map(users.map((u) => [u.id, u]));
      const postUsers = c.requirePost ? await qualifiedPostUsers(db, c, [...valid.keys()], now) : null;
      let pool = entries.filter((e) => valid.has(e.userId) && (!groupProof || groupProof.eligible.has(e.userId)) && (!postUsers || postUsers.has(e.userId)));
      const candidateCount = pool.length;
      // 人数门槛按开奖时真正有资格的人数判断，不足时不动任何报名记录。
      if (c.minParticipants > 0 && candidateCount < c.minParticipants)
        return this.extendOrAbandon(db, c, candidateCount, now);
      await db.welfareEntry.updateMany({
        where: { campaignId: id, outcome: "waiting" },
        data: { outcome: "lost", ...(groupProof ? { groupCheckedAtDraw: groupProof.checkedAt } : {}) },
      });
      const excluded = entries.filter((e) => !valid.has(e.userId));
      if (excluded.length)
        await db.welfareEntry.updateMany({
          where: { id: { in: excluded.map((e) => e.id) } },
          data: { outcome: "excluded", exclusionReason: 'account_unavailable' },
        });
      const leftGroup = groupProof ? entries.filter(e => valid.has(e.userId) && !groupProof.eligible.has(e.userId)) : [];
      if (leftGroup.length) await db.welfareEntry.updateMany({ where: { id: { in: leftGroup.map(e => e.id) } }, data: { outcome: 'excluded', exclusionReason: 'left_official_group' } });
      const missingPost = postUsers ? entries.filter(e => valid.has(e.userId) && (!groupProof || groupProof.eligible.has(e.userId)) && !postUsers.has(e.userId)) : [];
      if (missingPost.length) await db.welfareEntry.updateMany({ where: { id: { in: missingPost.map(e => e.id) } }, data: { outcome: 'excluded', exclusionReason: 'post_requirement_unmet' } });
      let randomWinners = 0;
      let reservedWinners = 0;
      for (const p of c.prizes) {
        // 获取该奖项的内定用户
        const reservedRecords = await db.welfarePrizeReserved.findMany({
          where: { prizeId: p.id },
          select: { userId: true },
        });
        const reservedUserIds = new Set(reservedRecords.map(r => r.userId));
        
        // 从奖池中找出内定用户（需要在奖池中且是内定用户）
        const reservedEntries = pool.filter(e => reservedUserIds.has(e.userId));
        const reservedToAward = reservedEntries.slice(0, p.quantity); // 最多内定名额数
        
        // 内定用户优先中奖
        for (const e of reservedToAward) {
          await this.award(db, e.id, p.id);
          reservedWinners++;
        }
        
        // 剩余名额从非内定用户中随机选择
        const remainingQuantity = p.quantity - reservedToAward.length;
        const remainingPool = pool.filter(e => !reservedUserIds.has(e.userId));
        const randomEntries = choose(remainingPool, remainingQuantity);
        
        for (const e of randomEntries) {
          await this.award(db, e.id, p.id);
          randomWinners++;
        }
        
        // 从奖池中移除已中奖的用户（包括内定和随机）
        const allWinners = [...reservedToAward, ...randomEntries];
        const selected = new Set(allWinners.map((e) => e.id));
        pool = pool.filter((e) => !selected.has(e.id));
      }
      await db.welfareDraw.create({
        data: {
          campaignId: id,
          candidateCount,
          randomWinners,
          rules: {
            version: 3,
            mode: c.mode,
            endAt: c.endAt.toISOString(),
            drawAt: c.drawAt.toISOString(),
            prizes: c.prizes.map((p) => ({ id: p.id, quantity: p.quantity })),
            reservedWinners,
            ...(postUsers ? { postEligibility: { checkedAt: now.toISOString(), requiredSince: c.publishedAt!.toISOString(), excludedCount: missingPost.length } } : {}),
            ...(groupProof ? { groupEligibility: { checkedAt: groupProof.checkedAt.toISOString(), excludedCount: leftGroup.length, groups: groupProof.snapshots.map(snapshot => ({ id: snapshot.id, memberVersion: snapshot.memberVersion, syncedAt: snapshot.syncedAt.toISOString() })) } } : {}),
          },
        },
      });
      await db.welfareCampaign.update({
        where: { id },
        data: { status: "finished", drawnAt: now, lastError: null },
      });
      await this.releaseUnused(db, await this.campaign(id, db));
      // Persist notifications in the same commit. Delivery is an independent worker concern.
      const results = await db.welfareEntry.findMany({
        where: { campaignId: id, outcome: { in: ["won", "lost", "excluded"] } },
        include: { prize: true },
      });
      await this.resultNotifications(db, results, c);
      return { randomWinners, candidateCount };
    });
  }
  /** 人数不足：报名与开奖一起顺延；顺延次数用完（或优惠券撑不到新开奖时间）则作废并退回奖品库存。 */
  private async extendOrAbandon(db: DB, c: any, candidateCount: number, now: Date) {
    const shift = c.extendHours * 3_600_000;
    // A late worker run still gives entrants a full extension window.
    const drawAt = new Date(Math.max(c.drawAt.getTime(), now.getTime()) + shift);
    const moved = drawAt.getTime() - c.drawAt.getTime();
    const gap = c.drawAt.getTime() - c.endAt.getTime();
    const endAt = new Date(Math.min(drawAt.getTime(), Math.max(drawAt.getTime() - gap, now.getTime() + shift / 2)));
    const claimUntil = new Date(c.claimUntil.getTime() + moved);
    const couponIds = c.prizes.filter((p: any) => p.kind === "coupon" && p.couponId).map((p: any) => p.couponId);
    const coupons = couponIds.length
      ? await db.coupon.findMany({ where: { id: { in: couponIds } }, select: { status: true, endAt: true } })
      : [];
    const couponsLast = coupons.length === couponIds.length && coupons.every((coupon) => coupon.status === "active" && coupon.endAt >= drawAt);
    if ((!c.maxExtensions || c.extensionCount < c.maxExtensions) && couponsLast) {
      await db.welfareCampaign.update({
        where: { id: c.id },
        data: { endAt, drawAt, claimUntil, extensionCount: { increment: 1 }, lastError: null },
      });
      // Admin operation logs need a real admin account; the campaign row records automatic changes.
      return { extended: true, candidateCount, drawAt };
    }
    const reason = couponsLast
      ? `参与人数不足 ${c.minParticipants} 人，已顺延 ${c.extensionCount} 次，活动未开奖`
      : `参与人数不足 ${c.minParticipants} 人，奖品优惠券有效期不足以继续顺延，活动未开奖`;
    await db.welfareEntry.updateMany({
      where: { campaignId: c.id, outcome: "waiting" },
      data: { outcome: "cancelled" },
    });
    await db.welfareCampaign.update({
      where: { id: c.id },
      data: { status: "cancelled", lastError: reason },
    });
    await this.releaseUnused(db, c);
    const entries = await db.welfareEntry.findMany({ where: { campaignId: c.id }, include: { prize: true } });
    await this.resultNotifications(db, entries, c, "人数不足未开奖，活动已取消");
    return { cancelled: true, candidateCount };
  }
  async deliverCoupon(entryId: string) {
    const initial = await this.prisma.welfareEntry.findUnique({
      where: { id: entryId },
    });
    if (!initial) return;
    return this.tx(async (db) => {
      await this.locked(initial.campaignId, db);
      const e = await db.welfareEntry.findUniqueOrThrow({
        where: { id: entryId },
        include: { prize: true },
      });
      if (
        e.outcome !== "won" ||
        e.claimStatus !== "pending" ||
        e.prize?.kind !== "coupon" ||
        !e.prize.couponId
      )
        return;
      if (e.prize.couponReserved < 1)
        throw new BadRequestException("奖品券预留库存不足");
      const coupon = await db.coupon.findUnique({
        where: { id: e.prize.couponId },
      });
      if (!coupon || coupon.status !== "active" || coupon.endAt <= new Date())
        throw new BadRequestException("奖品券停用或过期，请运营处理");
      // Publication already reserved inventory. Issuing must not decrement it a second time.
      const receipt = await db.couponReceive.create({
        data: { userId: e.userId, couponId: coupon.id, status: "unused" },
      });
      await db.welfarePrize.update({
        where: { id: e.prize.id },
        data: { couponReserved: { decrement: 1 } },
      });
      await db.welfareEntry.update({
        where: { id: e.id },
        data: {
          claimStatus: "delivered",
          couponReceiveId: receipt.id,
          deliveryError: null,
        },
      });
    });
  }
  async sweep() {
    const now = new Date();
    const campaigns = await this.prisma.welfareCampaign.findMany({
      where: {
        status: { in: ["published", "paused"] },
        mode: "scheduled",
        drawAt: { lte: now },
      },
      take: 20,
      orderBy: { updatedAt: "asc" },
    });
    for (const c of campaigns) {
      try {
        await this.drawScheduled(c.id);
      } catch (error: any) {
        await this.prisma.welfareCampaign.update({
          where: { id: c.id },
          data: { lastError: String(error.message || error).slice(0, 1000) },
        });
      }
    }
    const pending = await this.prisma.welfareEntry.findMany({
      where: {
        outcome: "won",
        claimStatus: "pending",
        prize: { kind: "coupon" },
      },
      select: { id: true },
      take: 100,
      orderBy: { updatedAt: "asc" },
    });
    for (const e of pending) {
      try {
        await this.deliverCoupon(e.id);
      } catch (error: any) {
        await this.prisma.welfareEntry.update({
          where: { id: e.id },
          data: {
            deliveryError: String(error.message || error).slice(0, 1000),
          },
        });
      }
    }
    return { campaigns: campaigns.length, deliveries: pending.length };
  }
  async redeem(code: unknown, accountId: string) {
    if (
      typeof code !== "string" ||
      !/^[A-F0-9]{24}$/.test(code.trim().toUpperCase())
    )
      throw new BadRequestException("请输入完整领取码");
    const e = await this.prisma.welfareEntry.findUnique({
      where: { claimCode: code.trim().toUpperCase() },
      include: { campaign: true },
    });
    if (!e) throw new NotFoundException("领取码不存在");
    await this.adminAccess(accountId, e.campaign.regionId);
    return this.tx(async (db) => {
      const c = await this.locked(e.campaignId, db);
      if (c.claimUntil <= new Date())
        throw new BadRequestException("领奖期限已过");
      if (c.claimMethod === "shipping")
        throw new BadRequestException("邮寄奖品请使用发货操作");
      const updated = await db.welfareEntry.updateMany({
        where: {
          id: e.id,
          outcome: "won",
          claimStatus: "pending",
          prize: { kind: { in: ["physical", "manual"] } },
        },
        data: {
          claimStatus: "redeemed",
          redeemedAt: new Date(),
          redeemedBy: accountId,
        },
      });
      if (updated.count !== 1)
        throw new BadRequestException("奖品已核销，请勿重复发放");
      await this.audit(db, accountId, c.id, "WELFARE_REDEEM", {
        entryId: e.id,
      });
      return { redeemed: true, entryId: e.id };
    });
  }
  private normalizedClaimCode(code: unknown) {
    if (
      typeof code !== "string" ||
      !/^[A-F0-9]{24}$/.test(code.trim().toUpperCase())
    )
      throw new BadRequestException("请输入完整领取码");
    return code.trim().toUpperCase();
  }
  private async verifierEntry(code: unknown, user: any) {
    const userId = this.userId(user);
    const claimCode = this.normalizedClaimCode(code);
    const entry = await this.prisma.welfareEntry.findUnique({
      where: { claimCode },
      include: { campaign: true, prize: true },
    });
    if (!entry) throw new NotFoundException("领取码不存在");
    if (!entry.prizeId || !entry.prize)
      throw new BadRequestException("该领取码没有可核销的奖品");
    const assigned = await this.prisma.welfarePrizeVerifier.findUnique({
      where: { prizeId_userId: { prizeId: entry.prizeId, userId } },
      select: { id: true },
    });
    if (!assigned) throw new ForbiddenException("你没有该奖品的核销权限");
    return { entry, userId };
  }
  async previewRedeem(code: unknown, user: any) {
    const { entry } = await this.verifierEntry(code, user);
    if (entry.campaign.claimUntil <= new Date())
      throw new BadRequestException("领奖期限已过");
    if (entry.campaign.claimMethod === "shipping")
      throw new BadRequestException("邮寄奖品请使用发货操作");
    if (!["physical", "manual"].includes(entry.prize!.kind))
      throw new BadRequestException("该奖品不需要扫码核销");
    if (entry.outcome !== "won" || entry.claimStatus !== "pending")
      throw new BadRequestException("该领取码已核销或当前不可领取");
    return {
      redeemable: true,
      entryId: entry.id,
      campaignTitle: entry.campaign.title,
      prizeName: entry.prize!.name,
      prizeImage: entry.prize!.image,
      pickupLocation: entry.campaign.pickupLocation,
    };
  }
  async redeemByVerifier(code: unknown, user: any) {
    const { entry, userId } = await this.verifierEntry(code, user);
    return this.tx(async (db) => {
      const c = await this.locked(entry.campaignId, db);
      if (c.claimUntil <= new Date())
        throw new BadRequestException("领奖期限已过");
      if (c.claimMethod === "shipping")
        throw new BadRequestException("邮寄奖品请使用发货操作");
      const assigned = await db.welfarePrizeVerifier.findUnique({
        where: { prizeId_userId: { prizeId: entry.prizeId!, userId } },
        select: { id: true },
      });
      if (!assigned) throw new ForbiddenException("你没有该奖品的核销权限");
      const updated = await db.welfareEntry.updateMany({
        where: {
          id: entry.id,
          outcome: "won",
          claimStatus: "pending",
          prize: { kind: { in: ["physical", "manual"] } },
        },
        data: {
          claimStatus: "redeemed",
          redeemedAt: new Date(),
          redeemedBy: userId,
        },
      });
      if (updated.count !== 1)
        throw new BadRequestException("奖品已核销，请勿重复发放");
      return {
        redeemed: true,
        entryId: entry.id,
        campaignTitle: c.title,
        prizeName: entry.prize?.name,
      };
    });
  }
  async adminEntries(id: string, accountId: string, q: any) {
    const c = await this.campaign(id);
    await this.adminAccess(accountId, c.regionId);
    const { page, size, skip } = this.paging(q);
    const where: Prisma.WelfareEntryWhereInput = {
      campaignId: id,
      ...(q.outcome ? { outcome: String(q.outcome) } : {}),
      ...await this.adminEntrySearch(q.keyword),
    };
    const [rows, total] = await Promise.all([
      this.prisma.welfareEntry.findMany({
        where,
        include: { prize: true },
        orderBy: { createdAt: "desc" },
        take: size,
        skip,
      }),
      this.prisma.welfareEntry.count({ where }),
    ]);
    const userById = await this.adminEntryUsers(rows);
    return {
      list: rows.map(({ claimCode, requestKey, ...e }) => ({ ...e, user: userById.get(e.userId) || null })),
      total,
      page,
      size,
    };
  }
  async adminLogs(id: string, accountId: string) {
    const c = await this.campaign(id);
    await this.adminAccess(accountId, c.regionId);
    const list = await this.prisma.adminOperationLog.findMany({
      where: { module: "welfare", targetId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, action: true, accountId: true, createdAt: true },
    });
    return { list };
  }
  async groupSession(user: any, code: unknown) {
    if (!this.wechat) throw new BadRequestException("群验证服务未配置");
    return this.wechat.refreshSession(this.userId(user), code);
  }
  async checkGroup(id: string, user: any, proof: any) {
    const c = await this.campaign(id);
    if (c.status === "cancelled")
      throw new BadRequestException("活动已取消，无法验证官方群");
    if (c.status !== "published")
      throw new BadRequestException("活动当前不可报名，暂不能验证官方群");
    if (new Date() >= c.endAt)
      throw new BadRequestException("报名已结束，无法验证官方群");
    if (c.groupVerificationMode === 'wecom_member') {
      if (!this.wecom) throw new BadRequestException('企业微信服务未配置');
      const result = await this.wecom.checkMember(c, this.userId(user));
      return { verified: true, checkedAt: result.checkedAt, expiresIn: 30 };
    }
    if (!this.wechat) throw new BadRequestException("群验证服务未配置");
    const gid = await this.wechat.groupId(this.userId(user), proof);
    if (!Array.isArray(c.groupIds) || !c.groupIds.includes(gid))
      throw new ForbiddenException({
        code: "WELFARE_GROUP_REQUIRED",
        message: "当前群不是后台绑定的官方群，请从绑定的官方群内重新打开活动卡片",
      });
    return { verified: true, expiresIn: 300 };
  }

  async shareLink(id: string, user: any) {
    const userId = this.userId(user);
    const c = await this.publicDetail(id);
    const owner = await this.prisma.user.findFirst({ where: { id: userId, ...eligibleUser }, select: { id: true } });
    if (!owner) throw new ForbiddenException("当前账号不可分享活动");
    const entry = await this.prisma.welfareEntry.findFirst({
      where: { campaignId: id, userId },
      select: { id: true },
    });
    if (!entry) throw new ForbiddenException("报名成功后才能分享活动");
    if (c.status === "cancelled") throw new BadRequestException("活动已取消");
    const link = await this.prisma.welfareShareLink.upsert({
      where: { campaignId_userId: { campaignId: id, userId } },
      create: { token: randomBytes(16).toString("hex"), campaignId: id, userId },
      update: {},
    });
    return { token: link.token, path: `/pagesWelfare/detail?id=${encodeURIComponent(id)}&share=${link.token}` };
  }
  async recordShareVisit(id: string, user: any, input: any) {
    const userId = this.userId(user);
    if (typeof input?.token !== "string" || !/^[a-f0-9]{32}$/.test(input.token))
      throw new BadRequestException("分享来源无效");
    const link = await this.prisma.welfareShareLink.findUnique({ where: { token: input.token }, include: { campaign: true } });
    if (!link || link.campaignId !== id || link.campaign.status === "draft") throw new NotFoundException("分享活动不存在");
    if (link.userId === userId) return { recorded: false, reason: "self" };
    const visitor = await this.prisma.user.findFirst({ where: { id: userId, ...eligibleUser }, select: { id: true } });
    if (!visitor) throw new ForbiddenException("当前账号不可记录访问");
    const visitorKey = createHash("sha256").update(`${id}:${userId}`).digest("hex");
    let source = "unknown", groupKey = "unknown";
    if (input.proof && this.wechat) {
      try {
        const gid = await this.wechat.groupId(userId, input.proof);
        if (link.campaign.groupVerificationMode === 'wecom_member') {
          source = this.wecom ? await this.wecom.sharedGroupSource(link.campaign, gid) : 'unknown';
        } else {
          source = Array.isArray(link.campaign.groupIds) && link.campaign.groupIds.includes(gid) ? "official" : "other_group";
        }
        groupKey = createHash("sha256").update(`${id}:${gid}`).digest("hex");
      } catch {
        // Failed or missing WeChat evidence never counts as a verified external group.
      }
    }
    try {
      await this.prisma.welfareShareVisit.create({
        data: { linkToken: link.token, visitorKey, groupKey, source },
      });
      return { recorded: true, source };
    } catch (error: any) {
      if (error?.code === "P2002") return { recorded: false, source };
      throw error;
    }
  }
  async shareAnalytics(id: string, accountId: string) {
    const c = await this.campaign(id);
    await this.adminAccess(accountId, c.regionId);
    const [summary, groups, qualifiedReferrals] = await Promise.all([
      this.prisma.$queryRaw<any[]>`
        SELECT COUNT(DISTINCT v.visitor_key) AS visitors,
          COUNT(DISTINCT CASE WHEN v.source = 'official' THEN v.visitor_key END) AS official,
          COUNT(DISTINCT CASE WHEN v.source = 'other_group' THEN v.visitor_key END) AS external,
          COUNT(DISTINCT CASE WHEN v.source = 'unknown' THEN v.visitor_key END) AS unknown
        FROM welfare_share_visits v JOIN welfare_share_links l ON l.token = v.link_token
        WHERE l.campaign_id = ${id}`,
      this.prisma.$queryRaw<any[]>`
        SELECT v.group_key AS groupkey, v.source, COUNT(DISTINCT v.visitor_key) AS visitors
        FROM welfare_share_visits v JOIN welfare_share_links l ON l.token = v.link_token
        WHERE l.campaign_id = ${id}
        GROUP BY v.group_key, v.source ORDER BY visitors DESC, v.group_key ASC LIMIT 100`,
      this.prisma.welfareEntry.count({
        where: { campaignId: id, referredByUserId: { not: null } },
      }),
    ]);
    const counts = summary[0] || {};
    return {
      visitors: Number(counts.visitors || 0), official: Number(counts.official || 0),
      external: Number(counts.external || 0), unknown: Number(counts.unknown || 0),
      qualifiedReferrals,
      groups: groups.map(g => ({ group: g.groupkey === "unknown" ? "来源未识别" : `群 ${g.groupkey.slice(0, 12)}`, source: g.source, visitors: Number(g.visitors) })),
    };
  }

  async shareCode(id: string, envVersion = "release") {
    await this.publicDetail(id);
    if (!this.wechat) throw new BadRequestException("微信服务未配置");
    return this.wechat.code("pagesWelfare/detail", `c=${id}`, envVersion);
  }
  async startBinding(id: string, accountId: string, envVersion: string) {
    const c = await this.campaign(id);
    await this.adminAccess(accountId, c.regionId);
    if (c.groupVerificationMode === 'wecom_member') throw new BadRequestException('企业微信群请从官方群名单选择，无需发送绑定卡片');
    if (c.publishedAt || c.status !== "draft")
      throw new BadRequestException("请在发布前完成群绑定");
    if (!this.wechat) throw new BadRequestException("微信服务未配置");
    return this.wechat.startBinding(accountId, id, envVersion);
  }
  async offerBinding(user: any, token: string, proof: any) {
    if (!this.wechat) throw new BadRequestException("微信服务未配置");
    return this.wechat.offerBinding(token, this.userId(user), proof);
  }
  async inspectBinding(id: string, accountId: string, token: string) {
    const c = await this.campaign(id);
    await this.adminAccess(accountId, c.regionId);
    if (!this.wechat) throw new BadRequestException("微信服务未配置");
    const binding = await this.wechat.binding(accountId, id, token);
    return { ready: !!binding.candidate, candidate: binding.candidate };
  }
  async confirmBinding(id: string, accountId: string, token: string) {
    if (!this.wechat) throw new BadRequestException("微信服务未配置");
    const binding = await this.wechat.binding(accountId, id, token);
    if (!binding.candidate)
      throw new BadRequestException("请先从目标群内打开绑定卡片并提交");
    const result = await this.tx(async (db) => {
      const c = await this.locked(id, db);
      await this.adminAccess(accountId, c.regionId);
      if (c.status !== "draft" || c.publishedAt)
        throw new BadRequestException("发布后不能更改参与群");
      if (c.groupVerificationMode === 'wecom_member') throw new BadRequestException('企业微信群请从官方群名单选择');
      const ids = Array.isArray(c.groupIds) ? c.groupIds : [];
      const next = [...new Set([...ids, binding.candidate.gid])];
      if (next.length > 20) throw new BadRequestException("每场最多绑定20个群");
      await db.welfareCampaign.update({
        where: { id },
        data: { groupIds: next },
      });
      await this.audit(db, accountId, id, "WELFARE_GROUP_BIND", {
        groupCount: next.length,
      });
      return { bound: true, groupCount: next.length };
    });
    await this.wechat.consumeBinding(token);
    return result;
  }
  async clearGroups(id: string, accountId: string) {
    return this.tx(async (db) => {
      const c = await this.locked(id, db);
      await this.adminAccess(accountId, c.regionId);
      if (c.status !== "draft" || c.publishedAt)
        throw new BadRequestException("发布后不能更改参与群");
      await db.welfareCampaign.update({
        where: { id },
        data: { groupIds: [] },
      });
      await this.audit(db, accountId, id, "WELFARE_GROUP_CLEAR");
      return { cleared: true };
    });
  }
  async addWecomGroups(id: string, accountId: string, ids: unknown) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(value => typeof value !== 'string' || !/^wg_[a-f0-9]{40}$/.test(value))) throw new BadRequestException('请选择已导入的官方群');
    return this.tx(async db => {
      const c = await this.locked(id, db);
      await this.adminAccess(accountId, c.regionId);
      if (c.groupVerificationMode !== 'wecom_member' || !['published', 'paused'].includes(c.status) || new Date() >= c.endAt) throw new BadRequestException('仅报名截止前可新增企业微信官方群');
      const previous = Array.isArray(c.groupIds) ? c.groupIds as string[] : [];
      if (previous.some(value => !ids.includes(value))) throw new BadRequestException('已发布活动不能移除原有官方群，以免影响已报名用户');
      if (!this.wecom) throw new BadRequestException('企业微信服务未配置');
      const groupIds = [...new Set<string>(ids)];
      await this.wecom.validateGroups({ ...c, groupIds }, db);
      await db.welfareCampaign.update({ where: { id }, data: { groupIds } });
      await this.audit(db, accountId, id, 'WELFARE_WECOM_GROUP_ADD', { addedGroupIds: groupIds.filter(value => !previous.includes(value)), groupCount: groupIds.length });
      return { groupIds };
    });
  }
  async address(id: string, user: any, input: any) {
    const userId = this.userId(user);
    if (
      typeof input?.addressId !== "string" ||
      !input.addressId ||
      input.addressId.length > 100
    )
      throw new BadRequestException("请从已有收货地址中选择");
    const savedAddress = await this.prisma.address.findFirst({
      where: { id: input.addressId, userId },
    });
    if (!savedAddress)
      throw new NotFoundException("地址不存在，请重新选择本人的收货地址");
    const name = String(savedAddress.name || "").trim(),
      phone = String(savedAddress.phone || "").trim();
    const baseAddress = String(
      savedAddress.fullAddress || savedAddress.detail || "",
    ).trim();
    const door = String(savedAddress.dormitoryNumber || "").trim();
    const address =
      baseAddress + (door && !baseAddress.endsWith(door) ? " " + door : "");
    if (
      !name ||
      name.length > 40 ||
      !/^1[3-9]\d{9}$/.test(phone) ||
      address.length < 8 ||
      address.length > 300
    )
      throw new BadRequestException("请在地址管理中补全姓名、手机号和完整地址");
    const own = await this.prisma.welfareEntry.findFirst({
      where: { id, userId },
      select: { campaignId: true },
    });
    if (!own) throw new NotFoundException("参与记录不存在");
    await this.tx(async (db) => {
      const c = await this.locked(own.campaignId, db);
      const entry = await db.welfareEntry.findUniqueOrThrow({
        where: { id },
        include: { prize: true },
      });
      if (
        c.claimMethod !== "shipping" ||
        entry.outcome !== "won" ||
        entry.prize?.kind !== "physical" ||
        !["pending", "processing"].includes(entry.claimStatus)
      )
        throw new BadRequestException("当前奖品不能提交或修改收货信息");
      if (c.claimUntil <= new Date())
        throw new BadRequestException("领奖期限已过");
      await db.welfareEntry.update({
        where: { id },
        data: {
          recipientName: name,
          recipientPhone: phone,
          recipientAddress: address,
          addressSubmittedAt: new Date(),
          claimStatus: "processing",
        },
      });
    });
    return this.myEntry(id, user);
  }
  async ship(id: string, accountId: string, input: any) {
    const carrier =
      typeof input?.carrier === "string" ? input.carrier.trim() : "";
    const tracking =
      typeof input?.trackingNumber === "string"
        ? input.trackingNumber.trim()
        : "";
    if (
      !carrier ||
      carrier.length > 40 ||
      !/^[A-Za-z0-9-]{6,60}$/.test(tracking)
    )
      throw new BadRequestException("请填写快递公司和正确的物流单号");
    const initial = await this.prisma.welfareEntry.findUnique({
      where: { id },
    });
    if (!initial) throw new NotFoundException("参与记录不存在");
    return this.tx(async (db) => {
      const c = await this.locked(initial.campaignId, db);
      await this.adminAccess(accountId, c.regionId);
      if (c.claimMethod !== "shipping")
        throw new BadRequestException("本活动使用自提领奖");
      const changed = await db.welfareEntry.updateMany({
        where: {
          id,
          outcome: "won",
          claimStatus: "processing",
          recipientAddress: { not: null },
          prize: { kind: "physical" },
        },
        data: {
          claimStatus: "shipped",
          shippingCarrier: carrier,
          trackingNumber: tracking,
          shippedAt: new Date(),
        },
      });
      if (changed.count !== 1)
        throw new BadRequestException("请先等待用户提交地址，或该奖品已经发货");
      await this.audit(db, accountId, c.id, "WELFARE_SHIP", { entryId: id });
      return { shipped: true };
    });
  }

  // ========== 内定用户管理 ==========

  /**
   * 获取奖项的内定用户列表
   */
  async getReservedUsers(prizeId: string, accountId: string) {
    const prize = await this.prisma.welfarePrize.findUnique({
      where: { id: prizeId },
      select: { id: true, campaignId: true, name: true, quantity: true },
    });
    if (!prize) throw new NotFoundException("奖项不存在");

    const campaign = await this.campaign(prize.campaignId);
    await this.adminAccess(accountId, campaign.regionId);

    const reservedUsers = await this.prisma.welfarePrizeReserved.findMany({
      where: { prizeId },
      include: {
        user: { select: adminUserSelect },
      },
      orderBy: { createdAt: "asc" },
    });

    return {
      prizeId: prize.id,
      prizeName: prize.name,
      quantity: prize.quantity,
      reservedCount: reservedUsers.length,
      reservedUsers: reservedUsers.map(r => ({
        id: r.id,
        userId: r.userId,
        assignedBy: r.assignedBy,
        createdAt: r.createdAt,
        user: adminUserView(r.user),
      })),
    };
  }

  /**
   * 添加内定用户
   */
  async addReservedUser(prizeId: string, userId: string, accountId: string) {
    if (typeof userId !== "string" || !userId.trim())
      throw new BadRequestException("请选择报名用户");
    return this.tx(async (db) => {
      const initial = await db.welfarePrize.findUnique({
        where: { id: prizeId },
        select: { campaignId: true },
      });
      if (!initial) throw new NotFoundException("奖项不存在");
      const campaign = await this.locked(initial.campaignId, db);
      await this.adminAccess(accountId, campaign.regionId);
      const prize = await db.welfarePrize.findUnique({
        where: { id: prizeId },
        include: { campaign: true, reservedUsers: true },
      });
      if (!prize) throw new NotFoundException("奖项不存在");
      if (["finished", "cancelled"].includes(campaign.status) || campaign.drawnAt)
        throw new BadRequestException("活动已开奖，不能修改内定名单");

      // 检查用户是否已报名该活动
      const entry = await db.welfareEntry.findFirst({
        where: { campaignId: prize.campaignId, userId },
      });
      if (!entry) throw new BadRequestException("该用户未报名此活动");

      // 检查内定名额是否已满
      if (prize.reservedUsers.length >= prize.quantity)
        throw new BadRequestException("内定名额已满，不能超过奖项总名额");

      // 检查是否已内定
      const exists = await db.welfarePrizeReserved.findFirst({
        where: { prizeId, userId },
      });
      if (exists) throw new BadRequestException("该用户已被内定");

      const reserved = await db.welfarePrizeReserved.create({
        data: {
          prizeId,
          userId,
          assignedBy: accountId,
        },
        include: {
          user: { select: adminUserSelect },
        },
      });

      await this.audit(db, accountId, prize.campaignId, "WELFARE_RESERVED_ADD", {
        prizeId,
        userId,
      });

      return { ...reserved, user: adminUserView(reserved.user) };
    });
  }

  /**
   * 删除内定用户
   */
  async removeReservedUser(prizeId: string, userId: string, accountId: string) {
    return this.tx(async (db) => {
      const initial = await db.welfarePrize.findUnique({
        where: { id: prizeId },
        select: { campaignId: true },
      });
      if (!initial) throw new NotFoundException("奖项不存在");
      const campaign = await this.locked(initial.campaignId, db);
      await this.adminAccess(accountId, campaign.regionId);
      const reserved = await db.welfarePrizeReserved.findFirst({
        where: { prizeId, userId },
        include: { prize: { include: { campaign: true } } },
      });
      if (!reserved) throw new NotFoundException("内定记录不存在");
      if (["finished", "cancelled"].includes(campaign.status) || campaign.drawnAt)
        throw new BadRequestException("活动已开奖，不能修改内定名单");

      await db.welfarePrizeReserved.delete({
        where: { id: reserved.id },
      });

      await this.audit(db, accountId, reserved.prize.campaignId, "WELFARE_RESERVED_REMOVE", {
        prizeId,
        userId,
      });

      return { removed: true };
    });
  }

  /**
   * 获取活动的报名用户列表（供选择内定用户）
   */
  async getEntriesForReserved(campaignId: string, accountId: string, keyword?: string) {
    const campaign = await this.campaign(campaignId);
    await this.adminAccess(accountId, campaign.regionId);
    const where: Prisma.WelfareEntryWhereInput = { campaignId, ...await this.adminEntrySearch(keyword) };

    const entries = await this.prisma.welfareEntry.findMany({
      where,
      select: {
        id: true,
        userId: true,
        nickname: true,
        outcome: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const userById = await this.adminEntryUsers(entries);

    return entries.map(e => ({
      entryId: e.id,
      userId: e.userId,
      nickname: e.nickname,
      outcome: e.outcome,
      createdAt: e.createdAt,
      user: userById.get(e.userId) || null,
    }));
  }
}
