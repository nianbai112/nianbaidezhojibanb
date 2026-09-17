export type ManagedWechatTemplateContract = {
  platformType: "official" | "miniprogram";
  templateType: string;
  fieldMapping: Record<string, string>;
  requiredTemplateKeys: string[];
  defaultPage?: string;
};

export const ERRAND_NEW_ORDER_TEMPLATE_FIELDS = [
  'orderNo', 'orderAmount', 'serviceName', 'orderTime', 'serviceAddress',
] as const;

// Variable numbers come from the account's actual added template, never the library number.
export function validateErrandNewOrderTemplate(templateId: string, mapping: unknown): string | null {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(String(templateId || ''))) {
    return '模板编号无效，请填写添加后生成的完整模板 ID，不能填写模板库编号 42995';
  }
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return '新单模板字段映射未配置';
  const entries = Object.entries(mapping);
  if (entries.length !== 5 || entries.some(([key]) => !/^[a-z][a-z_]*\d+$/.test(key))
    || ERRAND_NEW_ORDER_TEMPLATE_FIELDS.some(field => entries.filter(([, value]) => value === field).length !== 1)) {
    return '新单模板字段必须对应订单编号、订单金额、服务名称、下单时间、服务地址，变量名须来自模板详情';
  }
  return null;
}

// These are the operator-visible scenes. Their technical fields are release
// configuration: the admin UI/API may toggle them, but must not rewrite IDs,
// variable names, mappings or page paths.
const TECHNICALLY_MANAGED_TEMPLATE_KEYS = new Set([
  "miniprogram:takeaway_order_status",
  "miniprogram:takeaway_merchant_order",
  "miniprogram:takeaway_rider_order",
  "official:new_errand_order",
  "official:errand_accepted",
  "miniprogram:errand_accepted",
  "official:errand_picked",
  "miniprogram:errand_picked",
  "official:errand_delivered",
  "miniprogram:errand_delivered",
  "official:errand_abnormal",
  "miniprogram:welfare_draw",
  "miniprogram:post_audit_result",
  "miniprogram:post_comment",
  "miniprogram:comment_reply",
  "official:community_at",
  "official:community_reply",
  "official:community_like",
]);

// Verified against the account template list from WeChat on 2026-09-17.
// Only contracts backed by current product evidence live here. Other managed
// scenes keep using their existing persisted mapping; locking them does not
// silently replace it with an unverified default.
const CONTRACTS: Record<string, ManagedWechatTemplateContract> = {
  "official:errand_accepted": {
    platformType: "official",
    templateType: "errand_accepted",
    fieldMapping: {
      character_string1: "orderNo",
      thing4: "riderName",
      time6: "estimatedTime",
    },
    requiredTemplateKeys: ["character_string1", "thing4", "time6"],
  },
  "official:errand_picked": {
    platformType: "official",
    templateType: "errand_picked",
    fieldMapping: { character_string1: "orderNo", thing4: "riderName", time3: "pickedAt" },
    requiredTemplateKeys: ["character_string1", "thing4", "time3"],
  },
  "official:errand_delivered": {
    platformType: "official",
    templateType: "errand_delivered",
    fieldMapping: { character_string13: "orderNo", time5: "finishedAt", thing7: "deliveryAddress" },
    requiredTemplateKeys: ["character_string13", "time5", "thing7"],
  },
};

export function normalizeWechatTemplatePlatform(value?: string | null) {
  const platform = String(value || "").trim().toLowerCase();
  return platform === "miniapp" ? "miniprogram" : platform;
}

export function isWechatTemplateTechnicalConfigManaged(
  platformType?: string | null,
  templateType?: string | null,
) {
  const key = `${normalizeWechatTemplatePlatform(platformType)}:${String(templateType || "").trim()}`;
  return TECHNICALLY_MANAGED_TEMPLATE_KEYS.has(key);
}

export function getManagedWechatTemplateContract(
  platformType?: string | null,
  templateType?: string | null,
): ManagedWechatTemplateContract | null {
  const key = `${normalizeWechatTemplatePlatform(platformType)}:${String(templateType || "").trim()}`;
  const contract = CONTRACTS[key];
  if (!contract) return null;
  return {
    ...contract,
    fieldMapping: { ...contract.fieldMapping },
    requiredTemplateKeys: [...contract.requiredTemplateKeys],
  };
}
