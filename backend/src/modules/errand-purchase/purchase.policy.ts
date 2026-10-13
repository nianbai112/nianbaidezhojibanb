import { BadRequestException } from "@nestjs/common";
import { createHash } from "crypto";

export const PURCHASE_TYPE = "purchase";
export const PURCHASE_BIZ = "errand_purchase";
export const CHANGE_BIZ = "errand_purchase_change";
export const purchaseConfigKey = (regionId: string) =>
  `errand_purchase:${regionId}`;
export const DEFAULT_PURCHASE_POLICY = {
  enabled: false,
  serviceFeeCents: 300,
  deliveryFeeCents: 400,
  distanceFeeCentsPerKm: 0,
  maxDistanceMeters: 10000,
  maxGoodsCents: 20000,
  maxOutstandingCents: 50000,
  maxShops: 3,
  maxQuantity: 20,
  maxWeightGrams: 10000,
  changeTimeoutMinutes: 10,
  autoReceiptHours: 24,
};
export const PURCHASE_RIDER_TIERS = ["official", "part_time", "student"] as const;
export type PurchaseRiderTier = (typeof PURCHASE_RIDER_TIERS)[number];
export const PURCHASE_RIDER_TIER_LABELS: Record<PurchaseRiderTier, string> = {
  official: "专职骑手",
  part_time: "兼职骑手",
  student: "学生骑手",
};
// A null limit follows the region limit; a number can only tighten it.
export type PurchaseRiderTierRule = {
  enabled: boolean;
  maxGoodsCents: number | null;
  maxOutstandingCents: number | null;
};
export type PurchasePolicy = typeof DEFAULT_PURCHASE_POLICY & {
  riderTiers: Record<PurchaseRiderTier, PurchaseRiderTierRule>;
};
const NUMERIC_POLICY_KEYS = Object.keys(DEFAULT_PURCHASE_POLICY).filter(
  (k) => k !== "enabled" && k !== "autoReceiptHours",
);
function optionalLimit(value: unknown, label: string, min: number, max: number) {
  return value === null || value === undefined || value === ""
    ? null
    : integer(value, label, min, max);
}
export function riderTiers(value: any): PurchasePolicy["riderTiers"] {
  if (value !== undefined && (!value || typeof value !== "object" || Array.isArray(value)))
    throw new BadRequestException("接单身份设置无效");
  return Object.fromEntries(
    PURCHASE_RIDER_TIERS.map((tier) => {
      const row = value?.[tier] ?? {};
      const label = PURCHASE_RIDER_TIER_LABELS[tier];
      if (typeof row !== "object" || Array.isArray(row))
        throw new BadRequestException(`${label}设置无效`);
      const enabled = row.enabled ?? true;
      if (typeof enabled !== "boolean")
        throw new BadRequestException(`${label}开关无效`);
      const maxGoodsCents = optionalLimit(row.maxGoodsCents, `${label}单笔垫付上限`, 1, 1000000);
      const maxOutstandingCents = optionalLimit(
        row.maxOutstandingCents,
        `${label}累计垫付上限`,
        maxGoodsCents ?? 1,
        5000000,
      );
      return [tier, { enabled, maxGoodsCents, maxOutstandingCents }];
    }),
  ) as PurchasePolicy["riderTiers"];
}
export function integer(
  value: unknown,
  label: string,
  min = 0,
  max = 100000000,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new BadRequestException(`${label}必须为${min}至${max}之间的整数`);
  }
  return value;
}
export function text(value: unknown, label: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new BadRequestException(`${label}不能为空且不能超过${max}字`);
  return value.trim();
}
export function urls(value: unknown, label = "购买凭证"): string[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 6 ||
    value.some(
      (v) => typeof v !== "string" || !/^https:\/\//.test(v) || v.length > 2048,
    )
  ) {
    throw new BadRequestException(`请上传1至6张${label}`);
  }
  return [...new Set(value)];
}
export function policy(value: any): PurchasePolicy {
  const merged: Record<string, any> = {
    ...DEFAULT_PURCHASE_POLICY,
    ...(value || {}),
  };
  if (typeof merged.enabled !== "boolean")
    throw new BadRequestException("服务开关无效");
  for (const key of NUMERIC_POLICY_KEYS) integer(merged[key], key);
  integer(merged.maxShops, "最多店铺", 1, 5);
  integer(merged.maxQuantity, "最多商品件数", 1, 100);
  integer(merged.maxGoodsCents, "每单垫款限额", 1, 1000000);
  integer(
    merged.maxOutstandingCents,
    "累计垫款限额",
    merged.maxGoodsCents,
    5000000,
  );
  integer(merged.changeTimeoutMinutes, "变更确认时限", 1, 60);
  integer(merged.autoReceiptHours, "自动确认收货小时数", 1, 720);
  return {
    ...Object.fromEntries(
      Object.keys(DEFAULT_PURCHASE_POLICY).map((k) => [k, merged[k]]),
    ),
    riderTiers: riderTiers(merged.riderTiers),
  } as PurchasePolicy;
}
export const money = (cents: number) => cents / 100;
export const cents = (amount: unknown) => Math.round(Number(amount || 0) * 100);
export const canonicalShops = (ids: string[]) => [...new Set(ids)].sort();
export function matchCombination(shopIds: string[], rules: any[]) {
  const key = canonicalShops(shopIds).join("|");
  if (shopIds.length === 1) return null;
  const rule = rules.find(
    (r) =>
      r.enabled &&
      Array.isArray(r.shopIds) &&
      canonicalShops(r.shopIds).join("|") === key,
  );
  if (!rule)
    throw new BadRequestException("这些店铺未配置为可合单组合，请分开下单");
  return rule;
}
export function stableHash(value: any): string {
  const sort = (v: any): any =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sort(v[k])]),
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(sort(value)))
    .digest("hex");
}
export function isOpen(shop: any, now = new Date()): boolean {
  if (!shop.enabled) return false;
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return (
    shop.opensAt === shop.closesAt ||
    (shop.opensAt < shop.closesAt
      ? clock >= shop.opensAt && clock < shop.closesAt
      : clock >= shop.opensAt || clock < shop.closesAt)
  );
}
export function assertClock(value: unknown): string {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    throw new BadRequestException("营业时间须为HH:mm");
  return value;
}
export function distanceMeters(a: any, b: any): number {
  const rad = (n: number) => (n * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude),
    dLng = rad(b.longitude - a.longitude);
  const v =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return Math.round(
    6371000 * 2 * Math.atan2(Math.sqrt(v), Math.sqrt(Math.max(0, 1 - v))),
  );
}
// Canonical ordering makes the quoted route independent of cart insertion order.
export function purchaseRoute(shops: any[], destination: any) {
  let cursor = destination;
  const remaining = [...shops].sort((a, b) => a.id.localeCompare(b.id)),
    backwards = [];
  let meters = 0;
  while (remaining.length) {
    remaining.sort(
      (a, b) =>
        distanceMeters(cursor, a) - distanceMeters(cursor, b) ||
        a.id.localeCompare(b.id),
    );
    const next = remaining.shift();
    meters += distanceMeters(cursor, next);
    backwards.push(next);
    cursor = next;
  }
  return { shops: backwards.reverse(), meters };
}
