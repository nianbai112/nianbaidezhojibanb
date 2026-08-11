import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import sharp from 'sharp';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { AiRuntimeService, type AiModerationResult } from './ai-runtime.service';

const jsQR = require('jsqr') as (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' },
) => { data?: string } | null;

type QrDecision = 'approve' | 'reject' | 'manual';

interface ReviewImagesInput {
  regionId?: string | null;
  userId?: string | null;
  approvalType?: string | null;
  targetType: 'post' | 'comment';
  imageUrls: string[];
}

interface QrScanHit {
  imageUrl: string;
  decodedText?: string;
  category: string;
  decision: QrDecision;
  reason: string;
  confidence: number;
}

interface ScanCacheValue {
  hit: QrScanHit | null;
  expireAt: number;
}

@Injectable()
export class QrcodeModerationService {
  private readonly scanCache = new Map<string, ScanCacheValue>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRuntime: AiRuntimeService,
    private readonly redis: RedisService,
  ) {}

  async reviewImages(input: ReviewImagesInput): Promise<AiModerationResult | null> {
    const imageUrls = [...new Set((input.imageUrls || []).map((url) => String(url || '').trim()).filter(Boolean))];
    if (!imageUrls.length || !input.regionId) return null;

    const settings = await this.getNoteSettings(input.regionId);
    const enabledKey = input.targetType === 'comment' ? 'enable_comment_qrcode_filter' : 'enable_qrcode_filter';
    if (!this.flag(settings[enabledKey])) return null;
    if (this.isWhitelisted(input.userId, settings.qrcode_whitelist_user_ids)) return null;
    const manualFallback = this.shouldTransferFailureToManual(settings);

    const hits: QrScanHit[] = [];
    for (const imageUrl of imageUrls.slice(0, 12)) {
      const hit = await this.scanImage(imageUrl);
      if (!hit) continue;
      if (hit.decision === 'approve') continue;
      hits.push(hit);
      if (hit.decision === 'reject') break;
    }

    if (!hits.length && this.shouldUseAiFallback(settings)) {
      const aiHit = await this.reviewWithVisionAi(imageUrls.slice(0, 3), input, manualFallback);
      if (aiHit && aiHit.decision !== 'approve') hits.push(aiHit);
    }

    if (!hits.length) return null;
    const rejectHit = hits.find((item) => item.decision === 'reject');
    const primary = rejectHit || hits[0];
    const decision = primary.decision === 'reject' || !manualFallback ? 'reject' : 'manual';
    const rawReason = primary.reason || (decision === 'reject' ? '图片包含违规二维码' : '图片疑似包含二维码，已转人工审核');
    const reason = !manualFallback && decision === 'reject'
      ? rawReason.replace(/已?转入?人工(审核|复核)?/g, '已按配置自动拦截')
      : rawReason;

    return {
      decision,
      reason,
      labels: ['qrcode_filter', 'image_qrcode', primary.category, input.targetType],
      score: Math.max(0.7, Math.min(1, primary.confidence || 0.85)),
      raw: JSON.stringify({
        hits,
        replacementUrl: settings.qrcode_replace_image_url || '',
        checkedImages: imageUrls.length,
      }),
      fallbackType: 'qrcode_filter',
      skipped: true,
    };
  }

  private async getNoteSettings(regionId: string) {
    const config = await this.prisma.config
      .findUnique({
        where: { key: `content.note_settings.${regionId}` },
        select: { value: true },
      })
      .catch(() => null);
    return (config?.value as Record<string, any>) || {};
  }

  private flag(value: any) {
    if (value === true || value === 1 || value === '1') return true;
    if (typeof value === 'string') return ['true', 'yes', 'on', 'enabled'].includes(value.toLowerCase());
    return Boolean(value);
  }

  private isWhitelisted(userId?: string | null, rawList?: any) {
    if (!userId) return false;
    const list = Array.isArray(rawList) ? rawList : String(rawList || '').split(/[,\n]/);
    return list.map((item) => String(item || '').trim()).includes(String(userId));
  }

  private shouldUseAiFallback(settings: Record<string, any>) {
    const enabled = settings.enable_ai_qrcode_fallback ?? settings.ai_qrcode_fallback_enabled ?? 1;
    return this.flag(enabled);
  }

  private shouldTransferFailureToManual(settings: Record<string, any>) {
    const enabled = settings.ai_review_failure_to_manual
      ?? settings.ai_review_failed_to_manual
      ?? settings.ai_manual_fallback
      ?? 1;
    return this.flag(enabled);
  }

  private cacheKey(imageUrl: string) {
    return createHash('sha256').update(imageUrl).digest('hex');
  }

  private async scanImage(imageUrl: string): Promise<QrScanHit | null> {
    const cacheKey = this.cacheKey(imageUrl);
    const redisKey = `ai:qrcode:scan:${cacheKey}`;
    const redisCached = await this.redis.getJson<ScanCacheValue>(redisKey).catch(() => null);
    if (redisCached && redisCached.expireAt > Date.now()) return redisCached.hit;

    const cached = this.scanCache.get(cacheKey);
    if (cached && cached.expireAt > Date.now()) return cached.hit;

    let hit: QrScanHit | null = null;
    try {
      const buffer = await this.loadImageBuffer(imageUrl);
      if (buffer) {
        const decodedText = await this.decodeQr(buffer);
        if (decodedText) hit = this.classifyDecoded(imageUrl, decodedText);
      }
    } catch {
      hit = null;
    }

    const cacheValue = { hit, expireAt: Date.now() + 6 * 60 * 60 * 1000 };
    this.scanCache.set(cacheKey, cacheValue);
    await this.redis.setJson(redisKey, cacheValue, 6 * 60 * 60).catch(() => undefined);
    if (this.scanCache.size > 1000) {
      const firstKey = this.scanCache.keys().next().value;
      if (firstKey) this.scanCache.delete(firstKey);
    }
    return hit;
  }

  private async loadImageBuffer(imageUrl: string): Promise<Buffer | null> {
    const raw = String(imageUrl || '').trim();
    if (!raw) return null;

    const dataUrlMatch = raw.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
    if (dataUrlMatch) return Buffer.from(dataUrlMatch[1], 'base64');

    if (/^https?:\/\//i.test(raw)) {
      const response = await axios.get<ArrayBuffer>(raw, {
        responseType: 'arraybuffer',
        timeout: 8000,
        maxContentLength: 10 * 1024 * 1024,
        validateStatus: (status) => status >= 200 && status < 300,
      });
      return Buffer.from(response.data);
    }

    const localPath = await this.resolveLocalUploadPath(raw);
    return localPath ? fs.readFile(localPath) : null;
  }

  private async resolveLocalUploadPath(imageUrl: string) {
    const clean = imageUrl.split('?')[0].replace(/^https?:\/\/[^/]+/i, '');
    if (!/^\/?uploads\//.test(clean)) return '';
    const relative = clean.replace(/^\/?uploads\//, '');
    const roots = [
      process.env.UPLOAD_DIR,
      path.resolve(process.cwd(), 'uploads'),
      path.resolve(process.cwd(), 'backend/uploads'),
      path.resolve(__dirname, '../../../uploads'),
    ].filter(Boolean) as string[];

    for (const root of roots) {
      const fullPath = path.resolve(root, relative);
      if (!fullPath.startsWith(path.resolve(root))) continue;
      try {
        await fs.access(fullPath);
        return fullPath;
      } catch {
        // Try the next local upload root.
      }
    }
    return '';
  }

  private async decodeQr(buffer: Buffer): Promise<string> {
    const attempts = [
      { maxWidth: 1800, threshold: 0 },
      { maxWidth: 2400, threshold: 0 },
      { maxWidth: 1800, threshold: 145 },
      { maxWidth: 1800, threshold: 190 },
    ];

    for (const attempt of attempts) {
      const base = sharp(buffer, { animated: false, limitInputPixels: 24_000_000 })
        .rotate()
        .resize({ width: attempt.maxWidth, height: attempt.maxWidth, fit: 'inside', withoutEnlargement: true });
      const pipeline = attempt.threshold ? base.grayscale().threshold(attempt.threshold) : base;
      const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
      const pixels = this.toRgbaPixels(data, info.channels || 4);
      const code = jsQR(pixels, info.width, info.height, { inversionAttempts: 'attemptBoth' });
      const text = String(code?.data || '').trim();
      if (text) return text;
    }
    return '';
  }

  private toRgbaPixels(data: Buffer, channels: number) {
    if (channels === 4) {
      return new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
    }

    const count = Math.floor(data.length / Math.max(1, channels));
    const pixels = new Uint8ClampedArray(count * 4);
    for (let i = 0; i < count; i += 1) {
      const source = i * channels;
      const target = i * 4;
      const r = data[source] ?? 0;
      const g = channels >= 3 ? data[source + 1] : r;
      const b = channels >= 3 ? data[source + 2] : r;
      pixels[target] = r;
      pixels[target + 1] = g;
      pixels[target + 2] = b;
      pixels[target + 3] = channels === 2 ? data[source + 1] ?? 255 : 255;
    }
    return pixels;
  }

  private classifyDecoded(imageUrl: string, decodedText: string): QrScanHit {
    const text = decodedText.trim();
    const internal = this.isInternalQrText(text);
    if (internal) {
      return {
        imageUrl,
        decodedText: text,
        category: 'internal',
        decision: 'approve',
        reason: '平台内部二维码，允许通过',
        confidence: 0.9,
      };
    }

    const lower = text.toLowerCase();
    let category = 'unknown';
    let decision: QrDecision = 'manual';
    let reason = '图片包含二维码，内容无法确定，已转人工审核';

    if (/pay|wxp:\/\/|tenpay|alipay|qr\.alipay|收款|付款/.test(lower)) {
      category = 'payment';
      decision = 'reject';
      reason = '图片包含收款或支付二维码，已拦截';
    } else if (/wechat|weixin|u\.wechat|work\.weixin|qm\.qq|mqqapi|qq\.com/.test(lower)) {
      category = 'contact';
      decision = 'reject';
      reason = '图片包含微信/QQ 等联系方式二维码，已拦截';
    } else if (/^https?:\/\//i.test(text)) {
      category = 'external_link';
      decision = 'reject';
      reason = '图片包含外部链接二维码，已拦截';
    } else if (/[\w.-]+@[\w.-]+\.\w+|(?:微信|vx|v信|qq)[:：]?\w+/i.test(text)) {
      category = 'contact';
      decision = 'reject';
      reason = '图片包含联系方式二维码，已拦截';
    }

    return {
      imageUrl,
      decodedText: text,
      category,
      decision,
      reason,
      confidence: decision === 'reject' ? 0.95 : 0.82,
    };
  }

  private isInternalQrText(text: string) {
    const raw = String(text || '').trim();
    if (!raw) return false;
    if (/^\/?(pages|pagesA|pagesB|pagesC|subpkg)\//.test(raw)) return true;
    if (/^(lingmeng|xiaoyi):\/\//i.test(raw)) return true;

    let url: URL | null = null;
    try {
      url = new URL(raw);
    } catch {
      return false;
    }

    const allowedHosts = this.internalHosts();
    const host = url.hostname.toLowerCase();
    return allowedHosts.some((item) => host === item || host.endsWith(`.${item}`));
  }

  private internalHosts() {
    const envValues = [
      process.env.PUBLIC_BASE_URL,
      process.env.PUBLIC_API_URL,
      process.env.APP_URL,
      process.env.CORS_ORIGIN,
      process.env.MINIAPP_DOMAIN,
      process.env.SITE_DOMAIN,
      process.env.DOMAIN,
    ];
    return [
      ...new Set(
        envValues
          .flatMap((value) => String(value || '').split(','))
          .map((value) => value.trim())
          .filter(Boolean)
          .map((value) => {
            try {
              return new URL(value).hostname.toLowerCase();
            } catch {
              return value.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
            }
          })
          .filter(Boolean),
      ),
    ];
  }

  private async reviewWithVisionAi(imageUrls: string[], input: ReviewImagesInput, manualFallback: boolean): Promise<QrScanHit | null> {
    if (!imageUrls.length) return null;
    const content = [
      {
        type: 'text',
        text:
          '请判断这些校园社区图片中是否包含二维码、小程序码、群码、收款码或引流码。只输出 JSON：{"hasQr":true|false,"decision":"approve|reject|manual","category":"internal|external_link|payment|contact|unknown|none","reason":"中文原因","confidence":0到1}。平台内部小程序路径可通过，外部链接、联系方式、收款码应拒绝，不确定转人工。',
      },
      ...imageUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
    ];

    try {
      const detail = await this.aiRuntime.callChatDetailed(
        [
          { role: 'system', content: '你是校园本地生活平台图片安全审核员，只输出 JSON。' },
          { role: 'user', content },
        ],
        { temperature: 0.1, maxTokens: 300, purpose: 'moderation', source: 'qrcode_vision_review', regionId: input.regionId || undefined },
      );
      const parsed = this.extractJson(detail.content);
      if (!parsed || !parsed.hasQr) return null;
      const rawDecision: QrDecision = ['approve', 'reject', 'manual'].includes(parsed.decision) ? parsed.decision : 'manual';
      const decision: QrDecision = rawDecision === 'manual' && !manualFallback ? 'reject' : rawDecision;
      return {
        imageUrl: imageUrls[0],
        category: String(parsed.category || 'unknown'),
        decision,
        reason: String(parsed.reason || (decision === 'reject' ? 'AI识别图片疑似包含二维码，已按配置自动拦截' : 'AI识别图片疑似包含二维码，已转人工审核')),
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.75)),
      };
    } catch (error: any) {
      if (!manualFallback) return null;
      const message = String(error?.message || 'AI图片识别失败').slice(0, 160);
      return {
        imageUrl: imageUrls[0],
        category: 'vision_error',
        decision: 'manual',
        reason: `二维码图片AI兜底识别失败，已转人工审核：${message}`,
        confidence: 0.72,
      };
    }
  }

  private extractJson(text: string) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1] || raw;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}
