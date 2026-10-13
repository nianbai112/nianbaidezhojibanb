// 代买出单小票：骑手接单后给每家店打一张，只列这家店的商品。
// 版式由后台的小票模板决定（区域默认 + 店铺自定义）；买家的姓名、电话、地址和收货码不提供给模板，也就不会被打印。
import { BadRequestException } from "@nestjs/common";

/** A ticket that has not reached the printer by then is useless: the rider is already at the counter. */
export const PURCHASE_TICKET_TTL_MS = 30 * 60_000;
/** Orders accepted longer ago than this are not printed (e.g. after Worker downtime or on first deploy). */
export const PURCHASE_TICKET_WINDOW_MS = 20 * 60_000;
/** Cancel slips are only sent for tickets queued within this window. */
export const PURCHASE_CANCEL_WINDOW_MS = 2 * 60 * 60_000;
export const PURCHASE_PRINT_BIZ = "purchase_stop";
export const PURCHASE_PRINT_BRANDS = ["feie", "yly", "xpyun", "gprinter"];
export const ticketTemplateKey = (regionId: string) =>
  `purchase_ticket_template:${regionId}`;

const CLOCK = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// ==================== 小票模板 ====================

export const TICKET_FIELDS = {
  pickupCode: "取餐码",
  shopName: "店名",
  orderNo: "订单号",
  acceptTime: "接单时间",
  rider: "骑手",
  remark: "备注",
} as const;
type FieldType = keyof typeof TICKET_FIELDS;
export const TICKET_BLOCK_TYPES = [
  ...(Object.keys(TICKET_FIELDS) as FieldType[]),
  "stops",
  "items",
  "text",
  "divider",
  "blank",
  "qrcode",
] as const;
export type TicketBlockType = (typeof TICKET_BLOCK_TYPES)[number];
/** Placeholders usable in text, multi-shop hint and QR blocks. */
export const TICKET_VARIABLES = [
  ...Object.values(TICKET_FIELDS),
  "件数",
  "货款",
  "第几家",
  "店铺数",
];
const SIZES = ["normal", "tall", "wide", "double"] as const;
const ALIGNS = ["left", "center", "right"] as const;
const MAX_BLOCKS = 40;
// Black Feie models reject QR content over 134 characters; leave room for variables.
const MAX_QR_CHARS = 120;

export interface TicketBlock {
  type: TicketBlockType;
  enabled: boolean;
  size: (typeof SIZES)[number];
  align: (typeof ALIGNS)[number];
  bold: boolean;
  /** Prefix printed before a field value, e.g. "订单号：". */
  label: string;
  /** Content of text / stops / qrcode blocks; may contain {变量}. */
  text: string;
  showSpec: boolean;
  showPrice: boolean;
  bigQuantity: boolean;
}
export interface TicketTemplate {
  paperWidth: 58 | 80;
  copies: number;
  voice: boolean;
  cut: boolean;
  blocks: TicketBlock[];
}

const block = (type: TicketBlockType, extra: Partial<TicketBlock> = {}): TicketBlock => ({
  type,
  enabled: true,
  size: "normal",
  align: "left",
  bold: false,
  label: "",
  text: "",
  showSpec: true,
  showPrice: true,
  bigQuantity: true,
  ...extra,
});

/** The built-in layout, used until a region or shop saves its own. */
export const DEFAULT_TICKET_TEMPLATE: TicketTemplate = {
  paperWidth: 58,
  copies: 1,
  voice: true,
  cut: false,
  blocks: [
    block("pickupCode", { label: "代买 #", size: "double", align: "center" }),
    block("shopName", { align: "center" }),
    block("divider"),
    block("text", { text: "取餐码：{取餐码}（骑手报码取货）" }),
    block("orderNo", { label: "订单号：" }),
    block("acceptTime", { label: "接单：" }),
    block("rider", { label: "骑手：" }),
    block("stops", { text: "本单共{店铺数}家店，这是第{第几家}家" }),
    block("divider"),
    block("items", { bold: true }),
    block("divider"),
    block("text", { text: "共{件数}件  参考货款 ¥{货款}" }),
    block("text", { text: "骑手到店付款" }),
    block("remark", { label: "备注：", size: "double" }),
    block("divider"),
    block("text", { text: "缺货或价格不符请告知骑手", align: "center" }),
  ],
};

