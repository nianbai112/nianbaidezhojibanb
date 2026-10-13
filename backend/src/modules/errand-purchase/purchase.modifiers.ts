import { BadRequestException } from "@nestjs/common";
import { integer, text } from "./purchase.policy";

// 口味属性（attribute）每项 1 份，如温度、糖度；加料（extra）按份计价，如珍珠、奶盖。
export type ModifierType = "attribute" | "extra";
export const MAX_MODIFIER_BINDINGS = 12;
export const MAX_MODIFIER_OPTIONS = 40;
export const MAX_LINE_MODIFIERS = 40;

export type ModifierBinding = {
  groupId: string;
  hiddenOptionIds: string[];
  defaultOptionId: string | null;
};
export type ModifierOptionView = {
  id: string;
  name: string;
  priceCents: number;
  maxQuantity: number;
  isDefault: boolean;
  soldOut: boolean;
};
export type ModifierGroupView = {
  id: string;
  name: string;
  type: ModifierType;
  required: boolean;
  maxSelect: number;
  maxTotalQuantity: number;
  options: ModifierOptionView[];
};
export type SelectedModifier = {
  groupId: string;
  groupName: string;
  type: ModifierType;
  optionId: string;
  optionName: string;
  priceCents: number;
  quantity: number;
};
export type ModifierSelection = {
  modifiers: SelectedModifier[];
  modifierCents: number;
  key: string;
};

const bySort = (a: any, b: any) =>
  (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.id).localeCompare(String(b.id));

const idList = (value: unknown): string[] =>
  Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((v) => typeof v === "string" && v.trim())
            .map((v: string) => v.trim()),
        ),
      ]
    : [];

function flag(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new BadRequestException(`${label}参数无效`);
  return value;
}

// Order-independent, so a regrouped library does not split identical cart lines.
export function modifierKey(modifiers: { optionId: string; quantity: number }[] = []) {
  return (Array.isArray(modifiers) ? modifiers : [])
    .map((m) => (m.quantity > 1 ? `${m.optionId}*${m.quantity}` : m.optionId))
    .sort()
    .join(",");
}

export function modifierLineKey(skuId: string, modifiers: { optionId: string; quantity: number }[] = []) {
  const key = modifierKey(modifiers);
  return key ? `${skuId}|${key}` : skuId;
}

export function specText(skuName: string, modifiers: SelectedModifier[] = []) {
  const parts = skuName && skuName !== "标准规格" ? [skuName] : [];
  for (const m of modifiers)
    parts.push(
      m.type === "extra"
        ? `加${m.optionName}${m.quantity > 1 ? `×${m.quantity}` : ""}`
        : m.optionName,
    );
  return parts.join(" / ") || skuName || "";
}

// Stored bindings are read leniently: a removed group simply stops appearing.
export function parseBindings(value: unknown): ModifierBinding[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: ModifierBinding[] = [];
  for (const row of value as any[]) {
    const groupId = typeof row?.groupId === "string" ? row.groupId.trim() : "";
    if (!groupId || seen.has(groupId)) continue;
    seen.add(groupId);
    result.push({
      groupId,
      hiddenOptionIds: idList(row.hiddenOptionIds),
      defaultOptionId:
        typeof row.defaultOptionId === "string" && row.defaultOptionId.trim()
          ? row.defaultOptionId.trim()
          : null,
    });
  }
  return result;
}

// Admin input is validated strictly against the shop's own library.
export function normalizeBindings(value: unknown, shopGroups: any[]): ModifierBinding[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_MODIFIER_BINDINGS)
    throw new BadRequestException(`每个商品最多挂载${MAX_MODIFIER_BINDINGS}个规格组`);
  const byId = new Map(shopGroups.map((g) => [g.id, g]));
  const seen = new Set<string>();
  return value.map((row: any) => {
    const group = byId.get(typeof row?.groupId === "string" ? row.groupId : "");
    if (!group) throw new BadRequestException("规格组不属于当前店铺，请刷新后重试");
    if (seen.has(group.id)) throw new BadRequestException(`「${group.name}」重复挂载`);
    seen.add(group.id);
    if (row.hiddenOptionIds !== undefined && !Array.isArray(row.hiddenOptionIds))
      throw new BadRequestException(`「${group.name}」的隐藏选项格式错误`);
    const optionIds = new Set((group.options || []).map((o: any) => o.id));
    // Options deleted while the product form was open are dropped, not rejected.
    const hiddenOptionIds = idList(row.hiddenOptionIds).filter((id) => optionIds.has(id));
    const requested =
      typeof row.defaultOptionId === "string" && row.defaultOptionId ? row.defaultOptionId : null;
    const defaultOptionId =
      requested && group.type === "attribute" && optionIds.has(requested) && !hiddenOptionIds.includes(requested)
        ? requested
        : null;
    return { groupId: group.id, hiddenOptionIds, defaultOptionId };
  });
}

