import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import sharp from 'sharp';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join, normalize } from 'path';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { UploadService } from '../upload/upload.service';
import * as QRCode from 'qrcode';
import { loadWechatMomentsConfig, maskSecret, mergeSettings, SETTINGS_KEY, StoredMomentsSettings, WechatMomentsConfig } from './wechat-moments.config';
import { MomentPosterInput, renderMomentPoster, RenderedPoster } from './wechat-moments.poster';
import { SnsImage, WechatpadClient, WechatpadError } from './wechatpad.client';

/**
 * 审核通过的帖子 → 服务端生成海报 → 通过个微协议发到运营微信号的朋友圈。
 *
 * 规则：Worker 每半小时（整点、半点）跑一次，把这段时间内审核通过、还没发过的帖子
 * 按发帖时间先后取最多 9 条，每条一张海报，合成一条朋友圈（纯图片，无文案）。
 * 超过 9 条的留到下一个半小时。
 */

export const MAX_IMAGES_PER_MOMENT = 9;
const MAX_RENDER_ATTEMPTS = 3;
const MAX_CONSECUTIVE_FAILURES = 3;
const STALE_BATCH_MS = 15 * 60 * 1000;
const LOCK_KEY = 'wechat-moments:run';
const CDN_INFO_CACHE_KEY = 'wechat-moments:cdn-info:sns';
const CDN_INFO_TTL_SECONDS = 150 * 60; // 文档建议 3 小时刷新一次，提前 30 分钟
const STATE_KEY = 'wechat.moments_state';
const SHARE_LINK_DAYS = 3650; // 朋友圈长期可见，二维码不能 30 天就失效

export interface WechatMomentsState {
  startedAt?: string;
  paused?: boolean;
  /** offline = 收到掉线回调自动暂停，重新上线后自动恢复 */
  pauseCode?: string;
  pauseReason?: string;
  online?: boolean;
  onlineChangedAt?: string;
  pausedAt?: string;
  consecutiveFailures?: number;
  lastRunAt?: string;
  lastResult?: string;
}

export interface RunResult {
  status:
    | 'disabled'
    | 'misconfigured'
    | 'paused'
    | 'locked'
    | 'idle'
    | 'no_ready_posts'
    | 'posted'
    | 'partial'
    | 'failed'
    | 'unknown';
  message?: string;
  batchId?: string;
  snsId?: string;
  postIds?: string[];
  missing?: string[];
}

interface PreparedPoster {
  itemId: string;
  postId: string;
  poster: RenderedPoster;
}

@Injectable()
export class WechatMomentsService {
  private readonly logger = new Logger(WechatMomentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly uploadService: UploadService,
    private readonly configService: ConfigService,
  ) {}

  private get db(): any {
    return this.prisma as any;
  }

  async getConfig(): Promise<WechatMomentsConfig> {
    return loadWechatMomentsConfig((key) => this.configService.get(key) ?? process.env[key], await this.getStoredSettings());
  }

  private async getStoredSettings(): Promise<StoredMomentsSettings> {
    const row = await this.db.config.findUnique({ where: { key: SETTINGS_KEY } });
    return row?.value && typeof row.value === 'object' ? { ...(row.value as StoredMomentsSettings) } : {};
  }

  private async saveStoredSettings(settings: StoredMomentsSettings) {
    await this.db.config.upsert({
      where: { key: SETTINGS_KEY },
      update: { value: settings },
      create: { key: SETTINGS_KEY, value: settings, group: 'wechat', desc: '朋友圈自动同步：个微协议接入配置' },
    });
  }

  /** 供测试替换 */
  createClient(config: WechatMomentsConfig): WechatpadClient {
    return new WechatpadClient(config.wechatpad);
  }

  // =====================================================================
  // 主流程
  // =====================================================================

