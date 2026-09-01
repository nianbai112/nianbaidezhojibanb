export type ManagedWechatTemplateContract = {
  platformType: "official" | "miniprogram";
  templateType: string;
  fieldMapping: Record<string, string>;
  requiredTemplateKeys: string[];
  defaultPage?: string;
};

// These are the operator-visible scenes. Their technical fields are release
// configuration: the admin UI/API may toggle them, but must not rewrite IDs,
// variable names, mappings or page paths.
const TECHNICALLY_MANAGED_TEMPLATE_KEYS = new Set([
  "miniprogram:takeaway_order_status",
  "miniprogram:takeaway_merchant_order",
  "miniprogram:takeaway_rider_order",
  "official:errand_accepted",
  "miniprogram:errand_accepted",
  "official:errand_picked",
  "miniprogram:errand_picked",
  "official:errand_delivered",
  "miniprogram:errand_delivered",
  "official:errand_abnormal",
  "miniprogram:post_audit_result",
  "miniprogram:post_comment",
  "miniprogram:comment_reply",
  "official:community_at",
  "official:community_reply",
  "official:community_like",
]);

// Only contracts backed by current product evidence live here. Other managed
// scenes keep using their existing persisted mapping; locking them does not
// silently replace it with an unverified default.
const CONTRACTS: Record<string, ManagedWechatTemplateContract> = {
  "official:errand_accepted": {
    platformType: "official",
    templateType: "errand_accepted",
    fieldMapping: {
      character_string1: "orderNo",
      character_string2: "riderName",
      time3: "estimatedTime",
    },
    requiredTemplateKeys: ["character_string1", "character_string2", "time3"],
  },
  "official:errand_picked": {
    platformType: "official",
    templateType: "errand_picked",
    fieldMapping: { thing1: "orderNo", thing2: "pickupAddress", time3: "estimatedTime" },
    requiredTemplateKeys: ["thing1", "thing2", "time3"],
  },
  "official:errand_delivered": {
    platformType: "official",
    templateType: "errand_delivered",
    fieldMapping: { thing1: "orderNo", time2: "finishedAt", thing3: "remark" },
    requiredTemplateKeys: ["thing1", "time2"],
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
