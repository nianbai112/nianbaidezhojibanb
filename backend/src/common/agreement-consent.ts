import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma, PrismaClient, RichTextContent, UserAgreementConsent } from '@prisma/client';
import { createHash } from 'crypto';

export const AGREEMENT_DEFINITIONS = [
  { type: 'TERMS_OF_SERVICE', title: '用户协议', scene: 'login', isRequired: true },
  { type: 'PRIVACY_POLICY', title: '隐私政策', scene: 'login', isRequired: true },
  { type: 'CONTENT_RULES', title: '社区内容规范', scene: 'post', isRequired: true },
  { type: 'PAYMENT_RULES', title: '支付与退款规则', scene: 'payment', isRequired: true },
  { type: 'PINNING_SERVICE', title: '付费置顶服务说明', scene: 'paid_pinning', isRequired: true },
  { type: 'DORM_SHOP_RULES', title: '宿舍小店经营规范', scene: 'dorm_shop', isRequired: true },
  { type: 'RIDER_RULES', title: '骑手服务规范', scene: 'rider', isRequired: true },
  { type: 'MERCHANT_RULES', title: '商家入驻与经营规范', scene: 'merchant', isRequired: true },
  { type: 'REGION_AGENT_RULES', title: '区域合作入驻规则', scene: 'city_agent', isRequired: true },
] as const;

const ALIASES: Record<string, string> = {
  SERVICE: 'TERMS_OF_SERVICE', USER: 'TERMS_OF_SERVICE', TERMS: 'TERMS_OF_SERVICE', PRIVACY: 'PRIVACY_POLICY',
  CONTENT: 'CONTENT_RULES', POST: 'CONTENT_RULES', PAYMENT: 'PAYMENT_RULES', PAY: 'PAYMENT_RULES',
  PINNING: 'PINNING_SERVICE', PAID_PINNING: 'PINNING_SERVICE', DORM_SHOP: 'DORM_SHOP_RULES', DORMSHOP: 'DORM_SHOP_RULES',
  RIDER: 'RIDER_RULES', MERCHANT: 'MERCHANT_RULES', CITY_AGENT: 'REGION_AGENT_RULES', REGION_AGENT: 'REGION_AGENT_RULES',
};

export type AgreementDefinition = (typeof AGREEMENT_DEFINITIONS)[number];
export type AgreementReadClient = Pick<Prisma.TransactionClient, 'richTextContent'>;
export type AgreementProof = {
  type?: unknown;
  code?: unknown;
  document_id?: unknown;
  documentId?: unknown;
  version?: unknown;
  content_hash?: unknown;
  contentHash?: unknown;
  region_id?: unknown;
  regionId?: unknown;
};
export type AgreementConsentContext = {
  regionId?: unknown;
  scene?: string;
  source?: string;
  requireContentHash?: boolean;
};

export function normalizeAgreementType(value: unknown): AgreementDefinition {
  const raw = typeof value === 'string' ? value.trim().replace(/[-\s]+/g, '_').toUpperCase() : '';
  const type = ALIASES[raw] || raw;
  const definition = AGREEMENT_DEFINITIONS.find((item) => item.type === type);
  if (!definition) throw new NotFoundException({ code: 'AGREEMENT_TYPE_INVALID', message: '协议不存在' });
  return definition;
}

export function normalizeAgreementRegion(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new BadRequestException({ code: 'AGREEMENT_SCOPE_INVALID', message: '协议校区参数无效' });
  }
  const region = String(value).trim();
  if (region.length > 128 || /[\u0000-\u001f]/.test(region)) {
    throw new BadRequestException({ code: 'AGREEMENT_SCOPE_INVALID', message: '协议校区参数无效' });
  }
  return !region || region === 'global' || region === '__global__' ? null : region;
}

// 不依赖 regionId 的 NULL 排序：先查精确校区，查不到才使用全局协议。
// isShow 是历史发布标记，保留 publishedAt=null 的既有记录；未来的预约发布时间不生效。
export async function findPublishedAgreement(
  client: AgreementReadClient,
  type: unknown,
  regionId: unknown,
  now: Date = new Date(),
): Promise<RichTextContent | null> {
  const definition = normalizeAgreementType(type);
  const region = normalizeAgreementRegion(regionId);
  const findInScope = (scope: string | null) => client.richTextContent.findFirst({
    where: {
      type: definition.type,
      regionId: scope,
      isShow: true,
      OR: [{ publishedAt: null }, { publishedAt: { lte: now } }],
    },
    orderBy: [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }, { id: 'asc' }],
  });
  if (region) {
    const regional = await findInScope(region);
    if (regional) return regional;
  }
  return findInScope(null);
}

export function agreementContentHash(document: Pick<RichTextContent, 'id' | 'type' | 'regionId' | 'title' | 'version' | 'content'>): string {
  return createHash('sha256').update(JSON.stringify([
    document.id, document.type, document.regionId || null, document.title, document.version, document.content,
  ])).digest('hex');
}

function hasReadableContent(content: string): boolean {
  return !!String(content || '')
    .replace(/<(script|style|iframe|object|svg|math|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:nbsp|#160|#x0*a0);/gi, ' ')
    .trim();
}

function requiredProofText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 256 || /[\u0000-\u001f]/.test(value)) {
    throw new BadRequestException({ code: 'AGREEMENT_PROOF_REQUIRED', message: '请先阅读已发布协议，并提交对应的文档编号和版本' });
  }
  return value.trim();
}