  async runBatch(source: 'cron' | 'manual' = 'cron'): Promise<RunResult> {
    const config = await this.getConfig();
    if (!config.enabled) return { status: 'disabled', message: '朋友圈同步未开启' };
    if (config.missing.length) {
      return { status: 'misconfigured', message: `缺少配置：${config.missing.join(', ')}`, missing: config.missing };
    }

    const state = await this.getState();
    if (!state.startedAt) {
      state.startedAt = this.parseSince(config.since) || new Date().toISOString();
      await this.saveState(state);
    }
    if (state.paused) return { status: 'paused', message: state.pauseReason || '已暂停' };

    const result = await this.redis.withRenewingLock(LOCK_KEY, 60, () => this.execute(config, source));
    if (!result) return { status: 'locked', message: '上一次任务仍在执行' };

    const latest = await this.getState();
    await this.saveState({ ...latest, lastRunAt: new Date().toISOString(), lastResult: `${result.status}${result.message ? `：${result.message}` : ''}` });
    return result;
  }

  private async execute(config: WechatMomentsConfig, source: string): Promise<RunResult> {
    await this.recoverStaleBatches();

    const state = await this.getState();
    if (state.paused) return { status: 'paused', message: state.pauseReason || '已暂停' };

    const since = new Date(state.startedAt || Date.now());
    const candidates = await this.findCandidates(since, MAX_IMAGES_PER_MOMENT);
    if (!candidates.length) return { status: 'idle' };

    // 1. 逐条生成海报（单条失败不影响其他帖子，重试 3 次仍失败则跳过）
    const prepared: PreparedPoster[] = [];
    for (const postId of candidates) {
      const item = await this.db.wechatMomentItem.upsert({
        where: { postId },
        create: { postId, status: 'pending' },
        update: {},
      });
      try {
        const poster = await this.renderForPost(postId, config);
        const posterUrl = await this.storePoster(poster);
        await this.db.wechatMomentItem.update({
          where: { id: item.id },
          data: {
            posterUrl,
            posterWidth: poster.width,
            posterHeight: poster.height,
            posterSize: poster.buffer.length,
            error: null,
          },
        });
        prepared.push({ itemId: item.id, postId, poster });
      } catch (error: any) {
        const attempts = Number(item.attempts || 0) + 1;
        this.logger.warn(`帖子 ${postId} 海报生成失败（第 ${attempts} 次）：${error?.message}`);
        await this.db.wechatMomentItem.update({
          where: { id: item.id },
          data: {
            attempts,
            error: `海报生成失败：${error?.message || error}`.slice(0, 2000),
            status: attempts >= MAX_RENDER_ATTEMPTS ? 'failed' : 'pending',
          },
        });
      }
    }
    if (!prepared.length) return { status: 'no_ready_posts', message: '本轮帖子海报均生成失败' };

    const itemIds = prepared.map((p) => p.itemId);
    const postIds = prepared.map((p) => p.postId);
    const batch = await this.db.wechatMomentBatch.create({
      data: { status: 'uploading', source, imageCount: prepared.length },
    });
    await this.db.wechatMomentItem.updateMany({
      where: { id: { in: itemIds } },
      data: { batchId: batch.id, status: 'posting' },
    });

    const client = this.createClient(config);

    // 2. 上传到自建 CDN。这一步失败时朋友圈肯定没发出，帖子退回队列下次再发。
    const images: SnsImage[] = [];
    try {
      const cdnInfo = await this.getCdnInfo(client);
      for (const { poster } of prepared) {
        const uploaded = await client.uploadSnsImage(cdnInfo, poster.buffer);
        images.push({
          cdnid: uploaded.cdnid,
          width: uploaded.width || poster.width,
          height: uploaded.height || poster.height,
          totalSize: poster.buffer.length,
        });
      }
    } catch (error: any) {
      await this.redis.del(CDN_INFO_CACHE_KEY).catch(() => undefined);
      return this.failBatch(batch.id, itemIds, postIds, error);
    }

    // 3. 发布
    await this.db.wechatMomentBatch.update({ where: { id: batch.id }, data: { status: 'posting' } });
    try {
      const result = await client.postImages(images);
      const partial = result.mediaCount > 0 && result.mediaCount < images.length;
      await this.db.wechatMomentBatch.update({
        where: { id: batch.id },
        data: {
          status: partial ? 'partial' : 'posted',
          snsId: result.snsId,
          postedAt: new Date(),
          response: this.jsonSafe(result.raw),
          error: partial ? `协议只发出了 ${result.mediaCount}/${images.length} 张图片` : null,
        },
      });
      // 已经发出的朋友圈里包含这些帖子，不管是否完整都不再重发，避免重复
      await this.db.wechatMomentItem.updateMany({ where: { id: { in: itemIds } }, data: { status: 'posted', error: null } });
      const next = await this.getState();
      next.consecutiveFailures = 0;
      if (partial) {
        Object.assign(next, this.pauseFields(`多图发布只发出了 ${result.mediaCount}/${images.length} 张，多图参数可能不被协议支持，请与协议方确认后恢复`));
      }
      await this.saveState(next);
      this.logger.log(`朋友圈已发布 sns=${result.snsId} 图片=${images.length}`);
      return {
        status: partial ? 'partial' : 'posted',
        batchId: batch.id,
        snsId: result.snsId,
        postIds,
        message: partial ? `只发出了 ${result.mediaCount}/${images.length} 张` : undefined,
      };
    } catch (error: any) {
      if (error instanceof WechatpadError && error.ambiguous) {
        // 请求可能已经发出：不能自动重试，否则可能重复发同一批图
        const message = `发布请求没有拿到结果（${error.message}），无法确认是否已发出。请在微信里核对后，到后台选择“确认已发”或“重新排队”`;
        await this.db.wechatMomentBatch.update({ where: { id: batch.id }, data: { status: 'unknown', error: message } });
        await this.db.wechatMomentItem.updateMany({ where: { id: { in: itemIds } }, data: { status: 'unknown' } });
        await this.saveState({ ...(await this.getState()), ...this.pauseFields(message) });
        return { status: 'unknown', batchId: batch.id, postIds, message };
      }
      return this.failBatch(batch.id, itemIds, postIds, error);
    }
  }

