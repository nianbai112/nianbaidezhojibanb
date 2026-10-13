import { BadRequestException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";

export const CHECKIN_PUBLIC_TTL = 60000;
export const CHECKIN_PERSONAL_TTL = 120000;
export type CheckinPayload = {
  v: 1;
  s: string;
  k: "staff" | "self";
  u?: string;
  e: number;
};
export function readCheckinToken(token: unknown): {
  payload: CheckinPayload;
  encoded: string;
  signature: string;
} {
  if (
    typeof token !== "string" ||
    token.length > 1200 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)
  )
    throw new BadRequestException("签到码格式不正确，请重新扫码");
  const [encoded, signature] = token.split(".");
  let p: any;
  try {
    p = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new BadRequestException("签到码格式不正确，请重新扫码");
  }
  if (
    p?.v !== 1 ||
    typeof p.s !== "string" ||
    !/^[A-Za-z0-9_-]{1,191}$/.test(p.s) ||
    !["staff", "self"].includes(p.k) ||
    !Number.isSafeInteger(p.e) ||
    (p.k === "staff"
      ? typeof p.u !== "string" || !/^[A-Za-z0-9_-]{1,191}$/.test(p.u)
      : p.u !== undefined)
  )
    throw new BadRequestException("签到码内容不正确，请重新扫码");
  return { payload: p, encoded, signature };
}
export function authenticateCheckinToken(
  token: unknown,
  secret: string,
): CheckinPayload {
  const { payload, encoded, signature } = readCheckinToken(token);
  const expected = createHmac("sha256", secret).update(encoded).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new BadRequestException("签到码已失效，请重新出示或扫描");
  return payload;
}
export function createCheckinToken(
  session: { id: string; qrSecret: string; endAt: Date },
  kind: "staff" | "self",
  userId?: string,
  now = Date.now(),
) {
  const expiry =
    kind === "self"
      ? (Math.floor(now / CHECKIN_PUBLIC_TTL) + 1) * CHECKIN_PUBLIC_TTL
      : now + CHECKIN_PERSONAL_TTL;
  const payload: CheckinPayload = {
    v: 1,
    s: session.id,
    k: kind,
    ...(kind === "staff" ? { u: userId } : {}),
    e: Math.min(expiry, session.endAt.getTime()),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    token:
      encoded +
      "." +
      createHmac("sha256", session.qrSecret)
        .update(encoded)
        .digest("base64url"),
    expiresAt: new Date(payload.e),
    serverTime: new Date(now),
  };
}
export function checkinAvailable(
  session: { status: string; startAt: Date; endAt: Date },
  now = new Date(),
) {
  if (session.status !== "active")
    throw new BadRequestException("本场签到已暂停");
  if (now < session.startAt) throw new BadRequestException("本场签到尚未开始");
  if (now >= session.endAt) throw new BadRequestException("本场签到已结束");
}
export function validateCheckinSession(input: any, now = new Date()) {
  const text = (value: unknown, max: number, label: string) => {
    if (typeof value !== "string" || !value.trim() || value.trim().length > max)
      throw new BadRequestException(`请正确填写${label}`);
    return value.trim();
  };
  if (!input || typeof input !== "object")
    throw new BadRequestException("请填写签到场次");
  const title = text(input.title, 80, "签到名称"),
    location = text(input.location, 180, "签到地点");
  if (typeof input.startAt !== "string" || typeof input.endAt !== "string")
    throw new BadRequestException("请填写签到开始和结束时间");
  const startAt = new Date(input.startAt),
    endAt = new Date(input.endAt);
  if (
    !Number.isFinite(startAt.getTime()) ||
    !Number.isFinite(endAt.getTime()) ||
    endAt <= startAt ||
    endAt <= now
  )
    throw new BadRequestException("签到开始须早于结束，且结束时间尚未到达");
  if (
    typeof input.allowStaffScan !== "boolean" ||
    typeof input.allowSelfScan !== "boolean" ||
    (!input.allowStaffScan && !input.allowSelfScan)
  )
    throw new BadRequestException("请至少启用一种签到方式");
  if (
    !Array.isArray(input.staffUserIds) ||
    input.staffUserIds.length > 20 ||
    input.staffUserIds.some(
      (id: unknown) =>
        typeof id !== "string" || !/^[A-Za-z0-9_-]{1,191}$/.test(id),
    )
  )
    throw new BadRequestException("每场最多指定20名工作人员");
  const staffUserIds = [...new Set<string>(input.staffUserIds)];
  if (input.allowStaffScan && !staffUserIds.length)
    throw new BadRequestException("工作人员扫码方式须指定工作人员");
  const regionId = input.regionId ? text(input.regionId, 191, "校区") : null;
  return {
    title,
    location,
    startAt,
    endAt,
    regionId,
    allowStaffScan: input.allowStaffScan,
    allowSelfScan: input.allowSelfScan,
    staffUserIds,
  };
}
