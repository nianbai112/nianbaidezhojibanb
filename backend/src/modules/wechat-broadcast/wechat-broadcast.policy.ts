import { BadRequestException } from "@nestjs/common";

export type BroadcastKind = "new" | "accepted" | "cancelled";
export type OrderPhase = "available" | "taken" | "closed" | "other";

export const SETTINGS_KEY = "wechat.order_broadcast";
export const OPEN_ROUND_HOURS = 48;

export interface BroadcastSettings {
  enabled: boolean;
  dryRun: boolean;
  /** Only orders paid after this moment are announced, so enabling never floods a group with backlog. */
  enabledAt: string | null;
  minIntervalSeconds: number;
  maxDelayMinutes: number;
  notifyAccepted: boolean;
  notifyCancelled: boolean;
}

export const DEFAULT_SETTINGS: BroadcastSettings = {
  enabled: false,
  dryRun: true,
  enabledAt: null,
  minIntervalSeconds: 5,
  maxDelayMinutes: 10,
  notifyAccepted: true,
  notifyCancelled: true,
};

const EDITABLE = [
  "enabled",
  "dryRun",
  "minIntervalSeconds",
  "maxDelayMinutes",
  "notifyAccepted",
  "notifyCancelled",
] as const;

export function assertKeys(input: any, allowed: readonly string[]) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new BadRequestException("需要对象格式");
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new BadRequestException("包含不允许的字段");
}

export function normalizeSettings(value: unknown): BroadcastSettings {
  const stored =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return { ...DEFAULT_SETTINGS, ...(stored as Partial<BroadcastSettings>) };
}

/** Turning sending on, or leaving dry run, restarts the clock: drafts and older orders are never sent live. */
export function validateSettings(
  input: any,
  current: BroadcastSettings,
  now: Date,
): BroadcastSettings {
  assertKeys(input, EDITABLE);
  const next: BroadcastSettings = { ...current, ...input };
  for (const key of [
    "enabled",
    "dryRun",
    "notifyAccepted",
    "notifyCancelled",
  ] as const)
    if (typeof next[key] !== "boolean")
      throw new BadRequestException(`${key} 必须是开关`);
  for (const [key, min, max, label] of [
    ["minIntervalSeconds", 3, 300, "同群发送间隔"],
    ["maxDelayMinutes", 1, 120, "最长等待时间"],
  ] as const)
    if (!Number.isInteger(next[key]) || next[key] < min || next[key] > max)
      throw new BadRequestException(`${label}应在 ${min}–${max} 之间`);
  const startedSending = next.enabled && !current.enabled;
  const leftDryRun = next.enabled && current.dryRun && !next.dryRun;
  if (startedSending || leftDryRun || !next.enabledAt)
    next.enabledAt = now.toISOString();
  return next;
}

const TAKEN = ["accepted", "in_progress", "arrived", "completed"];
const CLOSED = ["cancelled", "refunding", "refunded"];

export function orderPhase(order: {
  status: string;
  riderId?: string | null;
  payTime?: Date | string | null;
  regionId?: string | null;
  refundStatus?: string | null;
}): OrderPhase {
  const refund = String(order.refundStatus || "none");
  if (CLOSED.includes(order.status) || ["refunding", "refunded"].includes(refund))
    return "closed";
  if (order.riderId && TAKEN.includes(order.status)) return "taken";
  if (
    order.status === "pending_accept" &&
    !order.riderId &&
    order.payTime &&
    order.regionId
  )
    return "available";
  return "other";
}

export interface BroadcastRowState {
  id: string;
  round: number;
  kind: string;
  status: string;
  closedAt: Date | null;
}

export type BroadcastAction =
  | {
      type: "create";
      kind: BroadcastKind;
      round: number;
      status: "pending" | "skipped";
      reason?: string;
    }
  | { type: "skip"; id: string; reason: string }
  | { type: "close"; id: string };

/** A message the group may have seen; its follow-up must be announced. */
export const SHOWN = ["sent", "unknown", "draft"];

/**
 * Decides the next group messages for one order. Each round starts with a
 * "new" message; the round ends with an accepted or cancelled row. A row with
 * status "skipped" still marks how the round ended, so an order returned to the
 * pool can be announced again.
 */