// What a buyer sees for one product: mounted, enabled groups with visible options,
// in the library's display order so one reorder applies to every product.
export function resolveModifierGroups(bindings: unknown, shopGroups: any[] = []): ModifierGroupView[] {
  const byId = new Map(shopGroups.map((g) => [g.id, g]));
  const result: ModifierGroupView[] = [];
  const mounted = parseBindings(bindings)
    .map((binding) => ({ binding, group: byId.get(binding.groupId) }))
    .filter((row) => row.group?.enabled)
    .sort((a, b) => bySort(a.group, b.group));
  for (const { binding, group } of mounted) {
    const hidden = new Set(binding.hiddenOptionIds);
    const visible = (group.options || [])
      .filter((o: any) => o.enabled && !hidden.has(o.id))
      .sort(bySort);
    if (!visible.length) continue;
    const type: ModifierType = group.type === "extra" ? "extra" : "attribute";
    const maxSelect = type === "attribute" ? Math.max(1, Number(group.maxSelect) || 1) : visible.length;
    const defaults =
      type !== "attribute"
        ? new Set<string>()
        : new Set(
            (binding.defaultOptionId && visible.some((o: any) => o.id === binding.defaultOptionId)
              ? [binding.defaultOptionId]
              : visible.filter((o: any) => o.isDefault).map((o: any) => o.id)
            ).slice(0, maxSelect),
          );
    result.push({
      id: group.id,
      name: group.name,
      type,
      required: !!group.required,
      maxSelect,
      maxTotalQuantity:
        type === "extra" ? Math.max(1, Number(group.maxTotalQuantity) || 1) : maxSelect,
      options: visible.map((o: any) => ({
        id: o.id,
        name: o.name,
        priceCents: o.priceCents,
        maxQuantity: type === "extra" ? Math.max(1, Number(o.maxQuantity) || 1) : 1,
        isDefault: defaults.has(o.id),
        soldOut: !!o.soldOut,
      })),
    });
  }
  return result;
}

/**
 * Validates one cart line's choices and prices them.
 * `useDefaults` serves clients older than this feature, which send no modifiers:
 * default options are applied, and a required group without a default is rejected.
 */