function clean(value: unknown, label: string, max: number) {
  const text = String(value ?? "").replace(/\r\n?/g, "\n");
  if (Array.from(text).length > max)
    throw new BadRequestException(`${label}不能超过 ${max} 个字`);
  return text;
}

/** Validates an admin-submitted template; throws a readable 400 on bad input. */
export function normalizeTicketTemplate(input: any): TicketTemplate {
  if (!input || typeof input !== "object" || !Array.isArray(input.blocks))
    throw new BadRequestException("小票模板格式不正确");
  if (input.blocks.length > MAX_BLOCKS)
    throw new BadRequestException(`小票最多 ${MAX_BLOCKS} 个模块`);
  const copies = Number(input.copies ?? 1);
  if (!Number.isInteger(copies) || copies < 1 || copies > 3)
    throw new BadRequestException("打印联数只能是 1 到 3");
  const blocks = input.blocks.map((raw: any, index: number): TicketBlock => {
    const where = `第 ${index + 1} 个模块`;
    if (!TICKET_BLOCK_TYPES.includes(raw?.type))
      throw new BadRequestException(`${where}类型不正确`);
    const size = raw.size ?? "normal";
    const align = raw.align ?? "left";
    if (!SIZES.includes(size) || !ALIGNS.includes(align))
      throw new BadRequestException(`${where}的字号或对齐方式不正确`);
    const text = clean(
      raw.text,
      `${where}的内容`,
      raw.type === "qrcode" ? MAX_QR_CHARS : 200,
    );
    if (raw.type === "qrcode" && raw.enabled !== false && !text.trim())
      throw new BadRequestException("二维码内容不能为空");
    return {
      type: raw.type,
      enabled: raw.enabled !== false,
      size,
      align,
      bold: Boolean(raw.bold),
      label: clean(raw.label, `${where}的前缀`, 20).replace(/\n/g, " "),
      text,
      showSpec: raw.showSpec !== false,
      showPrice: raw.showPrice !== false,
      bigQuantity: raw.bigQuantity !== false,
    };
  });
  const enabled = blocks.filter((b: TicketBlock) => b.enabled);
  if (!enabled.some((b: TicketBlock) => b.type === "items"))
    throw new BadRequestException("小票必须包含商品列表，店家才知道要做什么");
  if (enabled.filter((b: TicketBlock) => b.type === "qrcode").length > 1)
    throw new BadRequestException("飞鹅云每张小票只能打印一个二维码");
  return {
    paperWidth: Number(input.paperWidth) === 80 ? 80 : 58,
    copies,
    voice: input.voice !== false,
    cut: Boolean(input.cut),
    blocks,
  };
}

/** Stored templates are trusted only after re-validation; a broken one falls back. */
export function storedTicketTemplate(value: unknown): TicketTemplate | null {
  if (!value) return null;
  try {
    return normalizeTicketTemplate(value);
  } catch {
    return null;
  }
}

// ==================== 渲染 ====================

export interface TicketData {
  shopName: string;
  orderNo: string;
  acceptTime: Date;
  rider: string;
  remark?: string | null;
  stopIndex: number;
  stopCount: number;
  items: { name: string; spec?: string | null; quantity: number; unitCents: number }[];
  /** Test prints are clearly marked so the shop does not make them. */
  test?: boolean;
}

export function purchasePickupCode(orderNo: string) {
  return String(orderNo || "").slice(-4).toUpperCase();
}

export function purchaseRiderLabel(
  rider: { realName?: string | null; phone?: string | null; anonymous?: boolean } | null,
) {
  const tail = String(rider?.phone || "").replace(/\D/g, "").slice(-4);
  const first = rider?.anonymous
    ? ""
    : Array.from(String(rider?.realName || "").trim())[0] || "";
  return [first ? `${first}**` : "", tail ? `尾号${tail}` : ""]
    .filter(Boolean)
    .join(" ");
}

/** Escapes text so it can never turn into a printer command. */
function safe(value: unknown) {
  return String(value ?? "")
    .replace(/[<>]/g, (char) => (char === "<" ? "＜" : "＞"))
    .replace(/[\r\n]+/g, " ")
    .trim();
}