export function decideBroadcast(
  order: {
    status: string;
    riderId?: string | null;
    payTime?: Date | string | null;
    regionId?: string | null;
    refundStatus?: string | null;
    updatedAt: Date | string;
  },
  rows: BroadcastRowState[],
  settings: BroadcastSettings,
  now: Date,
): BroadcastAction[] {
  const phase = orderPhase(order);
  const round = rows.reduce((max, row) => Math.max(max, row.round), 0);
  const find = (kind: BroadcastKind) =>
    rows.find((row) => row.round === round && row.kind === kind);
  const opening = find("new");
  const accepted = find("accepted");
  const cancelled = find("cancelled");
  const maxDelayMs = settings.maxDelayMinutes * 60_000;
  const enabledAt = settings.enabledAt
    ? new Date(settings.enabledAt).getTime()
    : now.getTime();

  if (phase === "available") {
    const paid = order.payTime ? new Date(order.payTime).getTime() : 0;
    if (paid < enabledAt) return [];
    if (round === 0)
      return now.getTime() - paid <= maxDelayMs
        ? [{ type: "create", kind: "new", round: 1, status: "pending" }]
        : [];
    // Returned to the pool after a rider took it: announce it again while the return is recent.
    if (
      accepted &&
      !cancelled &&
      now.getTime() - new Date(order.updatedAt).getTime() <= maxDelayMs
    )
      return [
        { type: "create", kind: "new", round: round + 1, status: "pending" },
      ];
    return [];
  }

  if (!opening || opening.closedAt || opening.status === "sending") return [];
  if (phase !== "taken" && phase !== "closed") return [];
  const followKind: BroadcastKind = phase === "taken" ? "accepted" : "cancelled";
  const existing = phase === "taken" ? accepted : cancelled;
  if (opening.status === "pending") {
    return [
      {
        type: "skip",
        id: opening.id,
        reason: phase === "taken" ? "taken_before_send" : "closed_before_send",
      },
      ...(existing
        ? []
        : [
            {
              type: "create" as const,
              kind: followKind,
              round,
              status: "skipped" as const,
              reason: "not_announced",
            },
          ]),
    ];
  }
  if (!SHOWN.includes(opening.status)) return [{ type: "close", id: opening.id }];
  const notify =
    phase === "taken" ? settings.notifyAccepted : settings.notifyCancelled;
  return [
    ...(existing
      ? []
      : [
          notify
            ? {
                type: "create" as const,
                kind: followKind,
                round,
                status: "pending" as const,
              }
            : {
                type: "create" as const,
                kind: followKind,
                round,
                status: "skipped" as const,
                reason: "notify_disabled",
              },
        ]),
    { type: "close", id: opening.id },
  ];
}

// ---------------------------------------------------------------------------
// Message content. Never includes phone numbers, names, room numbers, pickup
// codes, order remarks or images.
// ---------------------------------------------------------------------------

export interface OrderView {
  orderNo: string;
  purchase: boolean;
  serviceName: string;
  regionName: string;
  riderIncome: number;
  /** 代买：骑手需垫付的商品货款 */
  advance: number | null;
  pickup: string;
  delivery: string;
  dorm: string;
  orderedAt: Date;
}

export function clip(text: string, max: number, keepEnd = false): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return keepEnd
    ? `…${chars.slice(chars.length - max + 1).join("")}`
    : `${chars.slice(0, max - 1).join("")}…`;
}