  /** 确定没发出去：帖子退回队列；连续失败 3 次暂停，避免账号掉线时一直重试 */
  private async failBatch(batchId: string, itemIds: string[], postIds: string[], error: any): Promise<RunResult> {
    const message = String(error?.message || error || '未知错误').slice(0, 2000);
    this.logger.error(`朋友圈发布失败：${message}`);
    await this.db.wechatMomentBatch.update({ where: { id: batchId }, data: { status: 'failed', error: message } });
    await this.db.wechatMomentItem.updateMany({
      where: { id: { in: itemIds } },
      data: { status: 'pending', batchId: null, error: message },
    });
    const state = await this.getState();
    state.consecutiveFailures = Number(state.consecutiveFailures || 0) + 1;
    if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      Object.assign(state, this.pauseFields(`连续 ${state.consecutiveFailures} 次发布失败，已暂停。最近一次错误：${message}`));
    }
    await this.saveState(state);
    return { status: 'failed', batchId, postIds, message };
  }

  /** 进程在上传/发布途中退出留下的批次：上传中的退回队列；发布中的标记为结果未知并暂停 */
  private async recoverStaleBatches() {
    const before = new Date(Date.now() - STALE_BATCH_MS);
    const stale = await this.db.wechatMomentBatch.findMany({
      where: { status: { in: ['uploading', 'posting'] }, updatedAt: { lt: before } },
      select: { id: true, status: true },
    });
    for (const batch of stale) {
      if (batch.status === 'uploading') {
        await this.db.wechatMomentBatch.update({ where: { id: batch.id }, data: { status: 'failed', error: '上传途中进程退出，已退回队列' } });
        await this.db.wechatMomentItem.updateMany({ where: { batchId: batch.id }, data: { status: 'pending', batchId: null } });
      } else {
        const message = '发布途中进程退出，无法确认是否已发出，请在微信里核对后到后台处理';
        await this.db.wechatMomentBatch.update({ where: { id: batch.id }, data: { status: 'unknown', error: message } });
        await this.db.wechatMomentItem.updateMany({ where: { batchId: batch.id }, data: { status: 'unknown' } });
        await this.saveState({ ...(await this.getState()), ...this.pauseFields(message) });
      }
    }
  }

  /** 审核通过、还没进过朋友圈的帖子，按发帖时间先后 */
  async findCandidates(since: Date, limit: number): Promise<string[]> {
    const rows = await this.db.post.findMany({
      where: {
        status: 'PUBLISHED',
        auditStatus: 'approved',
        deletedAt: null,
        createdAt: { gte: since },
        OR: [{ wechatMomentItem: { is: null } }, { wechatMomentItem: { is: { status: 'pending' } } }],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    return rows.map((row: any) => row.id);
  }

  // =====================================================================
  // 海报
  // =====================================================================

  async renderForPost(postId: string, config?: WechatMomentsConfig): Promise<RenderedPoster> {
    config = config || (await this.getConfig());
    const input = await this.buildPosterInput(postId, config);
    return renderMomentPoster(input, {
      fontFamily: config.fontFamily,
      fontFile: config.fontFile || undefined,
      fetchImage: (url) => this.fetchImage(url),
    });
  }

  private async buildPosterInput(postId: string, config: WechatMomentsConfig): Promise<MomentPosterInput> {
    const post = await this.db.post.findUnique({
      where: { id: postId },
      include: {
        user: { select: { nickname: true, avatar: true } },
        region: { select: { name: true, logo: true } },
        circle: { select: { name: true } },
        media: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!post) throw new NotFoundException('帖子不存在');

    const template = await this.getPosterTemplate();
    const qrcodeUrl = await this.ensureShareQrcode(post, config, Number(template.version) || 1);

    const images: string[] = [];
    let photoCount = 0;
    let videoCount = 0;
    for (const media of post.media || []) {
      if (media.type === 'IMAGE') {
        photoCount += 1;
        if (media.url) images.push(media.url);
      } else if (media.type === 'VIDEO') {
        videoCount += 1;
        if (media.thumb) images.push(media.thumb);
      }
    }

    // 匿名帖只展示匿名身份，不暴露真实昵称头像
    const anonymous = !!post.isAnonymous;
    const stored = await this.getStoredSettings();
    return {
      postId: post.id,
      authorName: anonymous ? post.anonymousName || '匿名用户' : post.user?.nickname || '同学',
      authorAvatar: anonymous ? post.anonymousAvatar || '' : post.user?.avatar || '',
      circleName: post.circle?.name || '',
      title: this.isDeletedTitle(post.title) ? '' : String(post.title || ''),
      content: String(post.content || ''),
      images,
      photoCount,
      videoCount,
      brandName: stored.brandName || post.region?.name || '校小伴',
      logoUrl: template.logoUrl || post.region?.logo || '',
      qrcodeUrl,
    };
  }

  private isDeletedTitle(title: any): boolean {
    return String(title || '').includes('删除笔记');
  }

  private async getPosterTemplate(): Promise<Record<string, any>> {
    const row = await this.db.config.findUnique({ where: { key: 'content.poster_config' } });
    return row?.value && typeof row.value === 'object' ? (row.value as Record<string, any>) : {};
  }

  /** 复用笔记分享的短码 + 小程序码（channel=wx_moments，长期有效） */
  private async ensureShareQrcode(post: any, config: WechatMomentsConfig, templateVersion: number): Promise<string> {
    const sharerId = config.sharerUserId || post.userId;
    const existing = await this.db.postShareLink.findFirst({
      where: { postId: post.id, sharerId, channel: 'wx_moments', status: 'ACTIVE', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing?.qrcodeUrl) return existing.qrcodeUrl;

    const code = existing?.code || randomBytes(6).toString('base64url');
    const qrcode = await this.uploadService.generateQrcode({
      scene: `s=${code}`,
      page: 'pagesB/post/post',
      width: 430,
      checkPath: true,
    });
    if (existing) {
      await this.db.postShareLink.update({ where: { id: existing.id }, data: { qrcodeUrl: qrcode.url } });
    } else {
      await this.db.postShareLink.create({
        data: {
          code,
          postId: post.id,
          sharerId,
          regionId: post.regionId || null,
          channel: 'wx_moments',
          templateVersion,
          expiresAt: new Date(Date.now() + SHARE_LINK_DAYS * 24 * 60 * 60 * 1000),
          qrcodeUrl: qrcode.url,
        },
      });
    }
    return qrcode.url;
  }

  /** 海报存一份到对象存储，方便后台查看；失败不影响发布 */
  private async storePoster(poster: RenderedPoster): Promise<string | null> {
    try {
      const file = {
        fieldname: 'file',
        originalname: 'wechat-moment-poster.jpg',
        encoding: '7bit',
        mimetype: poster.mimeType,
        buffer: poster.buffer,
        size: poster.buffer.length,
      } as Express.Multer.File;
      const result = await this.uploadService.upload(file, { type: 'image', folder: 'wechat-moments', scene: 'admin' });
      return result.url;
    } catch (error: any) {
      this.logger.warn(`海报存档失败（不影响发布）：${error?.message}`);
      return null;
    }
  }

  async fetchImage(url: string): Promise<Buffer | null> {
    const raw = String(url || '').trim();
    if (!raw) return null;
    if (raw.startsWith('data:')) {
      const base64 = raw.split(',')[1];
      return base64 ? Buffer.from(base64, 'base64') : null;
    }
    const localPath = raw.replace(/^\//, '');
    if (localPath.startsWith('uploads/')) {
      const file = normalize(join(process.cwd(), localPath));
      if (file.startsWith(join(process.cwd(), 'uploads')) && existsSync(file)) return readFileSync(file);
    }
    const absolute = /^https?:\/\//i.test(raw) ? raw : this.publicUrl(raw);
    if (!absolute) return null;
    const res = await axios.get(absolute, { responseType: 'arraybuffer', timeout: 15000, maxContentLength: 20 * 1024 * 1024 });
    return Buffer.from(res.data);
  }

  private publicUrl(path: string): string {
    const base = process.env.PUBLIC_BASE_URL || process.env.PUBLIC_API_URL || process.env.APP_URL || '';
    if (!base || !path.startsWith('/')) return '';
    return `${base.replace(/\/+$/, '')}${path}`;
  }

  private async getCdnInfo(client: WechatpadClient): Promise<Record<string, any>> {
    const cached = await this.redis.get(CDN_INFO_CACHE_KEY).catch(() => null);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // ignore broken cache
      }
    }
    const info = await client.getCdnInfo();
    await this.redis.set(CDN_INFO_CACHE_KEY, JSON.stringify(info), CDN_INFO_TTL_SECONDS).catch(() => undefined);
    return info;
  }

  // =====================================================================
  // 状态
  // =====================================================================

  async getState(): Promise<WechatMomentsState> {
    const row = await this.db.config.findUnique({ where: { key: STATE_KEY } });
    return row?.value && typeof row.value === 'object' ? { ...(row.value as WechatMomentsState) } : {};
  }

  private async saveState(state: WechatMomentsState) {
    await this.db.config.upsert({
      where: { key: STATE_KEY },
      update: { value: state },
      create: { key: STATE_KEY, value: state, group: 'wechat', desc: '朋友圈自动同步运行状态' },
    });
  }

  private pauseFields(reason: string, code = ''): WechatMomentsState {
    return { paused: true, pauseCode: code, pauseReason: reason, pausedAt: new Date().toISOString() };
  }

  private parseSince(value: string): string | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  private jsonSafe(value: any) {
    try {
      return JSON.parse(JSON.stringify(value ?? null));
    } catch {
      return null;
    }
  }

  // =====================================================================
  // 后台
  // =====================================================================

  async overview() {
    const config = await this.getConfig();
    const state = await this.getState();
    const since = new Date(state.startedAt || Date.now());
    const [pending, failed, unknown] = await Promise.all([
      this.db.post.count({
        where: {
          status: 'PUBLISHED',
          auditStatus: 'approved',
          deletedAt: null,
          createdAt: { gte: since },
          OR: [{ wechatMomentItem: { is: null } }, { wechatMomentItem: { is: { status: 'pending' } } }],
        },
      }),
      this.db.wechatMomentItem.count({ where: { status: 'failed' } }),
      this.db.wechatMomentBatch.count({ where: { status: { in: ['unknown', 'partial'] } } }),
    ]);
    return {
      enabled: config.enabled,
      missingConfig: config.missing,
      deviceId: config.wechatpad.deviceId,
      online: state.online,
      schedule: '每天整点和半点各执行一次，每次最多 9 张',
      state,
      queue: { pending, failedPosts: failed, batchesNeedAttention: unknown },
    };
  }

  async listBatches(query: any) {
    const page = Math.max(1, Number(query?.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(query?.pageSize) || 20));
    const where = query?.status ? { status: String(query.status) } : {};
    const [list, total] = await Promise.all([
      this.db.wechatMomentBatch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          items: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, postId: true, status: true, posterUrl: true, error: true, post: { select: { title: true, content: true } } },
          },
        },
      }),
      this.db.wechatMomentBatch.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async listFailedItems() {
    return this.db.wechatMomentItem.findMany({
      where: { status: 'failed' },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: { post: { select: { title: true, content: true } } },
    });
  }

  async resume() {
    const state = await this.getState();
    await this.saveState({ ...state, paused: false, pauseCode: '', pauseReason: '', pausedAt: '', consecutiveFailures: 0 });
    return { success: true };
  }

  /** 结果未知/只发出部分的批次：核对后确认已发 */
  async confirmBatch(id: string) {
    const batch = await this.requireAttentionBatch(id);
    await this.db.wechatMomentBatch.update({ where: { id: batch.id }, data: { status: 'posted', postedAt: batch.postedAt || new Date() } });
    await this.db.wechatMomentItem.updateMany({ where: { batchId: batch.id }, data: { status: 'posted' } });
    return { success: true };
  }

  /** 结果未知/只发出部分的批次：核对后确认没发出（或要补发），帖子重新排队 */
  async requeueBatch(id: string) {
    const batch = await this.requireAttentionBatch(id);
    await this.db.wechatMomentBatch.update({ where: { id: batch.id }, data: { status: 'failed', error: `${batch.error || ''}（管理员已重新排队）`.slice(0, 2000) } });
    await this.db.wechatMomentItem.updateMany({ where: { batchId: batch.id }, data: { status: 'pending', batchId: null } });
    return { success: true };
  }

  /** 海报生成失败被跳过的帖子，重新排队 */
  async retryItem(id: string) {
    const item = await this.db.wechatMomentItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('记录不存在');
    if (item.status !== 'failed') throw new BadRequestException('只有生成失败的帖子可以重试');
    await this.db.wechatMomentItem.update({ where: { id }, data: { status: 'pending', attempts: 0, error: null } });
    return { success: true };
  }

  // =====================================================================
  // 接入配置（后台填写）
  // =====================================================================

  async getSettings() {
    const stored = await this.getStoredSettings();
    const config = await this.getConfig();
    return {
      enabled: config.enabled,
      baseUrl: stored.baseUrl || '',
      appKey: stored.appKey || '',
      appSecret: maskSecret(stored.appSecret),
      webhookSecret: maskSecret(stored.webhookSecret),
      cdnBaseUrl: stored.cdnBaseUrl || '',
      cdnToken: maskSecret(stored.cdnToken),
      sharerUserId: stored.sharerUserId || '',
      brandName: stored.brandName || '',
      deviceId: config.wechatpad.deviceId,
      hasAppSecret: !!config.wechatpad.appSecret,
      hasWebhookSecret: !!config.webhookSecret,
      effectiveBaseUrl: config.wechatpad.baseUrl,
      effectiveCdnBaseUrl: config.wechatpad.cdnBaseUrl,
      missing: config.missing,
    };
  }

  async saveSettings(input: Record<string, any>) {
    const baseUrl = String(input?.baseUrl ?? '').trim();
    if (baseUrl && !/^https?:\/\//i.test(baseUrl)) throw new BadRequestException('网关地址需要以 http:// 或 https:// 开头');
    const cdnBaseUrl = String(input?.cdnBaseUrl ?? '').trim();
    if (cdnBaseUrl && !/^https?:\/\//i.test(cdnBaseUrl)) throw new BadRequestException('图片服务地址需要以 http:// 或 https:// 开头');
    for (const [label, value] of [['网关地址', baseUrl], ['图片服务地址', cdnBaseUrl]] as const) {
      if (/wechat-moments|webhook/i.test(value)) {
        throw new BadRequestException(`${label}填成了回调地址。${label}应填 wxbot 的地址（如 https://bot.lichaoshuai.cc）；回调地址要填到 wxbot 控制台的「全局回调地址」`);
      }
    }
    const current = await this.getStoredSettings();
    const next = mergeSettings(current, input || {});
    // 换了账号或网关，缓存的 CDN 凭证作废
    if (next.appKey !== current.appKey || next.baseUrl !== current.baseUrl || next.deviceId !== current.deviceId) {
      await this.redis.del(CDN_INFO_CACHE_KEY).catch(() => undefined);
    }
    await this.saveStoredSettings(next);
    return this.getSettings();
  }

  // =====================================================================
  // 设备与登录
  // =====================================================================

  private async accountClient(requireDevice = true) {
    const config = await this.getConfig();
    const { baseUrl, appKey, appSecret, deviceId } = config.wechatpad;
    if (!baseUrl || !appKey || !appSecret) throw new BadRequestException('请先填写并保存网关地址、app_key、app_secret');
    if (requireDevice && !deviceId) throw new BadRequestException('请先创建设备');
    return this.createClient(config);
  }

  async createDevice(specKey?: string) {
    const client = await this.accountClient(false);
    const { deviceId, raw } = await this.wrap(() => client.initDevice(specKey));
    const stored = await this.getStoredSettings();
    await this.saveStoredSettings({ ...stored, deviceId });
    await this.redis.del(CDN_INFO_CACHE_KEY).catch(() => undefined);
    return { deviceId, raw };
  }

  async deviceSpecs() {
    const client = await this.accountClient(false);
    return this.wrap(() => client.deviceSpecs());
  }

  /** 登录二维码：统一转成图片；网关只给二维码内容时由我们生成二维码图片 */
  async loginQr(): Promise<{ mimeType: string; buffer: Buffer } | { imageUrl: string }> {
    const client = await this.accountClient();
    const result = await this.wrap(() => client.loginQrImage());
    if ('buffer' in result) return result;
    if (/\.(png|jpe?g|gif)(\?|$)/i.test(result.url)) return { imageUrl: result.url };
    const buffer = await QRCode.toBuffer(result.url, { type: 'png', width: 360, margin: 2 });
    return { mimeType: 'image/png', buffer };
  }

  async loginStatus() {
    const client = await this.accountClient();
    return this.wrap(() => client.loginStatus());
  }

  async loginPush() {
    const client = await this.accountClient();
    return this.wrap(() => client.loginPush());
  }

  async submitVerifyTicket(ticket: string) {
    if (!String(ticket || '').trim()) throw new BadRequestException('请填写 ticket');
    const client = await this.accountClient();
    return this.wrap(() => client.submitVerifyTicket(String(ticket).trim()));
  }

  async setCallback(callbackUrl: string) {
    const url = String(callbackUrl || '').trim();
    if (url && !/^https:\/\//i.test(url) && !/^http:\/\//i.test(url)) throw new BadRequestException('回调地址需要以 http:// 或 https:// 开头');
    const client = await this.accountClient();
    return this.wrap(() => client.setCallback(url));
  }

  /** 只上传一张测试图，不发朋友圈：确认图片服务（wxcdnd）是否可用 */
  async testImageUpload() {
    const config = await this.getConfig();
    const client = await this.accountClient();
    const image = await sharp({ create: { width: 240, height: 240, channels: 3, background: '#F3F0EA' } }).jpeg().toBuffer();
    const cdnInfo = await this.wrap(() => client.getCdnInfo());
    const uploaded = await this.wrap(() => client.uploadSnsImage(cdnInfo, image));
    await this.redis.set(CDN_INFO_CACHE_KEY, JSON.stringify(cdnInfo), CDN_INFO_TTL_SECONDS).catch(() => undefined);
    return { ok: true, cdnid: uploaded.cdnid, uploadUrl: `${config.wechatpad.cdnBaseUrl}/v1/cdn/upload_sns_image` };
  }

  async resumeWebhook() {
    const client = await this.accountClient();
    return this.wrap(() => client.resumeWebhook());
  }

  /** 协议错误转成后台可读的 400 提示 */
  private async wrap<T>(task: () => Promise<T>): Promise<T> {
    try {
      return await task();
    } catch (error: any) {
      if (error instanceof WechatpadError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  // =====================================================================
  // 协议回调（设备上线/掉线）
  // =====================================================================

  async handleWebhook(rawBody: Buffer, signature: string, body: any) {
    const config = await this.getConfig();
    if (!config.webhookSecret) throw new BadRequestException('未配置 webhook_secret');
    if (!verifyWebhookSignature(config.webhookSecret, rawBody, signature)) {
      throw new BadRequestException('签名校验失败');
    }
    const deviceId = String(body?.device_id || '');
    if (config.wechatpad.deviceId && deviceId && deviceId !== config.wechatpad.deviceId) return { ok: true, ignored: 'other_device' };
    const notifyType = Number(body?.notify_type);
    if (body?.message || !notifyType || body?.contact) return { ok: true };

    const state = await this.getState();
    const now = new Date().toISOString();
    if (notifyType === 1004) {
      Object.assign(state, { online: false, onlineChangedAt: now });
      if (!state.paused) Object.assign(state, this.pauseFields('运营微信号已退出登录或被踢下线，请在后台重新扫码登录', 'offline'));
      this.logger.warn('收到掉线回调，朋友圈同步已暂停');
    } else if (notifyType === 1003) {
      Object.assign(state, { online: true, onlineChangedAt: now });
      if (state.paused && state.pauseCode === 'offline') {
        Object.assign(state, { paused: false, pauseCode: '', pauseReason: '', pausedAt: '', consecutiveFailures: 0 });
        this.logger.log('运营微信号重新上线，朋友圈同步已自动恢复');
      }
    } else {
      return { ok: true };
    }
    await this.saveState(state);
    return { ok: true };
  }

  private async requireAttentionBatch(id: string) {
    const batch = await this.db.wechatMomentBatch.findUnique({ where: { id } });
    if (!batch) throw new NotFoundException('批次不存在');
    if (!['unknown', 'partial'].includes(batch.status)) throw new BadRequestException('只有“结果未知”或“部分发出”的批次需要人工处理');
    return batch;
  }
}

export function verifyWebhookSignature(secret: string, rawBody: Buffer, signature: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const given = String(signature || '').trim().toLowerCase();
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