function clock(value: Date) {
  const parts = Object.fromEntries(
    CLOCK.formatToParts(value).map((part) => [part.type, part.value]),
  );
  return `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function yuan(cents: number) {
  return (cents / 100).toFixed(2);
}

/** Printed columns: CJK and full-width characters take two. */
function columns(text: string) {
  return Array.from(text).reduce(
    (n, char) => n + (/[ᄀ-￿]/.test(char) && !/[｡-ﾟ]/.test(char) ? 2 : 1),
    0,
  );
}

function styled(content: string, b: Pick<TicketBlock, "size" | "align" | "bold">) {
  let out = b.bold ? `<BOLD>${content}</BOLD>` : content;
  // Feie's own centre-and-double tag; other combinations nest.
  if (b.size === "double" && b.align === "center") return `<CB>${out}</CB>`;
  if (b.size === "double") out = `<B>${out}</B>`;
  else if (b.size === "tall") out = `<L>${out}</L>`;
  else if (b.size === "wide") out = `<W>${out}</W>`;
  if (b.align === "center") return `<C>${out}</C>`;
  if (b.align === "right") return `<RIGHT>${out}</RIGHT>`;
  return out;
}

function variables(data: TicketData) {
  const items = data.items.filter((item) => item.quantity > 0);
  return {
    取餐码: purchasePickupCode(data.orderNo),
    店名: data.shopName,
    订单号: data.orderNo,
    接单时间: clock(data.acceptTime),
    骑手: data.rider,
    备注: data.remark || "",
    件数: String(items.reduce((n, item) => n + item.quantity, 0)),
    货款: yuan(items.reduce((n, item) => n + item.quantity * item.unitCents, 0)),
    第几家: String(data.stopIndex + 1),
    店铺数: String(data.stopCount),
  } as Record<string, string>;
}

function fill(text: string, vars: Record<string, string>) {
  return text.replace(/\{([^{}]+)\}/g, (match, name) =>
    name in vars ? vars[name] : match,
  );
}

function itemLines(b: TicketBlock, data: TicketData, width: number) {
  return data.items
    .filter((item) => item.quantity > 0)
    .map((item) => {
      const quantity = `x${item.quantity}`;
      const price = b.showPrice ? `¥${yuan(item.quantity * item.unitCents)}` : "";
      const amount = b.bigQuantity
        ? `<B>${quantity}</B>${price ? `    ${price}` : ""}`
        : price
          ? `${quantity}${" ".repeat(Math.max(1, width - columns(quantity) - columns(price)))}${price}`
          : quantity;
      return (
        `${styled(safe(item.name), b)}<BR>` +
        (b.showSpec && item.spec ? `${safe(item.spec)}<BR>` : "") +
        `${amount}<BR>`
      );
    })
    .join("");
}

/**
 * Renders a template block by block; `index` points into template.blocks so the
 * editor preview can map printed lines back to the block that produced them.
 */
export function renderTicketParts(template: TicketTemplate, data: TicketData) {
  const width = template.paperWidth === 80 ? 48 : 32;
  const vars = variables(data);
  const text = (value: string, b: TicketBlock) =>
    fill(value, vars)
      .split("\n")
      .map((line) => `${line.trim() ? styled(safe(line), b) : ""}<BR>`)
      .join("");
  const render = (b: TicketBlock) => {
    if (b.type === "divider") return `${"-".repeat(width)}<BR>`;
    if (b.type === "blank") return "<BR>";
    if (b.type === "items") return itemLines(b, data, width);
    if (b.type === "text") return text(b.text, b);
    if (b.type === "stops") return data.stopCount > 1 ? text(b.text, b) : "";
    if (b.type === "qrcode") {
      const code = Array.from(safe(fill(b.text, vars))).slice(0, 134).join("");
      if (!code) return "";
      return b.align === "center" ? `<C><QR>${code}</QR></C>` : `<QR>${code}</QR>`;
    }
    const value = vars[TICKET_FIELDS[b.type as FieldType]];
    return value ? `${styled(safe(`${b.label}${value}`), b)}<BR>` : "";
  };
  const footer = `${template.voice && !data.test ? "<AUDIO-COMMON>" : ""}${template.cut ? "<CUT>" : ""}`;
  return [
    ...(data.test
      ? [{ index: null, markup: `<CB>测试小票</CB><BR><C>仅用于检查版式，请勿制作</C><BR>` }]
      : []),
    ...template.blocks.map((b, index) => ({
      index: index as number | null,
      markup: b.enabled ? render(b) : "",
    })),
    ...(footer ? [{ index: null, markup: footer }] : []),
  ].filter((part) => part.markup);
}

/** Renders a template into Feie markup (other brands adapt it in PrintService). */
export function renderPurchaseTicket(template: TicketTemplate, data: TicketData) {
  return renderTicketParts(template, data)
    .map((part) => part.markup)
    .join("");
}

/** Ready-made layouts the editor can apply in one click. */
export const TICKET_PRESETS: {
  key: string;
  name: string;
  description: string;
  template: TicketTemplate;
}[] = [
  {
    key: "standard",
    name: "标准",
    description: "取餐码、订单、骑手、商品和货款都有，适合大多数店",
    template: DEFAULT_TICKET_TEMPLATE,
  },
  {
    key: "simple",
    name: "简洁",
    description: "只留取餐码、商品和备注，省纸",
    template: {
      ...DEFAULT_TICKET_TEMPLATE,
      blocks: [
        block("pickupCode", { label: "代买 #", size: "double", align: "center" }),
        block("shopName", { align: "center" }),
        block("divider"),
        block("items", { bold: true, showPrice: false }),
        block("remark", { label: "备注：", bold: true }),
        block("divider"),
      ],
    },
  },
  {
    key: "kitchen",
    name: "后厨大字",
    description: "商品名放大加粗，后厨隔远也看得清",
    template: {
      ...DEFAULT_TICKET_TEMPLATE,
      blocks: [
        block("pickupCode", { label: "代买 #", size: "double", align: "center" }),
        block("acceptTime", { label: "接单 ", align: "center" }),
        block("stops", { text: "合单：第{第几家}/{店铺数}家", align: "center" }),
        block("divider"),
        block("items", { size: "double", bold: true, showPrice: false }),
        block("divider"),
        block("remark", { label: "备注：", size: "double", bold: true }),
        block("text", { text: "骑手：{骑手}" }),
        block("text", { text: "缺货请告知骑手", align: "center" }),
      ],
    },
  },
];

/** Sample order used by the editor preview and the test print. */
export function sampleTicketData(shopName?: string): TicketData {
  return {
    shopName: shopName || "示例奶茶店",
    orderNo: "DM1791214199980ddf1cbc8",
    acceptTime: new Date(),
    rider: "张** 尾号1234",
    remark: "少冰，放宿舍楼下",
    stopIndex: 0,
    stopCount: 2,
    items: [
      { name: "杨枝甘露", spec: "大杯 / 少冰 / 加椰果", quantity: 2, unitCents: 1650 },
      { name: "招牌奶茶", spec: "中杯 / 七分糖", quantity: 1, unitCents: 1200 },
    ],
  };
}

export function purchaseCancelTicket(
  input: { shopName: string; orderNo: string; cancelTime: Date },
  template: Pick<TicketTemplate, "paperWidth" | "cut"> = DEFAULT_TICKET_TEMPLATE,
) {
  const line = `${"-".repeat(template.paperWidth === 80 ? 48 : 32)}<BR>`;
  return (
    `<CB>代买单已取消</CB><BR>` +
    `<C>${safe(input.shopName)}</C><BR>${line}` +
    `取餐码：${purchasePickupCode(input.orderNo)}<BR>` +
    `订单号：${safe(input.orderNo)}<BR>` +
    `取消：${clock(input.cancelTime)}<BR>${line}` +
    `<B>请停止制作该单商品</B><BR><AUDIO-CANCEL>${template.cut ? "<CUT>" : ""}`
  );
}

/** Ticket state shown on the order: the latest new-order ticket, plus whether a cancel slip went out. */
export function purchasePrintState(jobs: any[], withError: boolean) {
  const ticket = [...jobs].reverse().find((job) => job.event === "purchase");
  if (!ticket) return null;
  const cancel = jobs.find((job) => job.event === "purchase_cancel");
  return {
    status: ticket.status,
    printedAt: ticket.printedAt || null,
    ...(withError && ticket.errorMessage ? { error: ticket.errorMessage } : {}),
    ...(cancel ? { cancelStatus: cancel.status } : {}),
  };
}