export function stripSensitive(value: unknown, max = 40): string {
  const text = String(value ?? "")
    .replace(/(?:\+?86[-\s]?)?1[3-9]\d{9}/g, "")
    .replace(
      /(取件码|取货码|提货码|取餐码|验证码|密码|口令)\s*[:：]?\s*[A-Za-z0-9-]+/g,
      "",
    )
    .replace(/\d{6,}/g, "")
    .replace(/[，,；;]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return clip(text, max);
}

const SEPARATOR = /[-－—_/\\]+/;
const BUILDING = /^(.{1,12}?(?:栋|幢|号楼|舍|公寓|苑|斋))/;

/** "8舍-3楼-305" → "8舍"; "5栋512" → "5栋"; a bare room number is dropped. */
export function buildingPart(value: unknown): string {
  const text = stripSensitive(value, 30);
  if (!text) return "";
  const segments = text.split(SEPARATOR).map((s) => s.trim()).filter(Boolean);
  if (segments.length >= 2) return segments[0];
  return text.match(BUILDING)?.[1] || "";
}

export interface DormAddress {
  fullAddress?: string | null;
  dormitoryNumber?: string | null;
  detail?: string | null;
  gender?: number | null;
}

/** The dorm-side address down to the building, never the room. */
export function dormArea(address: DormAddress | null, fallback: unknown): string {
  if (address) {
    const base = stripSensitive(address.fullAddress, 80);
    const building = buildingPart(address.dormitoryNumber);
    const text = [base && clip(base, 28, true), building]
      .filter(Boolean)
      .join(" ");
    if (text) return text;
  }
  const tokens = stripSensitive(fallback, 80).split(" ").filter(Boolean);
  if (tokens.length > 1 && /\d/.test(tokens[tokens.length - 1])) {
    const building = buildingPart(tokens.pop());
    if (building) tokens.push(building);
  }
  return clip(tokens.join(" "), 32, true);
}

export interface DeliveryRequirements {
  rider_gender_requirement?: string;
  handoff_mode?: string;
  dorm_access_rule?: string;
}

/**
 * Dorm gender comes from the order's declared entry rule, cross-checked with
 * the gender saved on the address (1 = 男, 2 = 女). There is no building registry.
 */
export function dormLine(
  requirements: DeliveryRequirements,
  addressGender: number | null | undefined,
  pickupSide: boolean,
): string {
  const declared =
    requirements.dorm_access_rule === "female_only"
      ? "女"
      : requirements.dorm_access_rule === "male_only"
        ? "男"
        : "";
  const contact = addressGender === 1 ? "男" : addressGender === 2 ? "女" : "";
  const who = pickupSide ? "寄件人" : "收件人";
  const parts: string[] = [];
  if (declared && contact && declared !== contact)
    parts.push(`⚠️待核实：订单写${declared}生宿舍，${who}为${contact}生`);
  else if (declared) parts.push(`${declared}生宿舍`);
  else if (contact) parts.push(`${contact}生宿舍（按${who}性别）`);
  else parts.push("未注明男女");
  if (requirements.handoff_mode === "room")
    parts.push(pickupSide ? "到寝室取件" : "送到寝室");
  else if (requirements.handoff_mode === "downstairs") parts.push("楼下交接");
  if (requirements.rider_gender_requirement === "female") parts.push("仅女骑手");
  else if (requirements.rider_gender_requirement === "male")
    parts.push("仅男骑手");
  return parts.join(" · ");
}

export function maskRiderName(
  rider: { realName?: string | null; anonymous?: boolean | null } | null,
): string {
  if (!rider) return "";
  if (rider.anonymous) return "匿名骑手";
  const first = Array.from(String(rider.realName || "").trim())[0];
  return first ? `${first}**` : "";
}

const CLOCK = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function clockParts(date: Date) {
  return Object.fromEntries(
    CLOCK.formatToParts(date).map((part) => [part.type, part.value]),
  );
}

/** Beijing time; the date is shown only when it is not today. */
export function shanghaiTime(date: Date, now: Date): string {
  const at = clockParts(date);
  const today = clockParts(now);
  const time = `${at.hour}:${at.minute}`;
  return at.month === today.month && at.day === today.day
    ? time
    : `${at.month}/${at.day} ${time}`;
}

export function shanghaiDayStart(now: Date): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+08:00`);
}

const yuan = (value: number) => `¥${(Math.round(value * 100) / 100).toFixed(2)}`;

export function renderMessage(
  view: OrderView,
  kind: BroadcastKind,
  round: number,
  extra: { at?: Date | null; rider?: string } = {},
  now = new Date(),
): string {
  const tag =
    round > 1 ? "【重新待接】" : view.purchase ? "【新代买单】" : "【新跑腿单】";
  const title =
    view.purchase && round === 1
      ? view.regionName
      : `${view.serviceName} · ${view.regionName}`;
  const income = `骑手收入：${yuan(view.riderIncome)}`;
  const at = extra.at ? `（${shanghaiTime(extra.at, now)}）` : "";
  const status =
    kind === "new"
      ? "状态：🟡 未接单"
      : kind === "accepted"
        ? `状态：✅ 已接单${extra.rider ? ` · ${extra.rider}` : ""}${at}`
        : `状态：❌ 已取消${at}`;
  return [
    `${tag}${title}`,
    view.purchase && view.advance !== null
      ? `${income}　预计垫付：${yuan(view.advance)}`
      : income,
    `${view.purchase ? "取货" : "取件"}：${view.pickup || "见订单详情"}`,
    `送达：${view.delivery || "见订单详情"}`,
    view.dorm ? `宿舍：${view.dorm}` : "",
    `下单 ${shanghaiTime(view.orderedAt, now)} · 尾号${view.orderNo.slice(-4)}`,
    status,
  ]
    .filter(Boolean)
    .join("\n");
}

export const isGroupWxid = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9_.-]{1,100}@chatroom$/.test(value);
