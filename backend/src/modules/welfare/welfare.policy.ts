import { BadRequestException } from "@nestjs/common";
import { randomInt } from "node:crypto";

export function integer(
  value: unknown,
  label: string,
  min: number,
  max: number,
) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new BadRequestException(`${label}须为 ${min} 至 ${max} 的整数`);
  }
  return value;
}

export function maskNickname(value: string) {
  return Array.from(String(value || "同学"))[0] + "**";
}

// Use persisted user data for both the status endpoint and the registration guard.
// Do not accept a client-side "profile saved" flag or a client-provided account age.
export function additionalEligibility(
  user: {
    avatar?: string | null;
    nickname?: string | null;
    openid?: string | null;
    phone?: string | null;
    createdAt?: Date | string | null;
  } | null | undefined,
  campaign: { minRegistrationDays?: number | null },
  now = new Date(),
) {
  const avatar = String(user?.avatar || "").trim();
  const nickname = String(user?.nickname || "").trim();
  let hasAvatar = false;
  try {
    const url = new URL(avatar, "https://profile.local");
    hasAvatar = /^(https?:\/\/|\/(?:uploads|static)\/)/.test(avatar) &&
      !["/", "/static/logo.png"].includes(decodeURIComponent(url.pathname));
  } catch (_) { /* Invalid or temporary avatar paths are incomplete. */ }
  const defaultNames = ["微信用户", "灵萌用户", "校小伴用户"];
  if (user?.openid) defaultNames.push(`用户${user.openid.slice(-6)}`);
  if (user?.phone) defaultNames.push(`用户${user.phone.slice(-4)}`);
  const hasNickname = !!nickname && !defaultNames.includes(nickname);
  const profileMissing = [!hasAvatar ? "头像" : "", !hasNickname ? "昵称" : ""].filter(Boolean);
  const days = campaign.minRegistrationDays || 0;
  const createdAt = user?.createdAt ? new Date(user.createdAt).getTime() : NaN;
  const elapsed = now.getTime() - createdAt;
  const validRegistration = Number.isFinite(elapsed) && elapsed >= 0;
  return {
    profileComplete: profileMissing.length === 0,
    profileMissing,
    registeredDays: validRegistration ? Math.floor(elapsed / 86400000) : null,
    registrationEligible: days === 0 || (validRegistration && elapsed >= days * 86400000),
    registrationEligibleAt: days > 0 && validRegistration
      ? new Date(createdAt + days * 86400000).toISOString()
      : null,
  };
}

// Partial Fisher-Yates: equal chance, without replacement; no sort(Math.random()).
export function choose<T>(
  pool: T[],
  count: number,
  pick: (max: number) => number = randomInt,
): T[] {
  const copy = [...pool];
  const winners: T[] = [];
  for (let n = 0; n < count && copy.length; n++) {
    const index = pick(copy.length);
    winners.push(copy[index]);
    copy[index] = copy[copy.length - 1];
    copy.pop();
  }
  return winners;
}