export function selectModifiers(
  groups: ModifierGroupView[],
  input: unknown,
  options: { allowSoldOut?: boolean; useDefaults?: boolean } = {},
): ModifierSelection {
  const legacy = input === undefined || input === null;
  let entries: { optionId: string; quantity: number }[];
  if (legacy) {
    entries = options.useDefaults
      ? groups.flatMap((g) =>
          g.options
            .filter((o) => o.isDefault && (options.allowSoldOut || !o.soldOut))
            .map((o) => ({ optionId: o.id, quantity: 1 })),
        )
      : [];
  } else {
    if (!Array.isArray(input) || input.length > MAX_LINE_MODIFIERS)
      throw new BadRequestException("口味或加料格式错误，请重新选择");
    entries = input.map((row: any) => {
      const optionId = typeof row?.optionId === "string" ? row.optionId.trim() : "";
      if (!optionId) throw new BadRequestException("口味或加料格式错误，请重新选择");
      const quantity = row.quantity === undefined || row.quantity === null ? 1 : row.quantity;
      if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 1)
        throw new BadRequestException("加料份数无效");
      return { optionId, quantity };
    });
  }
  const index = new Map<string, { group: ModifierGroupView; option: ModifierOptionView }>();
  for (const group of groups) for (const option of group.options) index.set(option.id, { group, option });
  const chosen = new Map<string, number>();
  for (const entry of entries) {
    const found = index.get(entry.optionId);
    if (!found) throw new BadRequestException("所选口味或加料已下架，请重新选择");
    const { group, option } = found;
    if (chosen.has(option.id)) throw new BadRequestException(`「${option.name}」重复选择，请刷新后重试`);
    if (option.soldOut && !options.allowSoldOut)
      throw new BadRequestException(`${option.name}已售罄，请重新选择`);
    if (entry.quantity > option.maxQuantity)
      throw new BadRequestException(
        group.type === "extra"
          ? `${option.name}每杯最多加${option.maxQuantity}份`
          : `${group.name}的选项不能选多份`,
      );
    chosen.set(option.id, entry.quantity);
  }
  const modifiers: SelectedModifier[] = [];
  for (const group of groups) {
    const picked = group.options.filter((o) => chosen.has(o.id));
    const total = picked.reduce((n, o) => n + (chosen.get(o.id) || 0), 0);
    if (group.required && !picked.length)
      throw new BadRequestException(
        legacy
          ? `该商品需要选择${group.name}，请更新小程序后重新选择`
          : `请选择${group.name}`,
      );
    if (group.type === "attribute" && picked.length > group.maxSelect)
      throw new BadRequestException(`${group.name}最多选${group.maxSelect}项`);
    if (group.type === "extra" && total > group.maxTotalQuantity)
      throw new BadRequestException(`${group.name}每杯最多加${group.maxTotalQuantity}份`);
    for (const o of picked)
      modifiers.push({
        groupId: group.id,
        groupName: group.name,
        type: group.type,
        optionId: o.id,
        optionName: o.name,
        priceCents: o.priceCents,
        quantity: chosen.get(o.id) as number,
      });
  }
  return {
    modifiers,
    modifierCents: modifiers.reduce((n, m) => n + m.priceCents * m.quantity, 0),
    key: modifierKey(modifiers),
  };
}

export function normalizeModifierGroup(body: any) {
  if (!["attribute", "extra"].includes(body?.type))
    throw new BadRequestException("请选择规格组类型");
  const type: ModifierType = body.type;
  const maxSelect = type === "attribute" ? integer(body.maxSelect ?? 1, "最多选择项数", 1, 20) : 1;
  const group = {
    name: text(body.name, "规格组名称", 20),
    type,
    required: flag(body.required, "必选"),
    maxSelect,
    maxTotalQuantity:
      type === "extra" ? integer(body.maxTotalQuantity ?? 1, "每杯最多份数", 1, 30) : maxSelect,
    enabled: flag(body.enabled, "启用"),
    sortOrder: integer(body.sortOrder ?? 0, "排序", 0, 10000),
  };
  if (!Array.isArray(body.options) || !body.options.length || body.options.length > MAX_MODIFIER_OPTIONS)
    throw new BadRequestException(`请设置1至${MAX_MODIFIER_OPTIONS}个选项`);
  const options = body.options.map((o: any, index: number) => ({
    id: typeof o?.id === "string" && o.id ? o.id : undefined,
    name: text(o?.name, "选项名称", 20),
    priceCents: integer(o?.priceCents ?? 0, "选项加价（分）", 0, 100000),
    maxQuantity: type === "extra" ? integer(o?.maxQuantity ?? 1, "每杯最多份数", 1, 10) : 1,
    isDefault: type === "attribute" ? flag(o?.isDefault ?? false, "默认") : false,
    soldOut: flag(o?.soldOut ?? false, "售罄"),
    enabled: flag(o?.enabled ?? true, "选项启用"),
    sortOrder: integer(o?.sortOrder ?? index, "选项排序", 0, 10000),
  }));
  if (new Set(options.map((o: any) => o.name)).size !== options.length)
    throw new BadRequestException("同一规格组内选项名称不能重复");
  const enabled = options.filter((o: any) => o.enabled);
  if (group.required && !enabled.length)
    throw new BadRequestException("必选规格组至少需要一个启用的选项");
  if (enabled.filter((o: any) => o.isDefault).length > maxSelect)
    throw new BadRequestException(`默认选项不能超过${maxSelect}个`);
  if (options.some((o: any) => o.isDefault && !o.enabled))
    throw new BadRequestException("停用的选项不能设为默认");
  return { group, options };
}