type NormalizedProof = { definition: AgreementDefinition; documentId: string; version: string; contentHash: string };

function normalizeProof(proof: AgreementProof, region: string | null, requireContentHash = false): NormalizedProof {
  if (!proof || typeof proof !== 'object' || Array.isArray(proof)) {
    throw new BadRequestException({ code: 'AGREEMENT_PROOF_REQUIRED', message: '请先阅读并确认协议' });
  }
  const documentId = requiredProofText(proof.document_id ?? proof.documentId);
  const version = requiredProofText(proof.version);
  const definition = normalizeAgreementType(proof.type ?? proof.code);
  const suppliedRegion = proof.region_id ?? proof.regionId;
  if (suppliedRegion != null && normalizeAgreementRegion(suppliedRegion) !== region) {
    throw new BadRequestException({ code: 'AGREEMENT_SCOPE_MISMATCH', message: '协议确认校区与当前请求不一致，请重新阅读' });
  }
  const rawHash = proof.content_hash ?? proof.contentHash;
  const contentHash = rawHash == null ? '' : typeof rawHash === 'string' ? rawHash.trim().toLowerCase() : 'invalid';
  if ((requireContentHash && !contentHash) || (contentHash && !/^[0-9a-f]{64}$/.test(contentHash))) {
    throw new BadRequestException({ code: 'AGREEMENT_PROOF_REQUIRED', message: '请重新读取协议并提交正文校验信息' });
  }
  return { definition, documentId, version, contentHash };
}

async function validateNormalizedProof(client: AgreementReadClient, proof: NormalizedProof, region: string | null, now: Date): Promise<RichTextContent> {
  const document = await findPublishedAgreement(client, proof.definition.type, region, now);
  if (!document || !hasReadableContent(document.content)) {
    throw new ConflictException({ code: 'AGREEMENT_UNAVAILABLE', message: '协议尚未发布或已下架，请重新加载后再确认' });
  }
  if (document.id !== proof.documentId || document.version !== proof.version ||
      (proof.contentHash && proof.contentHash !== agreementContentHash(document))) {
    throw new ConflictException({ code: 'AGREEMENT_UPDATED', message: '协议内容或版本已更新，请重新阅读后再确认' });
  }
  return document;
}

// 可用于交互登录前置检查；前置检查不替代记录事务中的再次验证。
export async function validateAgreementProof(
  client: AgreementReadClient,
  proof: AgreementProof,
  regionId: unknown,
  now: Date = new Date(),
): Promise<RichTextContent> {
  const region = normalizeAgreementRegion(regionId);
  return validateNormalizedProof(client, normalizeProof(proof, region), region, now);
}

// 所有读取/写入走同一个 Serializable 事务，冲突必须重跑完整验证，不能沿用上次读到的协议。
// 这保证记录按事务可见的发布状态验证，不锁住后台后续发布，也不保存历史正文快照。
// 旧客户端可继续提交真实 document_id + version；缺少其中任意一个时不能猜测/补成当前协议。
export async function recordAgreementConsents(
  prisma: PrismaClient,
  userId: string,
  proofs: AgreementProof[],
  context: AgreementConsentContext = {},
): Promise<UserAgreementConsent[]> {
  if (typeof userId !== 'string' || !userId.trim()) throw new UnauthorizedException({ code: 'LOGIN_REQUIRED', message: '请先登录' });
  if (!Array.isArray(proofs) || proofs.length < 1 || proofs.length > AGREEMENT_DEFINITIONS.length) {
    throw new BadRequestException({ code: 'AGREEMENT_PROOF_REQUIRED', message: '请提供本次明确确认的协议文档和版本' });
  }
  const region = normalizeAgreementRegion(context.regionId);
  const normalized = proofs.map((proof) => normalizeProof(proof, region, context.requireContentHash));
  if (new Set(normalized.map((proof) => proof.definition.type)).size !== normalized.length) {
    throw new BadRequestException({ code: 'AGREEMENT_PROOF_DUPLICATE', message: '同一次确认不能包含重复协议类型' });
  }
  const scene = typeof context.scene === 'string' ? context.scene.trim().slice(0, 80) : '';
  const source = typeof context.source === 'string' ? context.source.trim().slice(0, 80) : '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const now = new Date();
        const documents: RichTextContent[] = [];
        // 全部校验通过才开始写，登录的两份协议不能只成功记录其中一份。
        for (const proof of normalized) documents.push(await validateNormalizedProof(tx, proof, region, now));
        const results: UserAgreementConsent[] = [];
        for (const document of documents) {
          const data = {
            documentId: document.id,
            scene: scene || document.scene || normalizeAgreementType(document.type).scene,
            source: source || 'miniapp',
            acceptedAt: now,
          };
          results.push(await tx.userAgreementConsent.upsert({
            where: { userId_code_version_regionId: { userId, code: document.type, version: document.version, regionId: region || 'global' } },
            update: data,
            create: { ...data, userId, code: document.type, version: document.version, regionId: region || 'global' },
          }));
        }
        return results;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2034') throw error;
      if (attempt === 2) {
        throw new ConflictException({ code: 'AGREEMENT_CONCURRENT_UPDATE', message: '协议状态正在更新，请重新加载后再确认' });
      }
    }
  }
  throw new ConflictException({ code: 'AGREEMENT_CONCURRENT_UPDATE', message: '协议状态正在更新，请重新加载后再确认' });
}