export function validateCampaign(input: any, now = new Date()) {
  if (!input || typeof input !== "object")
    throw new BadRequestException("请填写活动配置");
  const str = (
    value: unknown,
    label: string,
    max: number,
    required = false,
  ) => {
    if (value != null && typeof value !== "string")
      throw new BadRequestException(`${label}格式错误`);
    const text = String(value || "").trim();
    if ((required && !text) || text.length > max)
      throw new BadRequestException(`请正确填写${label}（不超过${max}字）`);
    return text;
  };
  const date = (value: unknown, label: string) => {
    const parsed = new Date(String(value || ""));
    if (!Number.isFinite(parsed.getTime()))
      throw new BadRequestException(`请正确填写${label}`);
    return parsed;
  };
  const image = (value: unknown) => {
    const url = str(value, "图片地址", 1000);
    if (url && !/^(https:\/\/[^\s]+|\/(?:uploads|static)\/[^\s]+)$/.test(url))
      throw new BadRequestException("请使用 HTTPS 图片或站内上传图片");
    return url || null;
  };
  if (input.mode !== "scheduled")
    throw new BadRequestException("新版福利仅支持每人一次、定时随机开奖");
  const startAt = date(input.startAt, "开始时间");
  const endAt = date(input.endAt, "结束或报名截止时间");
  const drawAt = date(input.drawAt, "开奖时间");
  const claimUntil = date(input.claimUntil, "领奖截止时间");
  if (
    endAt <= startAt ||
    endAt <= now ||
    (drawAt && drawAt < endAt) ||
    claimUntil <= (drawAt || endAt)
  ) {
    throw new BadRequestException(
      "请保证开始 < 截止 ≤ 开奖 < 领奖截止，且活动尚未截止",
    );
  }
  if (
    !Array.isArray(input.prizes) ||
    !input.prizes.length ||
    input.prizes.length > 12
  )
    throw new BadRequestException("请配置 1 至 12 个奖项");
  const prizes = input.prizes.map((p: any, sortOrder: number) => {
    if (!p || !["physical", "coupon", "manual"].includes(p.kind))
      throw new BadRequestException("奖品类型仅支持实物、优惠券或人工兑奖");
    const rawVerifierIds = Array.isArray(p.verifierUserIds)
      ? p.verifierUserIds
      : p.verifierUserIds
        ? [p.verifierUserIds]
        : [];
    if (rawVerifierIds.length > 5)
      throw new BadRequestException("每个奖品最多指定 5 名核销员");
    const verifierUserIds: string[] = Array.from(
      new Set<string>(
        rawVerifierIds
          .map((id: unknown): string => String(id || "").trim())
          .filter((id: string): id is string => Boolean(id)),
      ),
    );
    if (verifierUserIds.some((id: string) => id.length > 191))
      throw new BadRequestException("核销员账号格式错误");
    return {
      name: str(p.name, "奖品名称", 80, true),
      image: image(p.image),
      kind: p.kind,
      couponId:
        p.kind === "coupon" ? str(p.couponId, "优惠券 ID", 100, true) : null,
      quantity: integer(p.quantity, "奖品数量", 1, 1000),
      sortOrder,
      verifierUserIds,
    };
  });
  if (prizes.reduce((n: number, p: any) => n + p.quantity, 0) > 1000)
    throw new BadRequestException("单场随机奖品总数不得超过 1000");
  for (const key of [
    "requireStudent",
    "memberOnly",
    "requireGroup",
    "requireOfficial",
    "requireProfile",
    "requirePost",
  ]) {
    if (input[key] !== undefined && typeof input[key] !== "boolean")
      throw new BadRequestException("参与条件格式错误");
  }
  const pickupLocation = str(input.pickupLocation, "自提地点", 200);
  const groupVerificationMode = input.groupVerificationMode || 'wechat_card';
  if (!['wechat_card', 'wecom_member'].includes(groupVerificationMode)) throw new BadRequestException('请选择有效的官方群核验方式');
  if (input.groupRecheckAtDraw !== undefined && typeof input.groupRecheckAtDraw !== 'boolean') throw new BadRequestException('开奖前群核验条件格式错误');
  if (input.groupRecheckAtDraw === true && (groupVerificationMode !== 'wecom_member' || input.requireGroup !== true)) throw new BadRequestException('开奖前核验仅适用于必须加入企业微信官方群的活动');
  if (input.requireGroup === true && groupVerificationMode === 'wecom_member' && input.groupRecheckAtDraw === false) throw new BadRequestException('企业微信群活动必须开启开奖前复核，退群取消资格');
  let groupIds: string[] | undefined;
  if (groupVerificationMode === 'wecom_member') {
    if (!Array.isArray(input.groupIds) || input.groupIds.length > 100 || input.groupIds.some((id: any) => typeof id !== 'string' || !/^wg_[a-f0-9]{40}$/.test(id))) throw new BadRequestException('请选择已导入的企业微信官方群');
    groupIds = [...new Set<string>(input.groupIds)];
  }
  const claimContactImage = image(input.claimContactImage);
  const claimInstructions =
    str(input.claimInstructions, "领奖说明", 500) || null;
  if (
    prizes.some((p: any) => ["physical", "manual"].includes(p.kind)) &&
    input.claimMethod !== "shipping" &&
    !pickupLocation
  )
    throw new BadRequestException("自提或人工兑奖请填写领取地点");
  if (input.claimMethod && !["pickup", "shipping"].includes(input.claimMethod))
    throw new BadRequestException("请选择邮寄或自提");
  if (
    prizes.some((p: any) => p.kind === "manual") &&
    input.claimMethod === "shipping"
  )
    throw new BadRequestException("人工兑奖奖品请选择到店/现场领取");
  if (
    prizes.some((p: any) => p.kind === "manual") &&
    !str(input.contact, "领取联系方式", 100) &&
    !claimContactImage
  )
    throw new BadRequestException("人工兑奖请填写管理员联系方式或上传联系二维码");
  return {
    requireGroup: input.requireGroup === true,
    groupVerificationMode,
    groupRecheckAtDraw: input.requireGroup === true && groupVerificationMode === 'wecom_member',
    ...(groupIds ? { groupIds } : {}),
    joinImage: image(input.joinImage),
    joinGuide: str(input.joinGuide, "入群说明", 500) || null,
    claimMethod: input.claimMethod === "shipping" ? "shipping" : "pickup",
    title: str(input.title, "活动标题", 80, true),
    shareTitle: str(input.shareTitle, "分享卡片标题", 80) || null,
    description: str(input.description, "活动说明", 5000, true),
    cover: image(input.cover),
    shareCover: image(input.shareCover),
    mode: input.mode as string,
    regionId: str(input.regionId, "校区", 100) || null,
    requireStudent: input.requireStudent !== false,
    requireProfile: input.requireProfile === true,
    requirePost: input.requirePost === true,
    checkinSessionId: str(input.checkinSessionId, "签到场次", 191) || null,
    minRegistrationDays: integer(
      input.minRegistrationDays === undefined ? 0 : input.minRegistrationDays,
      "最低注册天数",
      0,
      3650,
    ),
    requireOfficial: input.requireOfficial !== false,
    memberOnly: input.memberOnly === true,
    startAt,
    endAt,
    drawAt,
    claimUntil,
    pickupLocation: pickupLocation || null,
    contact: str(input.contact, "领取联系方式", 100) || null,
    claimContactImage,
    claimInstructions,
    maxEntries: integer(input.maxEntries, "参与上限", 1, 10000),
    ...participantThreshold(input),
    prizes,
  };
}

/** 满多少人才开奖；不足时报名与开奖一起顺延，次数用完仍不足则作废。 */
function participantThreshold(input: any) {
  const minParticipants = integer(input.minParticipants ?? 0, "开奖人数门槛", 0, 10000);
  if (minParticipants > integer(input.maxEntries, "参与上限", 1, 10000))
    throw new BadRequestException("开奖人数门槛不能超过参与上限");
  return {
    minParticipants,
    extendHours: integer(input.extendHours ?? 24, "人数不足时每次顺延（小时）", 1, 168),
    maxExtensions: integer(input.maxExtensions ?? 0, "最多顺延次数", 0, 30),
  };
}
