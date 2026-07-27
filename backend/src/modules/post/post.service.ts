import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { MediaType, PostStatus, PostType } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { NotifyService } from '../notify/notify.service';
import { AiRuntimeService, type AiModerationResult } from '../ai-runtime/ai-runtime.service';
import { QrcodeModerationService } from '../ai-runtime/qrcode-moderation.service';
import { UserAccessPolicyService } from '../../common/services/user-access-policy.service';
import { InteractionPermissionService } from '../../common/services/interaction-permission.service';
import { MembershipService } from '../membership/membership.service';
import { GrowthService } from '../growth/growth.service';

@Injectable()
export class PostService {
  private readonly logger = new Logger(PostService.name);
  private readonly feedCacheTtl = 20;

  // AUD-P1-017: 公开帖子统一过滤条件
  private readonly publicPostWhere = {
    status: 'PUBLISHED' as const,
    auditStatus: 'approved' as const,
    deletedAt: null,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notifyService: NotifyService,
    private readonly aiRuntime: AiRuntimeService,
    private readonly qrcodeModeration: QrcodeModerationService,
    private readonly userAccess: UserAccessPolicyService,
    private readonly interactionPermission: InteractionPermissionService,
    private readonly membershipService: MembershipService,
    private readonly growthService: GrowthService,
  ) {}

  private stablePayload(value: any): any {
    if (Array.isArray(value)) return value.map((item) => this.stablePayload(item));
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value)
      .sort()
      .reduce((acc: Record<string, any>, key) => {
        acc[key] = this.stablePayload(value[key]);
        return acc;
      }, {});
  }

  private postFeedCacheKey(regionId: string, scope: string, payload: any) {
    const raw = JSON.stringify(this.stablePayload(payload || {}));
    return `post:feed:${regionId || 'all'}:${scope}:${Buffer.from(raw).toString('base64url')}`;
  }

  private async clearPostFeedCache(regionId?: string | null) {
    const scope = regionId ? `post:feed:${regionId}:*` : 'post:feed:*';
    await this.redis.delPattern(scope).catch(() => undefined);
  }

  private async getRegionDefaultCircle(regionId?: string | null) {
    if (!regionId) return null;
    const region = await this.prisma.region.findUnique({
      where: { id: String(regionId) },
      select: { settings: true },
    }).catch(() => null);
    const circleId = String(((region?.settings as any)?.circleConfig?.default_circle_id || '')).trim();
    const baseWhere = { regionId: String(regionId), status: 'active', auditStatus: 'approved' };
    const select = { id: true, name: true, icon: true, cover: true };
    if (circleId) {
      const configured = await this.prisma.circle.findFirst({
        where: { ...baseWhere, id: circleId },
        select,
      }).catch(() => null);
      if (configured) return configured;
    }
    return this.prisma.circle.findFirst({
      where: baseWhere,
      select,
      orderBy: { createdAt: 'asc' },
    }).catch(() => null);
  }

  private normalizePostType(value: any): PostType {
    if (value === 0 || value === '0') return PostType.IMAGE;
    if (value === 1 || value === '1') return PostType.VIDEO;
    if (value === 2 || value === '2') return PostType.AUDIO;
    const normalized = String(value || 'TEXT').toUpperCase();
    return (Object.values(PostType) as string[]).includes(normalized)
      ? (normalized as PostType)
      : PostType.TEXT;
  }

  private normalizeInteractionIntent(value: any): 'share' | 'invite' | 'complaint' | 'help' {
    const normalized = String(value || 'share').trim().toLowerCase();
    if (['invite', 'partner', 'companion', '搭子', '找搭子', '邀约'].includes(normalized)) return 'invite';
    if (['complaint', 'discussion', 'rant', '吐槽', '讨论'].includes(normalized)) return 'complaint';
    if (['help', 'question', 'ask', '求助', '提问'].includes(normalized)) return 'help';
    return 'share';
  }

  private echoActionDefinitions(intent: string, counts: Record<string, number> = {}) {
    const count = (action: string) => Number(counts[action] || 0);
    if (intent === 'invite') return [
      { key: 'join', label: '想一起', count: count('join'), next: 'detail' },
      { key: 'detail', label: '查看报名', count: 0, next: 'detail' },
    ];
    if (intent === 'complaint') return [
      { key: 'same', label: '我也遇到', count: count('same'), next: 'toggle' },
      { key: 'supplement', label: '补充情况', count: count('supplement'), next: 'comment' },
    ];
    if (intent === 'help') return [
      { key: 'answer', label: '我知道', count: count('answer'), next: 'toggle' },
      { key: 'supplement', label: '补充信息', count: count('supplement'), next: 'comment' },
    ];
    return [];
  }

  private buildPostEchoState(post: any) {
    const intent = this.normalizeInteractionIntent(post?.interactionIntent);
    const interactions = Array.isArray(post?.echoInteractions) ? post.echoInteractions : [];
    const counts = interactions.reduce((result: Record<string, number>, item: any) => {
      const action = String(item?.action || '').trim();
      if (action) result[action] = Number(result[action] || 0) + 1;
      return result;
    }, {});
    const participantCount = new Set([
      post?.userId,
      ...interactions.map((item: any) => item?.userId),
    ].filter(Boolean)).size;
    const summaryMap: Record<string, string> = {
      invite: participantCount > 1 ? `${Math.max(0, participantCount - 1)} 人想一起` : '',
      complaint: counts.same ? `${counts.same} 人也遇到` : '',
      help: counts.answer ? `已有 ${counts.answer} 条有效回答` : '',
    };
    return {
      intent,
      counts,
      participantCount,
      summary: summaryMap[intent] || '',
      actions: this.echoActionDefinitions(intent, counts),
    };
  }

  private normalizeTopicIds(dto: any): string[] {
    const raw = dto.topics ?? dto.topic_ids ?? (dto.topic_id ? [dto.topic_id] : []);
    const list = Array.isArray(raw) ? raw : String(raw || '').split(',');
    return [...new Set(list.map((item) => String(item || '').trim()).filter(Boolean))];
  }

  private toInt(value: any): number | undefined {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : undefined;
  }

  private toFloat(value: any): number | undefined {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }

  private toArray(value: any): any[] {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return [value];
  }

  private hasTopicInput(dto: any): boolean {
    return dto.topics !== undefined || dto.topic_ids !== undefined || dto.topic_id !== undefined;
  }

  private normalizeMiniPostTopics(postTopics: any[] = []) {
    return (Array.isArray(postTopics) ? postTopics : [])
      .map((item: any) => {
        const topic = item?.topic || item;
        const id = topic?.id || item?.topicId || item?.topic_id || '';
        const title = topic?.name || topic?.title || item?.name || item?.title || '';
        if (!id) return null;
        return {
          id,
          topic_id: id,
          topicId: id,
          name: title,
          title,
          logo: topic?.cover || topic?.logo || topic?.icon || '',
          cover: topic?.cover || topic?.logo || topic?.icon || '',
          description: topic?.description || '',
          post_count: Number(topic?.postCount || topic?.post_count || 0),
          postCount: Number(topic?.postCount || topic?.post_count || 0),
          status: topic?.status || 'active',
        };
      })
      .filter(Boolean);
  }

  private async syncTopicPostCounts(oldTopicIds: string[], newTopicIds: string[]) {
    const oldSet = new Set((oldTopicIds || []).filter(Boolean));
    const newSet = new Set((newTopicIds || []).filter(Boolean));
    const inc = [...newSet].filter((id) => !oldSet.has(id));
    const dec = [...oldSet].filter((id) => !newSet.has(id));
    await Promise.all([
      inc.length
        ? this.prisma.topic.updateMany({ where: { id: { in: inc } }, data: { postCount: { increment: 1 } } }).catch(() => undefined)
        : Promise.resolve(),
      dec.length
        ? this.prisma.topic.updateMany({ where: { id: { in: dec }, postCount: { gt: 0 } }, data: { postCount: { decrement: 1 } } }).catch(() => undefined)
        : Promise.resolve(),
    ]);
  }

  private normalizeUserIds(value: any): string[] {
    const raw = Array.isArray(value) ? value : String(value || '').split(',');
    return [...new Set(raw.map((item) => String(item || '').trim()).filter(Boolean))];
  }

  private normalizeMentionUserIds(value: any, ownerId?: string): string[] {
    const raw = Array.isArray(value) ? value : String(value || '').split(',');
    return [...new Set(raw
      .map((item: any) => String(item?.user_id || item?.userId || item?.id || item || '').trim())
      .filter((id: string) => id && id !== ownerId))];
  }

  private formatMentionUser(item: any) {
    const user = item?.user || item;
    if (!user?.id) return null;
    const nickname = user.nickname || '用户';
    const publicUid = user.publicUid || user.uid || null;
    return {
      id: user.id,
      user_id: user.id,
      userId: user.id,
      uid: publicUid,
      public_uid: publicUid,
      publicUid,
      nickname,
      name: nickname,
      avatar: this.publicAssetUrl(user.avatar),
      display_text: `@${nickname}`,
      displayText: `@${nickname}`,
    };
  }

  private formatMentions(mentions: any[] = []) {
    return (Array.isArray(mentions) ? mentions : []).map((item) => this.formatMentionUser(item)).filter(Boolean);
  }

  private async resolveMentionUsers(ids: string[]) {
    if (!ids.length) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, uid: true, publicUid: true, nickname: true, avatar: true },
    });
    const map = new Map(users.map((user) => [user.id, user]));
    return ids.map((id) => map.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  }

  private async notifyMentionUsers(params: {
    users: any[];
    actorId: string;
    publicActorId?: string;
    actorName?: string;
    regionId?: string | null;
    postId: string;
    scene: string;
    title: string;
    content: string;
  }) {
    const actorName = params.actorName || '用户';
    await Promise.all(params.users
      .filter((user) => user?.id && user.id !== params.actorId)
      .map((user) => this.notifyService.createAndDispatchInteraction({
        userId: user.id,
        regionId: params.regionId || undefined,
        type: 'MENTION',
        scene: params.scene,
        title: params.title,
        content: `${actorName}${params.content}`,
        data: { postId: params.postId, fromUserId: params.publicActorId ?? params.actorId },
        linkType: 'post',
        linkValue: params.postId,
        channelMask: { inApp: true, websocket: true },
      }, { actorId: params.actorId }).catch(() => undefined)));
  }

  private normalizeCoCreatorIds(dto: any, ownerId: string): string[] {
    return this.normalizeUserIds(
      dto.co_creator_user_ids ?? dto.coCreatorUserIds ?? dto.co_creator_ids ?? dto.coCreators ?? dto.user_ids ?? dto.user_id,
    ).filter((id) => id !== ownerId);
  }

  private ensurePostVisible(post: any, userId?: string) {
    if (!post || post.deletedAt || post.status === PostStatus.DELETED) {
      throw new NotFoundException('帖子不存在');
    }
    const status = post.status || PostStatus.PUBLISHED;
    if (status !== PostStatus.PUBLISHED && post.userId !== userId) {
      throw new ForbiddenException('帖子未发布，暂无访问权限');
    }
  }

  private async ensurePostAccessible(post: any, userId?: string) {
    this.ensurePostVisible(post, userId);
    if (!userId || !post?.userId || post.userId === userId) return;
    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { userId, blockedId: post.userId },
          { userId: post.userId, blockedId: userId },
        ],
      },
      select: { id: true },
    });
    if (block) throw new ForbiddenException('你无法查看该帖子');
  }

  private publicAssetUrl(value: any): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^(https?:|wxfile:|cloud:|data:|blob:)/i.test(raw)) return raw;

    const normalized = raw.startsWith('uploads/') ? `/${raw}` : raw;
    if (!normalized.startsWith('/uploads/')) return normalized;

    const base =
      process.env.PUBLIC_BASE_URL ||
      process.env.PUBLIC_API_URL ||
      process.env.APP_URL ||
      (process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:3000');

    return base ? `${base.replace(/\/+$/, '')}${normalized}` : normalized;
  }

  private normalizeOptionalString(value: any): string | undefined {
    const raw = String(value ?? '').trim();
    if (!raw || ['null', 'undefined', 'all'].includes(raw.toLowerCase())) return undefined;
    return raw;
  }

  private toPositiveInt(value: any, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  }

  private textCoverBool(value: any, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
  }

  private defaultTextCoverTemplate() {
    return {
      id: 'system-default',
      name: '系统默认文字封面',
      backgroundType: 'gradient',
      backgroundColor: '#F7F3EA',
      gradientStart: '#FFF6E8',
      gradientEnd: '#F8E7FF',
      backgroundImage: '',
      textColor: '#222222',
      accentColor: '#FF4D5A',
      titleFontSize: 30,
      bodyFontSize: 24,
      maxTitleChars: 24,
      maxSummaryChars: 72,
      maxLines: 6,
      coverHeight: 350,
      showTopic: true,
      showCircle: true,
    };
  }

  private compactCoverText(value: any, maxChars: number) {
    const text = String(value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    const chars = Array.from(text);
    return chars.length > maxChars ? `${chars.slice(0, maxChars).join('')}...` : text;
  }

  private async fetchTextCoverTemplateMap(regionIds: string[]) {
    const uniqueRegionIds = [...new Set(regionIds.map((item) => String(item || '').trim()).filter(Boolean))];
    if (!uniqueRegionIds.length) return new Map<string, any>();
    const map = new Map<string, any>();
    const placeholders = uniqueRegionIds.map(() => '?').join(',');
    try {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM post_text_cover_templates WHERE enabled = true AND (regionId IN (${placeholders}) OR regionId IS NULL) ORDER BY CASE WHEN regionId IS NULL THEN 1 ELSE 0 END, isDefault DESC, priority DESC, createdAt DESC`,
        ...uniqueRegionIds,
      );
      const globalTemplate = rows.find((item) => !item.regionId);
      for (const regionId of uniqueRegionIds) {
        map.set(regionId, rows.find((item) => String(item.regionId || '') === regionId) || globalTemplate || this.defaultTextCoverTemplate());
      }
    } catch {
      uniqueRegionIds.forEach((regionId) => map.set(regionId, this.defaultTextCoverTemplate()));
    }
    return map;
  }

  private buildTextCover(post: any, template: any) {
    const hasMedia = (Array.isArray(post.images) && post.images.length > 0) || !!post.video || !!post.audio || !!post.cover_url;
    if (hasMedia) return null;
    const tpl = { ...this.defaultTextCoverTemplate(), ...(template || {}) };
    const rawTitle = this.compactCoverText(post.title, Number(tpl.maxTitleChars || 24));
    const rawSummary = this.compactCoverText(post.content, Number(tpl.maxSummaryChars || 72));
    const title = rawTitle || this.compactCoverText(rawSummary, Number(tpl.maxTitleChars || 24)) || '无标题';
    const summary = rawTitle ? rawSummary : '';
    const topic = Array.isArray(post.topics) && post.topics.length ? `#${post.topics[0].name || post.topics[0].title || ''}` : '';
    return {
      enabled: true,
      template_id: tpl.id,
      templateId: tpl.id,
      title,
      summary,
      is_folded: Array.from(String(post.content || '')).length > Number(tpl.maxSummaryChars || 72),
      max_lines: Number(tpl.maxLines || 6),
      maxLines: Number(tpl.maxLines || 6),
      cover_height: Number(tpl.coverHeight || 350),
      coverHeight: Number(tpl.coverHeight || 350),
      background_type: tpl.backgroundType || 'color',
      backgroundType: tpl.backgroundType || 'color',
      background_color: tpl.backgroundColor || '#F7F3EA',
      backgroundColor: tpl.backgroundColor || '#F7F3EA',
      gradient_start: tpl.gradientStart || '#FFF6E8',
      gradientStart: tpl.gradientStart || '#FFF6E8',
      gradient_end: tpl.gradientEnd || '#F8E7FF',
      gradientEnd: tpl.gradientEnd || '#F8E7FF',
      background_image: this.publicAssetUrl(tpl.backgroundImage || ''),
      backgroundImage: this.publicAssetUrl(tpl.backgroundImage || ''),
      text_color: tpl.textColor || '#222222',
      textColor: tpl.textColor || '#222222',
      accent_color: tpl.accentColor || '#FF4D5A',
      accentColor: tpl.accentColor || '#FF4D5A',
      title_font_size: Number(tpl.titleFontSize || 30),
      titleFontSize: Number(tpl.titleFontSize || 30),
      body_font_size: Number(tpl.bodyFontSize || 24),
      bodyFontSize: Number(tpl.bodyFontSize || 24),
      topic: this.textCoverBool(tpl.showTopic, true) ? topic : '',
      circle: this.textCoverBool(tpl.showCircle, true) ? (post.circle_name || post.source_label || '') : '',
    };
  }

  private async attachTextCovers(posts: any[]) {
    const list = Array.isArray(posts) ? posts : [];
    const regionIds = list
      .filter((post) => !(Array.isArray(post.images) && post.images.length) && !post.video && !post.audio && !post.cover_url)
      .map((post) => post.region_id || post.regionId);
    const templateMap = await this.fetchTextCoverTemplateMap(regionIds);
    return list.map((post) => {
      const cover = this.buildTextCover(post, templateMap.get(String(post.region_id || post.regionId || '').trim()));
      return cover ? { ...post, text_cover: cover, textCover: cover } : post;
    });
  }

  private toMiniPostType(type: any): number {
    const normalized = String(type || '').toUpperCase();
    if (normalized === PostType.VIDEO) return 1;
    if (normalized === PostType.AUDIO) return 2;
    return 0;
  }

  private toMiniPostStatus(status: any): number {
    const normalized = String(status || '').toUpperCase();
    if (normalized === PostStatus.PENDING || normalized === PostStatus.DRAFT) return 2;
    if (normalized === PostStatus.REJECTED) return 3;
    if (normalized === PostStatus.DELETED) return 4;
    return 0;
  }

  private toMiniPostStatusText(status: any): string {
    const normalized = String(status || '').toUpperCase();
    if (normalized === PostStatus.PENDING || normalized === PostStatus.DRAFT) return '审核中';
    if (normalized === PostStatus.REJECTED) return '审核不通过';
    if (normalized === PostStatus.DELETED) return '已删除';
    return '';
  }

  private miniPostInclude() {
    return {
      user: this.miniAuthorSelect(),
      anonymousIdentity: true,
      circle: { select: { id: true, name: true, icon: true, cover: true } },
      media: true,
      echoInteractions: { select: { action: true, userId: true, createdAt: true } },
      topics: { include: { topic: true } },
      mentions: { include: { user: this.miniAuthorSelect() }, orderBy: { createdAt: 'asc' } },
      _count: { select: { likes: true, comments: true, favorites: true } },
    } as const;
  }

  private miniAuthorSelect() {
    return {
      select: {
        id: true,
        uid: true,
        publicUid: true,
        nickname: true,
        avatar: true,
        titleRecords: {
          where: { isWearing: true, title: { isEnabled: true, type: 'title' } },
          include: { title: true },
          take: 5,
        },
      },
    } as const;
  }

  private formatAuthorBadge(record: any, index = 0) {
    const badge = record?.badge || record;
    if (!badge) return null;
    return {
      id: badge.id || record?.badgeId || '',
      badge_id: badge.id || record?.badgeId || '',
      name: badge.name || '',
      icon: this.publicAssetUrl(badge.icon),
      image: this.publicAssetUrl(badge.icon),
      description: badge.description || '',
      condition: badge.condition || '',
      level: 100 - index,
      color: '#f8f8f8',
      style: {
        background_color: '#fff7e6',
        text_color: '#ad6800',
        border_color: '#ffd591',
        border_width: 1,
        border_radius: 8,
        padding_top: 2,
        padding_right: 8,
        padding_bottom: 2,
        padding_left: 8,
        font_size: 18,
      },
      acquired_at: record?.createdAt || null,
    };
  }

  private selectRegionalTitleRecord(records: any[], regionId?: string | null) {
    const scopeRegionId = String(regionId || '').trim();
    if (!records.length) return null;
    if (!scopeRegionId) return records.find((record: any) => !record?.title?.regionId) || records[0];
    return records.find((record: any) => record?.title?.regionId === scopeRegionId)
      || records.find((record: any) => !record?.title?.regionId)
      || records[0];
  }

  private decorateMiniAuthor(user: any, regionId?: string | null) {
    if (!user) return user;
    const currentRecord = this.selectRegionalTitleRecord(Array.isArray(user.titleRecords) ? user.titleRecords : [], regionId);
    const title = currentRecord?.title || null;
    const titleImageUrl = this.publicAssetUrl(title?.image || title?.icon || '');
    const badges: any[] = [];
    const { titleRecords, badges: _badges, ...cleanUser } = user;
    const publicUid = user.publicUid || user.uid || null;
    return {
      ...cleanUser,
      uid: publicUid,
      public_uid: publicUid,
      publicUid,
      legacy_uid: user.uid || null,
      avatar: this.publicAssetUrl(user.avatar),
      current_title: title
        ? {
            id: title.id,
            title_id: title.id,
            name: title.name || '',
            title_name: title.name || '',
            icon: this.publicAssetUrl(title.icon),
            image: this.publicAssetUrl(title.image),
            image_url: titleImageUrl,
          }
        : null,
      currentTitle: title,
      title_image_url: titleImageUrl,
      titleImageUrl,
      user_badges: badges,
      userBadges: badges,
      user_tags: badges,
      userTags: badges,
    };
  }

  private normalizeMedia(dto: any): Array<{
    type: MediaType;
    url: string;
    thumb?: string;
    width?: number;
    height?: number;
    duration?: number;
    sortOrder: number;
  }> {
    const media: Array<{ type: MediaType; url: string; thumb?: string; width?: number; height?: number; duration?: number; sortOrder: number }> = [];

    for (const [index, item] of this.toArray(dto.media).entries()) {
      const url = typeof item === 'string' ? item : item?.url;
      if (!url) continue;
      const type = String(item?.type || dto.type || 'IMAGE').toUpperCase();
      media.push({
        type: type === 'VIDEO' ? MediaType.VIDEO : type === 'AUDIO' ? MediaType.AUDIO : MediaType.IMAGE,
        url: String(url),
        thumb: item?.thumb || item?.thumbnailUrl,
        width: this.toInt(item?.width),
        height: this.toInt(item?.height),
        duration: this.toInt(item?.duration),
        sortOrder: index,
      });
    }

    const dimensions = Array.isArray(dto.images_dimensions) ? dto.images_dimensions : [];
    for (const [index, url] of this.toArray(dto.images).entries()) {
      if (!url) continue;
      media.push({
        type: MediaType.IMAGE,
        url: String(url),
        width: this.toInt(dimensions[index]?.width ?? dto.cover_width),
        height: this.toInt(dimensions[index]?.height ?? dto.cover_height),
        sortOrder: media.length,
      });
    }

    for (const url of this.toArray(dto.video)) {
      if (!url) continue;
      media.push({
        type: MediaType.VIDEO,
        url: String(url),
        thumb: dto.thumbnail_url || dto.cover_url,
        width: this.toInt(dto.cover_width),
        height: this.toInt(dto.cover_height),
        sortOrder: media.length,
      });
    }

    for (const url of this.toArray(dto.audio)) {
      if (!url) continue;
      media.push({
        type: MediaType.AUDIO,
        url: String(url),
        thumb: dto.cover_url,
        duration: this.toInt(dto.audio_duration),
        sortOrder: media.length,
      });
    }

    return media.filter((item) => item.url);
  }

  private toReviewFlag(value: any, fallback = true) {
    if (value === true || value === 1 || value === '1') return true;
    if (value === false || value === 0 || value === '0') return false;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
      if (['false', 'no', 'off', 'disabled'].includes(normalized)) return false;
    }
    return fallback;
  }

  private async getNoteReviewSettings(regionId?: string): Promise<{ approvalType: string; aiFailureToManual: boolean }> {
    if (!regionId) return { approvalType: 'manual', aiFailureToManual: true };
    const config = await this.prisma.config.findUnique({
      where: { key: `content.note_settings.${regionId}` },
      select: { value: true },
    });
    const settings = (config?.value as any) || {};
    return {
      approvalType: String(settings.note_approval_type || 'manual').toLowerCase(),
      aiFailureToManual: this.toReviewFlag(
        settings.ai_review_failure_to_manual ?? settings.ai_review_failed_to_manual ?? settings.ai_manual_fallback,
        true,
      ),
    };
  }

  private async getRawNoteSettings(regionId?: string | null): Promise<Record<string, any>> {
    if (!regionId) return {};
    const config = await this.prisma.config.findUnique({
      where: { key: `content.note_settings.${regionId}` },
      select: { value: true },
    }).catch(() => null);
    return ((config?.value as Record<string, any>) || {}) as Record<string, any>;
  }

  private async getRandomAnonymousIdentity(regionId: string) {
    const where = { regionId };
    const count = await this.prisma.anonymousIdentity.count({ where });
    if (!count) return null;
    const skip = Math.floor(Math.random() * count);
    return this.prisma.anonymousIdentity.findFirst({ where, skip, orderBy: { id: 'asc' } });
  }

  private async resolveAnonymousPostPayload(regionId: string | undefined, dto: any) {
    const anonymousId = this.normalizeOptionalString(dto.anonymous_id ?? dto.anonymousId);
    const wantsAnonymous = !!anonymousId || [dto.is_anonymous, dto.isAnonymous].some((value) => value === true || value === 1 || value === '1');
    if (!wantsAnonymous) return {};
    const settings = await this.getRawNoteSettings(regionId);
    if (!this.toReviewFlag(settings.allow_anonymous_notes, false)) {
      throw new BadRequestException('当前区域未开启匿名发布');
    }
    if (!regionId) throw new BadRequestException('匿名发布必须选择区域');
    const identity = anonymousId
      ? await this.prisma.anonymousIdentity.findFirst({ where: { id: anonymousId, regionId } })
      : await this.getRandomAnonymousIdentity(regionId);
    if (!identity) throw new BadRequestException('暂无可用匿名身份，请联系管理员配置');
    return {
      isAnonymous: true,
      anonymousIdentityId: identity.id,
      anonymousName: identity.name || settings.anonymous_default_name || '匿名用户',
      anonymousAvatar: identity.avatar || '',
    };
  }

  private async resolveInitialReview(
    data: any,
    media: Array<{ type: MediaType; url: string }>,
    userId: string,
  ): Promise<{
    status: PostStatus;
    auditStatus: string;
    auditReason?: string;
    approvalType: string;
    aiResult?: AiModerationResult;
  }> {
    const { approvalType, aiFailureToManual } = await this.getNoteReviewSettings(data.regionId);
    const qrcodeResult = await this.qrcodeModeration.reviewImages({
      targetType: 'post',
      regionId: data.regionId,
      userId,
      approvalType,
      imageUrls: media.filter((item) => item.type === MediaType.IMAGE).map((item) => item.url),
    });
    if (qrcodeResult) {
      if (qrcodeResult.decision === 'reject') {
        return { status: PostStatus.REJECTED, auditStatus: 'rejected', auditReason: qrcodeResult.reason || '图片包含违规二维码', approvalType: 'qrcode_filter', aiResult: qrcodeResult };
      }
      return { status: PostStatus.PENDING, auditStatus: 'pending', auditReason: qrcodeResult.reason || '图片疑似包含二维码，等待人工审核', approvalType: 'qrcode_filter', aiResult: qrcodeResult };
    }

    // AUD-P1-152: 敏感词检查在所有审核类型前执行 — strict直接拒绝，audit转人工
    const sensitiveHit = await this.aiRuntime.detectSensitiveHit(`${data.title || ''}\n${data.content || ''}`);
    if (sensitiveHit) {
      const level = String(sensitiveHit.level || 'audit').toLowerCase();
      if (level === 'strict') {
        return { status: PostStatus.REJECTED, auditStatus: 'rejected', auditReason: `命中敏感词：${sensitiveHit.word}`, approvalType: 'sensitive_word' };
      }
      if (level === 'audit') {
        return { status: PostStatus.PENDING, auditStatus: 'pending', auditReason: `命中敏感词：${sensitiveHit.word}（${sensitiveHit.category || '其他'}）`, approvalType: 'sensitive_word' };
      }
      // tip: 继续原有审核流程，但附加命中信息
      this.logger.warn(`[敏感词tip] userId=${userId} word=${sensitiveHit.word} level=${sensitiveHit.level}`);
    }

    if (['none', 'auto', 'pass', 'published', 'approved'].includes(approvalType)) {
      return { status: PostStatus.PUBLISHED, auditStatus: 'approved', auditReason: '无需审核', approvalType };
    }
    if (['ai', 'llm', 'model'].includes(approvalType)) {
      const result = await this.aiRuntime.moderateContent({
        type: 'post',
        title: data.title,
        content: data.content,
        regionId: data.regionId,
        approvalType,
        manualFallback: aiFailureToManual,
      });
      if (result.decision === 'approve') {
        return { status: PostStatus.PUBLISHED, auditStatus: 'approved', auditReason: result.reason || 'AI审核通过', approvalType, aiResult: result };
      }
      if (result.decision === 'reject') {
        return { status: PostStatus.REJECTED, auditStatus: 'rejected', auditReason: result.reason || 'AI审核不通过', approvalType, aiResult: result };
      }
      return { status: PostStatus.PENDING, auditStatus: 'pending', auditReason: result.reason || 'AI建议人工复核', approvalType, aiResult: result };
    }
    return { status: PostStatus.PENDING, auditStatus: 'pending', auditReason: '等待人工审核', approvalType };
  }

  private async normalizePostPayload(dto: any, options: { partial?: boolean } = {}) {
    const regionId = dto.regionId ?? dto.region_id;
    const circleId = dto.circleId ?? dto.circle_id;
    const content = typeof dto.content === 'string' ? dto.content.trim() : dto.content;
    const media = this.normalizeMedia(dto);
    if (!options.partial && !content && media.length === 0) {
      throw new BadRequestException('请输入内容或上传图片/视频/音频');
    }

    const data: any = {};
    if (regionId !== undefined && regionId !== null && regionId !== '') data.regionId = String(regionId);
    if (circleId !== undefined && circleId !== null && circleId !== '') data.circleId = String(circleId);
    if (dto.type !== undefined) data.type = this.normalizePostType(dto.type);
    if (dto.title !== undefined) data.title = String(dto.title || '').trim() || null;
    if (content !== undefined) data.content = String(content || '');
    if (dto.location !== undefined || dto.location_name !== undefined || dto.location_address !== undefined) {
      data.location = String(dto.location ?? dto.location_name ?? dto.location_address ?? '').trim() || null;
    }
    if (dto.latitude !== undefined) data.latitude = this.toFloat(dto.latitude);
    if (dto.longitude !== undefined) data.longitude = this.toFloat(dto.longitude);
    if (dto.enable_pin !== undefined || dto.is_pinned !== undefined) data.isTop = !!(dto.enable_pin ?? dto.is_pinned);

    return {
      data,
      media,
      topicIds: this.normalizeTopicIds(dto),
    };
  }

  private formatMiniPost(post: any) {
    const media = (Array.isArray(post.media) ? post.media : []).map((item: any) => ({
      ...item,
      url: this.publicAssetUrl(item.url),
      thumb: this.publicAssetUrl(item.thumb),
    }));
    const rawUser = this.decorateMiniAuthor(post.user, post.regionId);
    const isAnonymous = !!post.isAnonymous;
    const anonymousName = String(post.anonymousName || post.anonymousIdentity?.name || '匿名用户').trim() || '匿名用户';
    const anonymousAvatar = this.publicAssetUrl(post.anonymousAvatar || post.anonymousIdentity?.avatar || '/static/logo.jpg');
    const user = isAnonymous
      ? {
          id: '',
          user_id: '',
          uid: null,
          public_uid: null,
          publicUid: null,
          legacy_uid: null,
          name: anonymousName,
          nickname: anonymousName,
          avatar: anonymousAvatar,
          is_anonymous: true,
          isAnonymous: true,
        }
      : rawUser;
    const authorName = String(user?.nickname || '').trim();
    const authorAvatar = user?.avatar || '';
    const images = media.filter((item: any) => item.type === MediaType.IMAGE).map((item: any) => item.url);
    const firstVideo = media.find((item: any) => item.type === MediaType.VIDEO);
    const firstAudio = media.find((item: any) => item.type === MediaType.AUDIO);
    const echoState = this.buildPostEchoState(post);
    const cover = images[0] || firstVideo?.thumb || firstAudio?.thumb || '';
    const topics = this.normalizeMiniPostTopics(post.topics || []);
    const circle = post.circle || null;
    const circleLogo = this.publicAssetUrl(circle?.icon || circle?.cover || '');
    const sourceLabel = circle?.name || (post.circleId ? '' : '广场');
    const collaborators = (Array.isArray(post.collaborators) ? post.collaborators : [])
      .map((item: any) => ({
        id: item.user?.id || item.userId,
        user_id: item.user?.id || item.userId,
        nickname: item.user?.nickname || '',
        avatar: this.publicAssetUrl(item.user?.avatar),
        status: item.status,
      }));
    return {
      ...post,
      raw_type: post.type,
      post_type: post.type,
      type: this.toMiniPostType(post.type),
      interaction_intent: echoState.intent,
      interactionIntent: echoState.intent,
      echo_counts: echoState.counts,
      echoCounts: echoState.counts,
      echo_participant_count: echoState.participantCount,
      echoParticipantCount: echoState.participantCount,
      echo_summary: echoState.summary,
      echoSummary: echoState.summary,
      echo_actions: echoState.actions,
      echoActions: echoState.actions,
      raw_status: post.status,
      approval_status: post.status,
      audit_status: post.auditStatus || '',
      audit_reason: post.auditReason || '',
      reject_reason: post.auditReason || '',
      rejectReason: post.auditReason || '',
      status: this.toMiniPostStatus(post.status),
      status_text: this.toMiniPostStatusText(post.status),
      media,
      userId: isAnonymous ? '' : post.userId,
      user,
      name: authorName,
      nickname: authorName,
      avatar: authorAvatar,
      is_anonymous: isAnonymous,
      isAnonymous,
      anonymous_identity_id: post.anonymousIdentityId || '',
      anonymousIdentityId: post.anonymousIdentityId || '',
      anonymous_name: isAnonymous ? anonymousName : '',
      anonymousName: isAnonymous ? anonymousName : '',
      anonymous_avatar: isAnonymous ? anonymousAvatar : '',
      anonymousAvatar: isAnonymous ? anonymousAvatar : '',
      title_image_url: user?.title_image_url || '',
      titleImageUrl: user?.titleImageUrl || '',
      current_title: user?.current_title || null,
      currentTitle: user?.currentTitle || null,
      user_badges: user?.user_badges || [],
      userBadges: user?.userBadges || [],
      user_tags: user?.user_tags || [],
      userTags: user?.userTags || [],
      user_id: isAnonymous ? '' : post.userId,
      region_id: post.regionId,
      circle_id: post.circleId,
      circle_name: circle?.name || '',
      circleName: circle?.name || '',
      circle_logo: circleLogo,
      circleLogo,
      circle_avatar: circleLogo,
      circleAvatar: circleLogo,
      circle_info: circle
        ? {
            id: circle.id,
            circle_id: circle.id,
            name: circle.name,
            circle_name: circle.name,
            logo: circleLogo,
            avatar: circleLogo,
          }
        : null,
      source_type: post.circleId ? 'circle' : 'square',
      source_label: sourceLabel,
      author: user,
      user_info: user,
      images,
      images_dimensions: media.filter((item: any) => item.type === MediaType.IMAGE).map((item: any) => ({ width: item.width || 0, height: item.height || 0 })),
      video: firstVideo?.url || '',
      audio: firstAudio?.url || '',
      cover_url: cover,
      cover_width: media[0]?.width || 0,
      cover_height: media[0]?.height || 0,
      topic_ids: topics.map((item: any) => item.id),
      topic_id: topics[0]?.id || '',
      topics,
      mentions: this.formatMentions(post.mentions || []),
      co_creators: collaborators,
      coCreators: collaborators,
      like_count: post.likeCount,
      comment_count: post.commentCount,
      favorite_count: post.favoriteCount,
      view_count: post.viewCount,
      is_top: !!post.isTop,
      is_pinned: !!post.isTop,
      top_expire_at: post.topExpireAt,
      created_at: post.createdAt,
      updated_at: post.updatedAt,
    };
  }

  private applyDefaultCircleToPost(post: any, circle: any) {
    if (!post || post.circleId || post.circle || !circle) return post;
    return {
      ...post,
      circleId: circle.id,
      circle,
    };
  }

  private async formatMiniPostWithDefaultCircle(post: any) {
    if (!post?.regionId || post.circleId || post.circle) {
      const [formatted] = await this.attachTextCovers([this.formatMiniPost(post)]);
      return formatted;
    }
    const circle = await this.getRegionDefaultCircle(post.regionId);
    const [formatted] = await this.attachTextCovers([this.formatMiniPost(this.applyDefaultCircleToPost(post, circle))]);
    return formatted;
  }

  private async formatMiniPostList(posts: any[] = []) {
    const defaultCircleByRegion = new Map<string, any>();
    const ensureDefaultCircle = async (regionId?: string | null) => {
      const key = String(regionId || '');
      if (!key) return null;
      if (!defaultCircleByRegion.has(key)) {
        defaultCircleByRegion.set(key, await this.getRegionDefaultCircle(key));
      }
      return defaultCircleByRegion.get(key);
    };
    const formatted = await Promise.all((Array.isArray(posts) ? posts : []).map(async (post) => {
      if (!post?.regionId || post.circleId || post.circle) return this.formatMiniPost(post);
      const circle = await ensureDefaultCircle(post.regionId);
      return this.formatMiniPost(this.applyDefaultCircleToPost(post, circle));
    }));
    return this.attachTextCovers(formatted);
  }

  private async applyGrowthContentBoost(posts: any[], regionId: string) {
    const list = Array.isArray(posts) ? posts : [];
    const boosts = await this.growthService.getContentBoostByUserIds(list.map((post) => post.userId), regionId);
    return list
      .map((post, index) => ({
        ...post,
        growthContentBoostWeight: boosts.get(post.userId) || 0,
        __growthRank: index - (post.isTop ? 0 : (boosts.get(post.userId) || 0)),
      }))
      .sort((a, b) => {
        if (!!a.isTop !== !!b.isTop) return a.isTop ? -1 : 1;
        return a.__growthRank - b.__growthRank;
      })
      .map(({ __growthRank, ...post }) => post);
  }

  private campusEchoSettings(settings: Record<string, any>) {
    const enabledRaw = settings.enable_campus_echo;
    const enabled = enabledRaw === undefined || enabledRaw === null || enabledRaw === ''
      ? true
      : ![false, 0, '0', 'false', 'off', 'disabled'].includes(enabledRaw);
    const windowHours = Math.min(72, Math.max(1, Number(settings.campus_echo_window_hours || 12) || 12));
    const minParticipants = Math.min(20, Math.max(2, Number(settings.campus_echo_min_participants || 2) || 2));
    return { enabled, windowHours, minParticipants };
  }

  private async inferCampusEchoIntent(input: { regionId?: string | null; title?: string | null; content?: string | null; location?: string | null }) {
    const settings = await this.getRawNoteSettings(input.regionId || '');
    if (!this.campusEchoSettings(settings).enabled) return 'share';
    const text = [input.title, input.content, input.location].map((item) => String(item || '').trim()).filter(Boolean).join('\n');
    if (text.length < 6) return 'share';
    try {
      const result = await this.aiRuntime.callChatDetailed([
        { role: 'system', content: '你是校园社区的互动意图分类器。只输出 JSON：{"intent":"share|invite|complaint|help","confidence":0到1}。invite 仅限明确找搭子、拼饭、组队、招人；complaint 仅限明确吐槽、避雷、共同反馈；help 仅限明确求助、提问。其余都为 share。' },
        { role: 'user', content: text.slice(0, 1800) },
      ], { purpose: 'post_echo_intent', source: 'post_service', regionId: input.regionId || undefined, temperature: 0, maxTokens: 60 });
      const parsed = JSON.parse(String(result.content || '').match(/\{[\s\S]*\}/)?.[0] || '{}');
      const intent = this.normalizeInteractionIntent(parsed.intent);
      return ['invite', 'complaint', 'help'].includes(intent) && Number(parsed.confidence) >= 0.78 ? intent : 'share';
    } catch {
      return 'share';
    }
  }

  private encodeCampusEchoFilter(filter: { kind: 'topic' | 'location'; value: string; intent: string }) {
    return Buffer.from(JSON.stringify(filter)).toString('base64url');
  }

  private decodeCampusEchoFilter(echoId: string) {
    try {
      const parsed = JSON.parse(Buffer.from(String(echoId || ''), 'base64url').toString('utf8'));
      if (!parsed || !['topic', 'location'].includes(parsed.kind) || !String(parsed.value || '').trim()) return null;
      return {
        kind: parsed.kind as 'topic' | 'location',
        value: String(parsed.value).trim(),
        intent: this.normalizeInteractionIntent(parsed.intent),
      };
    } catch {
      return null;
    }
  }

  private campusEchoWhere(regionId: string, filter: { kind: 'topic' | 'location'; value: string; intent: string }, since: Date) {
    const where: any = {
      regionId,
      interactionIntent: filter.intent,
      createdAt: { gte: since },
      ...this.publicPostWhere,
    };
    if (filter.kind === 'topic') where.topics = { some: { topicId: filter.value } };
    if (filter.kind === 'location') where.location = filter.value;
    return where;
  }

  private campusEchoSummary(intent: string, participantCount: number, postCount: number) {
    if (intent === 'invite') return participantCount > 1 ? `${participantCount - 1} 人正在报名` : '正在招募同学';
    if (intent === 'complaint') return `${participantCount} 人正在回应`;
    if (intent === 'help') return `已有 ${Math.max(0, participantCount - postCount)} 条回答`;
    return `${participantCount} 位同学正在讨论`;
  }

  async listCampusEchoes(regionId: string) {
    const rawSettings = await this.getRawNoteSettings(regionId);
    const settings = this.campusEchoSettings(rawSettings);
    if (!settings.enabled) return { echoes: [], window_hours: settings.windowHours };
    const since = new Date(Date.now() - settings.windowHours * 60 * 60 * 1000);
    const posts = await this.prisma.post.findMany({
      where: { regionId, createdAt: { gte: since }, ...this.publicPostWhere },
      include: this.miniPostInclude(),
      orderBy: { createdAt: 'desc' },
      take: 160,
    });
    const groups = new Map<string, { filter: { kind: 'topic' | 'location'; value: string; intent: string }; title: string; posts: any[] }>();
    for (const post of posts) {
      const intent = this.normalizeInteractionIntent(post.interactionIntent);
      const firstTopic = post.topics?.[0]?.topic;
      const location = String(post.location || '').trim();
      const filter = firstTopic?.id
        ? { kind: 'topic' as const, value: String(firstTopic.id), intent }
        : location
          ? { kind: 'location' as const, value: location, intent }
          : null;
      if (!filter) continue;
      const key = `${filter.kind}:${filter.value}:${filter.intent}`;
      const title = String(firstTopic?.name || location || '').trim();
      const group = groups.get(key) || { filter, title, posts: [] };
      group.posts.push(post);
      groups.set(key, group);
    }
    const echoes = [...groups.values()]
      .map((group) => {
        const participants = new Set<string>();
        let lastActivityAt = group.posts[0]?.createdAt || since;
        for (const post of group.posts) {
          if (post.userId) participants.add(post.userId);
          for (const interaction of post.echoInteractions || []) {
            if (interaction.userId) participants.add(interaction.userId);
            if (interaction.createdAt && new Date(interaction.createdAt) > new Date(lastActivityAt)) lastActivityAt = interaction.createdAt;
          }
        }
        return {
          id: this.encodeCampusEchoFilter(group.filter),
          title: group.title,
          intent: group.filter.intent,
          post_count: group.posts.length,
          participant_count: participants.size,
          summary: this.campusEchoSummary(group.filter.intent, participants.size, group.posts.length),
          last_activity_at: lastActivityAt,
        };
      })
      .filter((item) => item.participant_count >= settings.minParticipants)
      .sort((a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime())
      .slice(0, 3);
    return { echoes, window_hours: settings.windowHours };
  }

  async campusEchoDetail(regionId: string, echoId: string) {
    const filter = this.decodeCampusEchoFilter(echoId);
    if (!filter) throw new BadRequestException('校园回声参数无效');
    const rawSettings = await this.getRawNoteSettings(regionId);
    const settings = this.campusEchoSettings(rawSettings);
    const since = new Date(Date.now() - settings.windowHours * 60 * 60 * 1000);
    const posts = await this.prisma.post.findMany({
      where: this.campusEchoWhere(regionId, filter, since),
      include: this.miniPostInclude(),
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const formatted = await this.formatMiniPostList(posts);
    const participants = new Set(posts.flatMap((post) => [post.userId, ...(post.echoInteractions || []).map((item: any) => item.userId)]).filter(Boolean));
    return {
      echo: {
        id: echoId,
        title: filter.kind === 'topic' ? formatted[0]?.topics?.[0]?.title || '校园话题' : filter.value,
        intent: filter.intent,
        post_count: formatted.length,
        participant_count: participants.size,
        summary: this.campusEchoSummary(filter.intent, participants.size, formatted.length),
      },
      posts: formatted,
    };
  }

  async toggleCampusEchoInteraction(postId: string, userId: string, action: string) {
    const normalizedAction = String(action || '').trim().toLowerCase();
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true, userId: true, regionId: true, status: true, deletedAt: true, interactionIntent: true } });
    await this.ensurePostAccessible(post, userId);
    await this.userAccess.assertCanInteract(userId, 'like', '参与校园回声');
    await this.userAccess.assertStudentProtectedAction(userId, post?.regionId, '参与校园回声');
    const intent = this.normalizeInteractionIntent(post?.interactionIntent);
    const allowed: Record<string, string[]> = { invite: ['join'], complaint: ['same'], help: ['answer'] };
    if (!allowed[intent]?.includes(normalizedAction)) throw new BadRequestException('该笔记暂不支持此互动');
    const active = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.postEchoInteraction.findUnique({ where: { postId_userId_action: { postId, userId, action: normalizedAction } } });
      if (existing) {
        await tx.postEchoInteraction.delete({ where: { id: existing.id } });
        return false;
      }
      await tx.postEchoInteraction.create({ data: { postId, userId, action: normalizedAction } });
      return true;
    });
    await this.clearPostFeedCache(post?.regionId);
    if (active && post && post.userId !== userId) {
      const actor = await this.prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } }).catch(() => null);
      const labelMap: Record<string, string> = { join: '想和你一起参与', same: '也遇到了同样的问题', answer: '表示可以提供帮助' };
      await this.notifyService.createAndDispatchInteraction({
        userId: post.userId,
        regionId: post.regionId || undefined,
        type: 'COMMENT',
        scene: 'post_echo_interaction',
        title: '你的校园笔记有了新回应',
        content: `${actor?.nickname || '用户'}${labelMap[normalizedAction] || '回应了你的笔记'}`,
        data: { postId, fromUserId: userId, action: normalizedAction },
        linkType: 'post',
        linkValue: postId,
        channelMask: { inApp: true, websocket: true },
      }, { actorId: userId });
    }
    const latest = await this.prisma.post.findUnique({ where: { id: postId }, include: this.miniPostInclude() });
    return { active, post: latest ? await this.formatMiniPostWithDefaultCircle(latest) : null };
  }

  async listByRegion(regionId: string, query: any) {
    const { page = 1, limit = 10, sortBy = 'latest', circle_id, check_in_id, topic_id, topic_ids, type = 'null' } = query;
    const forceRefresh = query?.force_refresh === '1' || query?.forceRefresh === '1' || query?.refresh === '1' || query?.force_refresh === true || query?.forceRefresh === true;
    const where: any = { regionId, ...this.publicPostWhere };
    if (circle_id) where.circleId = String(circle_id);
    if (topic_id) where.topics = { some: { topicId: topic_id } };
    if (topic_ids) {
      const ids = Array.isArray(topic_ids) ? topic_ids : topic_ids.split(',');
      where.topics = { some: { topicId: { in: ids } } };
    }
    const normalizedType = String(type || '').toUpperCase();
    const allowedTypes = ['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'VOTE', 'REPOST'];
    if (normalizedType && !['NULL', 'ALL', 'MIXED'].includes(normalizedType) && allowedTypes.includes(normalizedType)) {
      where.type = normalizedType;
    }

    await this.prisma.post.updateMany({
      where: { regionId, isTop: true, topExpireAt: { lte: new Date() } },
      data: { isTop: false },
    }).catch(() => {});
    const pageNumber = this.toPositiveInt(page, 1);
    const pageLimit = this.toPositiveInt(limit, 10);
    const cacheKey = this.postFeedCacheKey(regionId, 'region', { page: pageNumber, limit: pageLimit, sortBy, circle_id, check_in_id, topic_id, topic_ids, type });
    const cached = forceRefresh ? null : await this.redis.getJson<any>(cacheKey).catch(() => null);
    if (cached) return cached;
    const orderBy: any = sortBy === 'hot' ? { viewCount: 'desc' } : { createdAt: 'desc' };
    // ponytail: boost only re-ranks the first ten pages; move scoring into SQL if the feed grows beyond this window.
    const boostWindow = pageNumber <= 10;
    const candidateTake = boostWindow ? pageLimit * (pageNumber + 1) : pageLimit;
    const [rawList, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: this.miniPostInclude(),
        skip: boostWindow ? 0 : (pageNumber - 1) * pageLimit,
        take: candidateTake,
        orderBy: [{ isTop: 'desc' }, orderBy],
      }),
      this.prisma.post.count({ where }),
    ]);
    const list = boostWindow
      ? (await this.applyGrowthContentBoost(rawList, regionId)).slice((pageNumber - 1) * pageLimit, pageNumber * pageLimit)
      : rawList;
    const formatted = await this.formatMiniPostList(list);
    const result = {
      list: formatted,
      posts: formatted,
      data: formatted,
      total,
      page: pageNumber,
      limit: pageLimit,
      pageSize: pageLimit,
    };
    if (!forceRefresh) await this.redis.setJson(cacheKey, result, this.feedCacheTtl).catch(() => undefined);
    return result;
  }

  async nearbyFollowed(regionId: string, query: any, userId?: string) {
    if (!userId) return this.listByRegion(regionId, query);
    const page = this.toPositiveInt(query.page, 1);
    const limit = this.toPositiveInt(query.limit ?? query.pageSize, 10);
    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const authorIds = follows.map((item) => item.followingId).filter(Boolean);
    if (!authorIds.length) {
      return { list: [], posts: [], data: [], total: 0, page, limit, pageSize: limit };
    }
    const where: any = {
      regionId,
      userId: { in: authorIds },
      ...this.publicPostWhere,
    };
    const [list, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: this.miniPostInclude(),
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.post.count({ where }),
    ]);
    const formatted = await this.formatMiniPostList(list);
    return { list: formatted, posts: formatted, data: formatted, total, page, limit, pageSize: limit };
  }

  async hotPosts(regionId: string, query: any) {
    return this.listByRegion(regionId, { ...query, sortBy: 'hot' });
  }

  async myPosts(userId: string, query: any) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = this.toPositiveInt(query.pageSize ?? query.limit, 20);
    const timelineType = String(query.type || 'all').toLowerCase();
    const targetUserId = this.normalizeOptionalString(query.user_id ?? query.userId) || userId;
    const regionId = this.normalizeOptionalString(query.region_id ?? query.regionId);
    const basePostWhere: any = { deletedAt: null };
    if (regionId) basePostWhere.regionId = regionId;
    if (targetUserId !== userId) Object.assign(basePostWhere, this.publicPostWhere);

    const buildResponse = async (posts: any[], total: number) => {
      const formatted = await this.formatMiniPostList(posts);
      return {
        success: true,
        list: formatted,
        posts: formatted,
        data: formatted,
        total,
        page,
        pageSize,
        pagination: {
          page,
          pageSize,
          limit: pageSize,
          total,
          total_pages: Math.ceil(total / pageSize),
          totalPages: Math.ceil(total / pageSize),
        },
      };
    };

    if (timelineType === 'liked') {
      const likeWhere = { userId: targetUserId, targetType: 'post' };
      const [likes, total] = await Promise.all([
        this.prisma.like.findMany({
          where: likeWhere,
          include: { post: { include: this.miniPostInclude() } },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.like.count({ where: likeWhere }),
      ]);
      const posts = likes
        .map((item) => item.post)
        .filter((post) => post && !post.deletedAt && (!regionId || post.regionId === regionId));
      return buildResponse(posts, regionId ? posts.length : total);
    }

    if (timelineType === 'viewed') {
      const historyWhere = { userId: targetUserId, targetType: 'post' };
      const histories = await this.prisma.browseHistory.findMany({
        where: historyWhere,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      });
      const orderedIds = [...new Set(histories.map((item) => item.targetId).filter(Boolean))];
      const posts = orderedIds.length
        ? await this.prisma.post.findMany({
            where: { ...basePostWhere, id: { in: orderedIds } },
            include: this.miniPostInclude(),
          })
        : [];
      const byId = new Map(posts.map((post) => [post.id, post]));
      const orderedPosts = orderedIds.map((id) => byId.get(id)).filter(Boolean);
      const total = await this.prisma.browseHistory.count({ where: historyWhere });
      return buildResponse(orderedPosts, total);
    }

    if (timelineType === 'commented') {
      const commentWhere = { userId: targetUserId, deletedAt: null };
      const comments = await this.prisma.comment.findMany({
        where: commentWhere,
        select: { postId: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      });
      const orderedIds = [...new Set(comments.map((item) => item.postId).filter(Boolean))];
      const posts = orderedIds.length
        ? await this.prisma.post.findMany({
            where: { ...basePostWhere, id: { in: orderedIds } },
            include: this.miniPostInclude(),
          })
        : [];
      const byId = new Map(posts.map((post) => [post.id, post]));
      const orderedPosts = orderedIds.map((id) => byId.get(id)).filter(Boolean);
      const total = await this.prisma.comment.count({ where: commentWhere });
      return buildResponse(orderedPosts, total);
    }

    const mediaType = (Object.values(PostType) as string[]).includes(timelineType.toUpperCase())
      ? (timelineType.toUpperCase() as PostType)
      : undefined;
    const where: any = { ...basePostWhere, userId: targetUserId };
    if (mediaType) where.type = mediaType;
    const [list, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: this.miniPostInclude(),
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.post.count({ where }),
    ]);
    return buildResponse(list, total);
  }

  async detail(id: string, userId?: string) {
    const post = await this.prisma.post.findFirst({
      where: { id },
      include: {
        user: this.miniAuthorSelect(),
        anonymousIdentity: true,
        media: true,
        circle: { select: { id: true, name: true, icon: true, cover: true } },
        topics: { include: { topic: true } },
        mentions: { include: { user: this.miniAuthorSelect() }, orderBy: { createdAt: 'asc' } },
        votes: true,
        collaborators: {
          where: { status: 'accepted' },
          include: { user: this.miniAuthorSelect() },
        },
        _count: { select: { likes: true, comments: true, favorites: true } },
      },
    });
    await this.ensurePostAccessible(post, userId);
    await this.incrementView(id, userId).catch(() => undefined);
    let isLiked = false;
    let isFavorited = false;
    if (userId) {
      const [like, fav] = await Promise.all([
        this.prisma.like.findFirst({ where: { userId, targetType: 'post', targetId: id } }),
        this.prisma.favorite.findFirst({ where: { userId, targetType: 'post', targetId: id } }),
      ]);
      isLiked = !!like;
      isFavorited = !!fav;
    }
    const formatted = await this.formatMiniPostWithDefaultCircle(post);
    return { ...formatted, isLiked, isFavorited };
  }

  async create(userId: string, dto: any) {
    await this.userAccess.assertCanCreateContent(userId, 'post', '发布笔记');
    const { data, media, topicIds } = await this.normalizePostPayload(dto);
    await this.userAccess.assertStudentProtectedAction(userId, data.regionId, '发布笔记');
    data.interactionIntent = await this.inferCampusEchoIntent(data);
    Object.assign(data, await this.resolveAnonymousPostPayload(data.regionId, dto));
    const defaultCircle = !data.circleId ? await this.getRegionDefaultCircle(data.regionId) : null;
    if (defaultCircle) data.circleId = defaultCircle.id;
    const mentionIds = this.normalizeMentionUserIds(dto.mentions ?? dto.mention_user_ids ?? dto.mentionUserIds, userId);
    const coCreatorIds = this.normalizeCoCreatorIds(dto, userId);
    const inviteMessage = this.normalizeOptionalString(dto.co_creator_invite_message ?? dto.coCreatorInviteMessage ?? dto.invite_message ?? dto.inviteMessage);
    if (coCreatorIds.length) data.isCoCreate = true;
    if (data.circleId) {
      const [circle, member] = await Promise.all([
        this.prisma.circle.findUnique({ where: { id: data.circleId }, select: { id: true, status: true, auditStatus: true } }),
        this.prisma.circleMember.findUnique({ where: { circleId_userId: { circleId: data.circleId, userId } } }),
      ]);
      if (!circle || circle.status !== 'active' || circle.auditStatus !== 'approved') {
        throw new BadRequestException('圈子暂未开放，不能发布圈内笔记');
      }
      if (!member) throw new BadRequestException('请先加入圈子，再发布圈子笔记');
      if (member.status === 'pending') throw new BadRequestException('你的加入申请还在审核中，暂不能发圈内笔记');
      if (member.status === 'banned') throw new ForbiddenException('你已被移出该圈子，不能发圈内笔记');
      if (member.status === 'muted' && member.muteEndAt && new Date(member.muteEndAt).getTime() > Date.now()) {
        throw new ForbiddenException(member.muteReason || '你在该圈子内已被禁言，暂不能发圈内笔记');
      }
    }
    const [review, hasExposureBoost, hasAuditPriority, mentionUsers, author] = await Promise.all([
      this.resolveInitialReview(data, media, userId),
      this.membershipService.hasBenefit(userId, 'content_exposure_boost').catch(() => false),
      this.membershipService.hasBenefit(userId, 'content_audit_priority').catch(() => false),
      this.resolveMentionUsers(mentionIds),
      this.prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } }).catch(() => null),
    ]);
    for (const mentionUser of mentionUsers) {
      await this.interactionPermission.assertAllowed(userId, mentionUser.id, 'mentionPermission', '@用户');
    }
    for (const coCreatorId of coCreatorIds) {
      await this.interactionPermission.assertAllowed(userId, coCreatorId, 'coCreatePermission', '邀请共创');
    }
    const post = await this.prisma.post.create({
      data: {
        ...data,
        userId,
        viewCount: hasExposureBoost ? 1 : undefined,
        status: review.status,
        auditStatus: review.auditStatus,
        auditReason: hasAuditPriority && review.auditStatus === 'pending' ? `会员优先审核：${review.auditReason}` : review.auditReason,
        media: media.length ? { createMany: { data: media } } : undefined,
        topics: topicIds.length ? { create: topicIds.map((topicId: string) => ({ topicId })) } : undefined,
        mentions: mentionUsers.length
          ? { createMany: { data: mentionUsers.map((user: any) => ({ userId: user.id })), skipDuplicates: true } }
          : undefined,
        collaborators: coCreatorIds.length
          ? {
              createMany: {
                data: coCreatorIds.map((coUserId) => ({
                  userId: coUserId,
                  inviterId: userId,
                  status: 'pending',
                  inviteMessage,
                })),
                skipDuplicates: true,
              },
            }
          : undefined,
      },
      include: { ...this.miniPostInclude(), collaborators: true },
    });
    if (review.status === PostStatus.PUBLISHED) {
      await this.syncTopicPostCounts([], topicIds);
    }
    if (review.aiResult) {
      await this.aiRuntime.recordModeration({
        targetType: 'post',
        targetId: post.id,
        userId,
        regionId: data.regionId,
        approvalType: review.approvalType,
        result: review.aiResult,
        finalStatus: review.auditStatus,
      });
    }
    if (data.circleId) {
      await this.prisma.circle.update({ where: { id: data.circleId }, data: { postCount: { increment: 1 }, lastActiveAt: new Date() } }).catch(() => undefined);
    }
    if (review.status === PostStatus.PUBLISHED && mentionUsers.length) {
      await this.notifyMentionUsers({
        users: mentionUsers,
        actorId: userId,
        publicActorId: data.isAnonymous ? '' : userId,
        actorName: data.isAnonymous ? (data.anonymousName || '匿名用户') : author?.nickname || '用户',
        regionId: data.regionId,
        postId: post.id,
        scene: 'post_mention',
        title: '有人在帖子中@了你',
        content: '在帖子中@了你',
      });
    }
    await this.clearPostFeedCache(data.regionId);
    return {
      ...this.formatMiniPost(post),
      post_id: post.id,
      approval_status: review.status,
      audit_status: review.auditStatus,
      audit_reason: review.auditReason,
    };
  }

  async update(postId: string, userId: string, dto: any) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('帖子不存在');
    if (post.userId !== userId) throw new ForbiddenException('无权修改');
    await this.userAccess.assertCanCreateContent(userId, 'post', '修改笔记');
    await this.userAccess.assertStudentProtectedAction(userId, post.regionId, '修改笔记');
    const { data, media, topicIds } = await this.normalizePostPayload(dto, { partial: true });
    const hasMentionInput = dto.mentions !== undefined || dto.mention_user_ids !== undefined || dto.mentionUserIds !== undefined;
    const mentionIds = hasMentionInput ? this.normalizeMentionUserIds(dto.mentions ?? dto.mention_user_ids ?? dto.mentionUserIds, userId) : [];
    const mentionUsers = hasMentionInput ? await this.resolveMentionUsers(mentionIds) : [];
    for (const mentionUser of mentionUsers) {
      await this.interactionPermission.assertAllowed(userId, mentionUser.id, 'mentionPermission', '@用户');
    }
    const needsReview =
      ['regionId', 'region_id', 'circleId', 'circle_id', 'type', 'title', 'content', 'media', 'images', 'video', 'audio']
        .some((key) => dto[key] !== undefined)
      || this.hasTopicInput(dto);
    if (needsReview) data.interactionIntent = await this.inferCampusEchoIntent({ ...post, ...data });
    const review = needsReview
      ? await this.resolveInitialReview(
          { ...post, ...data },
          media.length
            ? media
            : await this.prisma.postMedia.findMany({ where: { postId }, select: { type: true, url: true } }),
          userId,
        )
      : null;
    const previousTopicIds = this.hasTopicInput(dto)
      ? (await this.prisma.postTopic.findMany({ where: { postId }, select: { topicId: true } })).map((item) => item.topicId)
      : [];
    const updated = await this.prisma.$transaction(async (tx) => {
      if (media.length) {
        await tx.postMedia.deleteMany({ where: { postId } });
      }
      if (this.hasTopicInput(dto)) {
        await tx.postTopic.deleteMany({ where: { postId } });
      }
      if (hasMentionInput) {
        await tx.postMention.deleteMany({ where: { postId } });
      }
      return tx.post.update({
        where: { id: postId },
        data: {
          ...data,
          ...(review
            ? {
                status: review.status,
                auditStatus: review.auditStatus,
                auditReason: review.auditReason,
              }
            : {}),
          media: media.length ? { createMany: { data: media } } : undefined,
          topics: this.hasTopicInput(dto) && topicIds.length ? { create: topicIds.map((topicId: string) => ({ topicId })) } : undefined,
          mentions: hasMentionInput && mentionUsers.length
            ? { createMany: { data: mentionUsers.map((user: any) => ({ userId: user.id })), skipDuplicates: true } }
            : undefined,
        },
        include: this.miniPostInclude(),
      });
    });
    if (this.hasTopicInput(dto)) {
      await this.syncTopicPostCounts(
        post.status === PostStatus.PUBLISHED ? previousTopicIds : [],
        updated.status === PostStatus.PUBLISHED ? topicIds : [],
      );
    }
    if (review?.aiResult) {
      await this.aiRuntime.recordModeration({
        targetType: 'post',
        targetId: postId,
        userId,
        regionId: (data.regionId || post.regionId) ?? undefined,
        approvalType: review.approvalType,
        result: review.aiResult,
        finalStatus: review.auditStatus,
      });
    }
    await Promise.all([
      this.clearPostFeedCache(post.regionId),
      data.regionId && data.regionId !== post.regionId ? this.clearPostFeedCache(data.regionId) : Promise.resolve(),
    ]);
    const formatted = await this.formatMiniPostWithDefaultCircle(updated);
    return {
      ...formatted,
      audit_status: review?.auditStatus || updated.auditStatus,
      audit_reason: review?.auditReason || updated.auditReason,
      re_reviewed: !!review,
    };
  }

  async remove(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, include: { topics: true } });
    if (!post) throw new NotFoundException('帖子不存在');
    if (post.userId !== userId) throw new ForbiddenException('无权删除');
    await this.prisma.post.update({ where: { id: postId }, data: { deletedAt: new Date(), status: 'DELETED' } });
    if (post.status === PostStatus.PUBLISHED) {
      await this.syncTopicPostCounts((post.topics || []).map((item: any) => item.topicId), []);
    }
    await this.clearPostFeedCache(post.regionId);
    return { success: true };
  }

  async incrementView(postId: string, userId?: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    await this.ensurePostAccessible(post, userId);
    const visiblePost = post!;
    const dedupeKey = userId ? `post:view:${postId}:${userId}` : '';
    if (dedupeKey) {
      const viewedRecently = await this.redis.get(dedupeKey).catch(() => null);
      if (viewedRecently) {
        return { viewed: true, counted: false, message: '浏览成功', reward_info: { reward_applied_this_time: '0.00', current_user_total_score: '0.00', today_rewarded_view_count: 0, potential_daily_view_reward: '0.00', rule_found: false } };
      }
    }
    await this.prisma.post.update({ where: { id: postId }, data: { viewCount: { increment: 1 } } });
    if (userId) {
      await this.prisma.browseHistory.create({
        data: {
          userId,
          targetType: 'post',
          targetId: postId,
          title: visiblePost.title || visiblePost.content?.slice(0, 40) || '笔记',
          image: '',
        },
      }).catch(() => undefined);
    }
    if (dedupeKey) await this.redis.set(dedupeKey, '1', 1800).catch(() => undefined);
    await this.redis.zincrby('post:hot', 1, postId);
    return { viewed: true, counted: true, message: '浏览成功', reward_info: { reward_applied_this_time: '0.00', current_user_total_score: '0.00', today_rewarded_view_count: 0, potential_daily_view_reward: '0.00', rule_found: false } };
  }

  // ============ 点赞/取消点赞（已有真实逻辑，保持不变） ============

  async like(postId: string, userId: string) {
    await this.userAccess.assertCanInteract(userId, 'like', '点赞');
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, userId: true, title: true, regionId: true, status: true, deletedAt: true },
    });
    await this.ensurePostAccessible(post, userId);
    await this.userAccess.assertStudentProtectedAction(userId, post?.regionId, '点赞');
    const created = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.like.findUnique({
        where: { userId_targetType_targetId: { userId, targetType: 'post', targetId: postId } },
      });
      if (existing) return false;
      try {
        await tx.like.create({ data: { userId, targetType: 'post', targetId: postId } });
      } catch (error: any) {
        if (error?.code === 'P2002') return false;
        throw error;
      }
      await tx.post.update({ where: { id: postId }, data: { likeCount: { increment: 1 } } });
      return true;
    });
    if (created) await this.clearPostFeedCache(post?.regionId);

    // 发送点赞通知
    if (created) try {
      const liker = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { nickname: true },
      });
      if (post && post.userId !== userId) {
        await this.notifyService.createAndDispatchInteraction({
          userId: post.userId,
          regionId: post.regionId || undefined,
          type: 'LIKE',
          scene: 'post_like',
          title: '有人点赞了你的帖子',
          content: `${liker?.nickname || '用户'} 赞了你的帖子`,
          data: { postId, fromUserId: userId },
          linkType: 'post',
          linkValue: postId,
          channelMask: { inApp: true, websocket: true },
        });
      }
    } catch {}

    const latest = await this.prisma.post.findUnique({ where: { id: postId }, select: { likeCount: true } }).catch(() => null);
    return { liked: true, changed: created, like_count: latest?.likeCount ?? undefined, likeCount: latest?.likeCount ?? undefined };
  }

  async unlike(postId: string, userId: string) {
    await this.userAccess.assertCanInteract(userId, 'like', '取消点赞');
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true, status: true, deletedAt: true, userId: true, regionId: true } });
    await this.ensurePostAccessible(post, userId);
    await this.userAccess.assertStudentProtectedAction(userId, post?.regionId, '取消点赞');
    const deleted = await this.prisma.$transaction(async (tx) => {
      const result = await tx.like.deleteMany({ where: { userId, targetType: 'post', targetId: postId } });
      if (result.count > 0) {
        await tx.post.updateMany({
          where: { id: postId, likeCount: { gt: 0 } },
          data: { likeCount: { decrement: 1 } },
        });
      }
      return result.count;
    });
    if (deleted > 0) await this.clearPostFeedCache(post?.regionId);
    const latest = await this.prisma.post.findUnique({ where: { id: postId }, select: { likeCount: true } }).catch(() => null);
    return { liked: false, changed: deleted > 0, like_count: latest?.likeCount ?? undefined, likeCount: latest?.likeCount ?? undefined };
  }

  // ============ 不感兴趣（dislike） ============

  async dislikePost(userId: string, dto: any) {
    await this.userAccess.assertCanInteract(userId, 'like', '减少推荐');
    const targetType = dto.target_type || 'post';
    const targetId = dto.target_id || dto.post_id;
    if (!targetId) throw new BadRequestException('缺少 target_id');
    if (targetType === 'post') {
      const post = await this.prisma.post.findUnique({ where: { id: targetId }, select: { regionId: true } }).catch(() => null);
      await this.userAccess.assertStudentProtectedAction(userId, post?.regionId, '减少推荐');
    } else {
      await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '减少推荐');
    }

    await this.prisma.postDislike.upsert({
      where: { userId_targetType_targetId: { userId, targetType, targetId } },
      create: { userId, targetType, targetId },
      update: {},
    });
    return { success: true, disliked: true };
  }

  // ============ 拉黑 ============

  async blockAuthor(userId: string, dto: any) {
    await this.userAccess.assertCanInteract(userId, 'follow', '拉黑用户');
    await this.userAccess.assertCurrentRegionStudentProtectedAction(userId, '拉黑用户');
    const { author_id } = dto;
    if (!author_id) throw new BadRequestException('缺少 author_id');
    if (author_id === userId) throw new BadRequestException('不能拉黑自己');
    await this.prisma.block.upsert({
      where: { userId_blockedId: { userId, blockedId: author_id } },
      create: { userId, blockedId: author_id },
      update: {},
    });
    return { success: true };
  }

  // ============ 举报 ============

  async reportPost(userId: string, dto: any) {
    await this.userAccess.assertCanInteract(userId, 'report', '举报');
    const postId = dto.post_id || dto.postId || dto.target_id || dto.targetId;
    if (!postId) throw new BadRequestException('缺少帖子ID');
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, userId: true, status: true, deletedAt: true, regionId: true },
    });
    await this.ensurePostAccessible(post, userId);
    await this.userAccess.assertStudentProtectedAction(userId, post?.regionId, '举报');
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existing = await this.prisma.report.findFirst({
      where: {
        reporterId: userId,
        targetType: 'post',
        targetId: postId,
        status: { in: ['pending', 'processing'] },
        createdAt: { gte: oneDayAgo },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return { ...existing, duplicated: true };
    return this.prisma.report.create({
      data: {
        reporterId: userId,
        reportedId: post?.userId,
        targetType: 'post',
        targetId: postId,
        reason: dto.report_type || dto.reason || '用户举报',
        detail: dto.description || dto.detail,
        images: dto.evidence_images || dto.images || null,
      },
    });
  }

  // ============ 共创者 ============

  async getCoCreators(postId: string) {
    return this.prisma.postCollaborator.findMany({
      where: { postId, status: 'accepted' },
      include: { user: this.miniAuthorSelect() },
    });
  }

  async inviteCoCreators(postId: string, userId: string, dto: any) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { userId: true, regionId: true } });
    if (!post) throw new NotFoundException('帖子不存在');
    if (post.userId !== userId) throw new ForbiddenException('只有作者可以邀请共创者');
    // AUD-P1-142: 校验区域是否允许共创笔记
    const coConfig = await this.prisma.config.findUnique({
      where: { key: `content.note_settings.${post.regionId}` },
      select: { value: true },
    }).catch(() => null);
    if (coConfig?.value && typeof coConfig.value === 'object' && !(coConfig.value as any).enable_co_create_note) {
      throw new BadRequestException('当前区域未开启共创笔记功能');
    }
    const userIds = this.normalizeCoCreatorIds(dto, userId);
    if (!userIds.length) throw new BadRequestException('缺少共创者用户');
    for (const coUserId of userIds) {
      await this.interactionPermission.assertAllowed(userId, coUserId, 'coCreatePermission', '邀请共创');
    }
    const inviteMessage = this.normalizeOptionalString(dto.co_creator_invite_message ?? dto.coCreatorInviteMessage ?? dto.invite_message ?? dto.inviteMessage);
    await this.prisma.$transaction(async (tx) => {
      await Promise.all(userIds.map((coUserId) => tx.postCollaborator.upsert({
        where: { postId_userId: { postId, userId: coUserId } },
        create: {
          postId,
          userId: coUserId,
          inviterId: userId,
          status: 'pending',
          inviteMessage,
        },
        update: {
          inviterId: userId,
          status: 'pending',
          inviteMessage,
          acceptedAt: null,
          rejectedAt: null,
          operatorId: null,
        },
      })));
      await tx.post.update({ where: { id: postId }, data: { isCoCreate: true } });
    });
    return { success: true, count: userIds.length };
  }

  async respondCoCreatorInvite(postId: string, userId: string, dto: any) {
    const action = String(dto.action || dto.status || '').toLowerCase();
    const invite = await this.prisma.postCollaborator.findUnique({
      where: { postId_userId: { postId, userId } },
    });
    if (!invite) throw new NotFoundException('共创邀请不存在');

    if (action === 'accept' || action === 'accepted') {
      const item = await this.prisma.postCollaborator.update({
        where: { postId_userId: { postId, userId } },
        data: {
          status: 'accepted',
          acceptedAt: new Date(),
          rejectedAt: null,
          operatorId: userId,
        },
      });
      return { success: true, accepted: true, data: item };
    }
    if (action === 'reject' || action === 'rejected' || action === 'decline') {
      await this.prisma.postCollaborator.update({
        where: { postId_userId: { postId, userId } },
        data: {
          status: 'rejected',
          rejectedAt: new Date(),
          acceptedAt: null,
          operatorId: userId,
        },
      });
      return { success: true, accepted: false };
    }
    throw new BadRequestException('不支持的共创操作');
  }

  async removeCoCreator(postId: string, userId: string, coCreatorId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { userId: true } });
    if (!post) throw new NotFoundException('帖子不存在');
    if (post.userId !== userId) throw new ForbiddenException('只有作者可以移除共创者');
    // AUD-P1-142: 软删除，保留可追溯状态
    await this.prisma.postCollaborator.updateMany({
      where: { postId, userId: coCreatorId },
      data: { status: 'removed', operatorId: userId },
    });
    return { success: true };
  }

  async myCoCreatorInvites(userId: string, query: any) {
    const { page = 1, pageSize = 20 } = query;
    const where: any = { userId };
    const status = this.normalizeOptionalString(query.status);
    if (status) where.status = status;
    // 查询用户作为共创者的记录，排除自己发的帖子
    const [list, total] = await Promise.all([
      this.prisma.postCollaborator.findMany({
        where,
        include: {
          post: {
            select: { id: true, title: true, content: true, user: this.miniAuthorSelect() },
          },
        },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.postCollaborator.count({ where }),
    ]);
    // AUD-P1-141: 包装为前端期望的 success/data/pagination 格式，字段映射为蛇形命名
    return {
      success: true,
      data: {
        list: list.map((c) => ({
          id: c.id,
          post_id: c.postId,
          post_title: c.post?.title,
          invited_at: c.createdAt,
          inviter_avatar: c.post?.user?.avatar,
          inviter_nickname: c.post?.user?.nickname,
          inviter_id: c.post?.user?.id,
          status: c.status,
          invite_message: c.inviteMessage || '',
        })),
        pagination: { total, page, pageSize },
      },
    };
  }

  // ============ 蹲帖 ============

  async squatPost(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    await this.ensurePostAccessible(post, userId);
    const visiblePost = post!;

    await this.prisma.postSquat.upsert({
      where: { postId_userId: { postId, userId } },
      create: { postId, userId },
      update: {},
    });

    // 发送蹲帖通知
    try {
      const squatter = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { nickname: true },
      });
      if (visiblePost.userId !== userId) {
        await this.notifyService.createAndDispatchInteraction({
          userId: visiblePost.userId,
          regionId: visiblePost.regionId || undefined,
          type: 'SQUAT',
          scene: 'post_squat',
          title: '有人蹲了你的帖子',
          content: `${squatter?.nickname || '用户'} 蹲了你的帖子`,
          data: {
            postId,
            fromUserId: userId,
            direction: 'inbound',
            targetType: 'post',
            targetTitle: visiblePost.title || '',
            targetContent: visiblePost.content || '',
          },
          linkType: 'post',
          linkValue: postId,
          channelMask: { inApp: true, websocket: true },
        }, {
          actorId: userId,
          cooldownMs: 24 * 60 * 60 * 1000,
        });
      }
    } catch {}

    return { success: true, isSquatting: true };
  }

  async checkSquat(postId: string, userId: string) {
    const squat = await this.prisma.postSquat.findUnique({
      where: { postId_userId: { postId, userId } },
    });
    return { isSquatting: !!squat };
  }

  async unsquatPost(postId: string, userId: string) {
    await this.prisma.postSquat.deleteMany({
      where: { postId, userId },
    });
    return { success: true, isSquatting: false };
  }

  async mySquats(userId: string, query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.postSquat.findMany({
        where: { userId },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.postSquat.count({ where: { userId } }),
    ]);

    // 批量查帖子信息
    const postIds = list.map((s) => s.postId);
    const posts = postIds.length > 0
      ? await this.prisma.post.findMany({
          where: { id: { in: postIds } },
          select: { id: true, title: true, content: true, user: this.miniAuthorSelect() },
        })
      : [];
    const postMap = new Map(posts.map((p) => [p.id, p]));

    return {
      list: list.map((s) => {
        const p = postMap.get(s.postId);
        return {
          id: s.id,
          postId: s.postId,
          postTitle: p?.title,
          postContent: p?.content?.slice(0, 200),
          postUser: p?.user,
          createdAt: s.createdAt,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  // ============ 投票 ============

  private formatPostVoteOption(option: any, count = 0) {
    return {
      id: option.id,
      option_id: option.id,
      option_key: String(Number(option.sortOrder || 0) + 1),
      text: option.text,
      option_text: option.text,
      count,
      sortOrder: option.sortOrder,
      sort_order: option.sortOrder,
    };
  }

  private formatPostVoteSettings(vote: any) {
    return {
      vote_id: vote.id,
      voteId: vote.id,
      post_id: vote.postId,
      postId: vote.postId,
      title: vote.title,
      max_votes_per_user: vote.maxSelect,
      maxSelect: vote.maxSelect,
      allow_change_vote: vote.allowAdd ? 1 : 0,
      allowChangeVote: !!vote.allowAdd,
      allow_add: vote.allowAdd ? 1 : 0,
      allowAdd: !!vote.allowAdd,
      voting_end_time: vote.endAt,
      votingEndTime: vote.endAt,
      is_enabled: vote.endAt ? (new Date() > new Date(vote.endAt) ? 0 : 1) : 1,
      isAnonymousVote: !!vote.isAnonymousVote,
      is_anonymous_vote: !!vote.isAnonymousVote,
    };
  }

  async getVoteMeta(postId: string, userId?: string) {
    const vote = await this.prisma.postVote.findUnique({
      where: { postId },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!vote) return null;
    const record = userId
      ? await this.prisma.postVoteRecord.findUnique({
          where: { voteId_userId: { voteId: vote.id, userId } },
          select: { optionIds: true, isAnonymous: true },
        }).catch(() => null)
      : null;
    const userVotes = Array.isArray(record?.optionIds) ? record.optionIds : [];
    return {
      id: vote.id,
      voteId: vote.id,
      vote_id: vote.id,
      postId: vote.postId,
      post_id: vote.postId,
      title: vote.title,
      maxSelect: vote.maxSelect,
      isAnonymousVote: !!vote.isAnonymousVote,
      is_anonymous_vote: !!vote.isAnonymousVote,
      settings: this.formatPostVoteSettings(vote),
      options: vote.options.map((option) => this.formatPostVoteOption(option)),
      user_votes: userVotes,
      user_vote_option_ids: userVotes,
      has_voted: userVotes.length > 0,
      is_anonymous_record: !!record?.isAnonymous,
    };
  }

  async getVoteStats(postId: string) {
    const vote = await this.prisma.postVote.findUnique({
      where: { postId },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!vote) {
      return { totalVotes: 0, options: [] };
    }

    // 查询该投票的所有投票记录
    const records = await this.prisma.postVoteRecord.findMany({
      where: { voteId: vote.id },
      select: { optionIds: true },
    });

    // 统计每个选项的票数
    const optionVoteCount: Record<string, number> = {};
    for (const opt of vote.options) {
      optionVoteCount[opt.id] = 0;
    }
    for (const rec of records) {
      const ids = rec.optionIds as string[];
      if (Array.isArray(ids)) {
        for (const oid of ids) {
          if (optionVoteCount[oid] !== undefined) {
            optionVoteCount[oid]++;
          }
        }
      }
    }

    return {
      voteId: vote.id,
      vote_id: vote.id,
      title: vote.title,
      maxSelect: vote.maxSelect,
      max_votes_per_user: vote.maxSelect,
      isAnonymousVote: !!(vote as any).isAnonymousVote,
      is_anonymous_vote: !!(vote as any).isAnonymousVote,
      settings: this.formatPostVoteSettings(vote),
      totalVotes: records.length,
      options: vote.options.map((opt) => this.formatPostVoteOption(opt, optionVoteCount[opt.id] || 0)),
    };
  }

  async vote(userId: string, dto: any) {
    let voteId = dto.vote_id || dto.voteId;
    const postId = dto.post_id || dto.postId;
    const optionIds: string[] = (dto.option_ids || dto.optionIds || (dto.option_id || dto.optionId ? [dto.option_id || dto.optionId] : []))
      .map((id: any) => String(id || '').trim())
      .filter(Boolean);
    const wantsAnonymous = [dto.is_anonymous, dto.isAnonymous, dto.anonymous].some((value) => value === true || value === 1 || value === '1');

    if (!voteId && postId) {
      const existing = await this.prisma.postVote.findUnique({ where: { postId: String(postId) }, select: { id: true } });
      voteId = existing?.id;
    }
    if (!voteId) throw new BadRequestException('缺少 vote_id');
    if (optionIds.length === 0) throw new BadRequestException('请选择投票选项');

    // 确认投票存在
    const vote = await this.prisma.postVote.findUnique({
      where: { id: voteId },
      include: { options: true },
    });
    if (!vote) throw new NotFoundException('投票不存在');

    // 检查选项是否属于该投票
    const validOptionIds = new Set(vote.options.map((o) => o.id));
    for (const oid of optionIds) {
      if (!validOptionIds.has(oid)) {
        throw new BadRequestException(`无效的投票选项: ${oid}`);
      }
    }

    // AUD-P1-140: 投票规则服务端校验（截止时间、是否允许改投）
    if (vote.endAt && new Date() > new Date(vote.endAt)) {
      throw new BadRequestException('投票已截止');
    }
    // 检查如果已投票且不允许修改，拒绝改投
    const existingVote = await this.prisma.postVoteRecord.findUnique({
      where: { voteId_userId: { voteId, userId } },
    }).catch(() => null);
    if (existingVote && !vote.allowAdd) {
      throw new BadRequestException('该投票不允许修改投票');
    }

    // 检查单选/多选限制
    if (vote.maxSelect > 0 && optionIds.length > vote.maxSelect) {
      throw new BadRequestException(`该投票最多选择 ${vote.maxSelect} 项`);
    }

    // 幂等写入
    await this.prisma.postVoteRecord.upsert({
      where: { voteId_userId: { voteId, userId } },
      create: { voteId, userId, optionIds, isAnonymous: !!((vote as any).isAnonymousVote || wantsAnonymous) },
      update: { optionIds, isAnonymous: !!((vote as any).isAnonymousVote || wantsAnonymous) },
    });

    return { success: true, voted: true, vote_id: voteId, voteId, option_ids: optionIds, optionIds };
  }

  async unvote(userId: string, dto: any) {
    let voteId = dto.vote_id || dto.voteId;
    const postId = dto.post_id || dto.postId;
    if (!voteId && postId) {
      const existing = await this.prisma.postVote.findUnique({ where: { postId: String(postId) }, select: { id: true } });
      voteId = existing?.id;
    }
    if (!voteId) throw new BadRequestException('缺少 vote_id');

    // AUD-P1-140: 取消投票也需校验规则
    const vote = await this.prisma.postVote.findUnique({ where: { id: voteId }, select: { endAt: true, allowAdd: true } });
    if (vote?.endAt && new Date() > new Date(vote.endAt)) {
      throw new BadRequestException('投票已截止，无法取消');
    }
    if (vote && !vote.allowAdd) {
      throw new BadRequestException('该投票不允许修改投票');
    }

    await this.prisma.postVoteRecord.deleteMany({
      where: { voteId, userId },
    });

    return { success: true, voted: false };
  }

  async createVoteOptions(userId: string, dto: any) {
    const { options } = dto;
    let voteId = dto.vote_id || dto.voteId;
    if (!voteId && (dto.post_id || dto.postId)) {
      const result = await this.upsertVoteSettings(userId, { post_id: dto.post_id || dto.postId });
      voteId = result.voteId;
    }
    if (!voteId) throw new BadRequestException('缺少 vote_id');
    if (!options || !Array.isArray(options) || options.length === 0) {
      throw new BadRequestException('缺少投票选项');
    }

    // 确认投票存在且属于该用户（通过帖子归属校验）
    const vote = await this.prisma.postVote.findUnique({
      where: { id: voteId },
    });
    if (!vote) throw new NotFoundException('投票不存在');

    // 查帖子确认归属
    const post = await this.prisma.post.findUnique({
      where: { id: vote.postId },
      select: { userId: true },
    });
    if (!post || post.userId !== userId) {
      throw new ForbiddenException('无权修改此帖子的投票选项');
    }

    const data = options.map((opt: any, idx: number) => ({
      voteId,
      text: String(opt.text || opt.option_text || opt.title || opt).trim(),
      sortOrder: opt.sortOrder ?? idx,
    })).filter((item: any) => item.text);
    if (!data.length) throw new BadRequestException('缺少投票选项');

    await this.prisma.postVoteOption.deleteMany({ where: { voteId } });
    await this.prisma.postVoteOption.createMany({ data });
    return { success: true, count: data.length };
  }

  async upsertVoteSettings(userId: string, dto: any) {
    const {
      post_id,
      title,
      max_select,
      maxSelect,
      max_votes_per_user,
      allow_add,
      allowAdd,
      allow_change_vote,
      allowChangeVote,
      is_anonymous_vote,
      isAnonymousVote,
      anonymous,
      end_at,
      endAt,
      voting_end_time,
    } = dto;
    const postId = post_id || dto.postId;
    if (!postId) throw new BadRequestException('缺少 post_id');

    // 确认帖子存在且属于该用户
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('帖子不存在');
    if (post.userId !== userId) throw new ForbiddenException('无权修改此帖子的投票设置');

    // AUD-P1-139: 校验区域是否允许投票（服务端最终裁决，不依赖前端）
    const voteConfig = await this.prisma.config.findUnique({
      where: { key: `content.note_settings.${post.regionId}` },
      select: { value: true },
    }).catch(() => null);
    if (voteConfig?.value && typeof voteConfig.value === 'object' && !(voteConfig.value as any).enable_vote) {
      throw new BadRequestException('当前区域未开启投票功能');
    }

    const data: any = {};
    const normalizedMaxSelect = max_select ?? maxSelect ?? max_votes_per_user;
    const normalizedAllowAdd = allow_add ?? allowAdd ?? allow_change_vote ?? allowChangeVote;
    const normalizedAnonymousVote = is_anonymous_vote ?? isAnonymousVote ?? anonymous;
    const normalizedEndAt = end_at ?? endAt ?? voting_end_time;
    const usesAdvancedConfig =
      Number(normalizedMaxSelect || 1) > 1 ||
      normalizedAllowAdd === true || normalizedAllowAdd === 1 || normalizedAllowAdd === '1' ||
      !!normalizedEndAt;
    if (usesAdvancedConfig && !(await this.membershipService.hasBenefit(userId, 'advanced_content_tools').catch(() => false))) {
      throw new BadRequestException('多选/追加选项/截止时间属于会员高级配置，请先开通会员');
    }
    if (title !== undefined) data.title = title;
    if (normalizedMaxSelect !== undefined) data.maxSelect = Number(normalizedMaxSelect) || 1;
    if (normalizedAllowAdd !== undefined) data.allowAdd = normalizedAllowAdd === true || normalizedAllowAdd === 1 || normalizedAllowAdd === '1';
    if (normalizedAnonymousVote !== undefined) data.isAnonymousVote = normalizedAnonymousVote === true || normalizedAnonymousVote === 1 || normalizedAnonymousVote === '1';
    if (normalizedEndAt !== undefined) data.endAt = normalizedEndAt ? new Date(normalizedEndAt) : null;

    const vote = await this.prisma.postVote.upsert({
      where: { postId },
      create: {
        postId,
        title: title || '投票',
        maxSelect: Number(normalizedMaxSelect) || 1,
        allowAdd: normalizedAllowAdd === true || normalizedAllowAdd === 1 || normalizedAllowAdd === '1',
        isAnonymousVote: normalizedAnonymousVote === true || normalizedAnonymousVote === 1 || normalizedAnonymousVote === '1',
        endAt: normalizedEndAt ? new Date(normalizedEndAt) : null,
      },
      update: data,
    });

    return { success: true, voteId: vote.id, vote_id: vote.id, isAnonymousVote: vote.isAnonymousVote, is_anonymous_vote: vote.isAnonymousVote };
  }

  // ============ 帖子进度（保留，无副作用） ============

  async getPostProgress(postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { _count: { select: { likes: true, comments: true, favorites: true } }, viewCount: true, likeCount: true, commentCount: true },
    });
    if (!post) throw new NotFoundException('帖子不存在');
    return {
      postId,
      viewCount: post.viewCount,
      likeCount: post.likeCount,
      commentCount: post._count.comments,
      favoriteCount: post._count.favorites,
    };
  }

  // ============ 模拟操作（仅开发/测试环境） ============

  async simulateActions(userId: string, dto: any) {
    const nodeEnv = process.env.NODE_ENV;
    if (nodeEnv === 'production') {
      throw new ForbiddenException('生产环境不允许模拟操作');
    }

    const { post_id, action, count = 1 } = dto;
    if (!post_id) throw new BadRequestException('缺少 post_id');
    if (!action) throw new BadRequestException('缺少 action');
    if (count < 1 || count > 100) throw new BadRequestException('count 范围 1~100');

    const post = await this.prisma.post.findUnique({ where: { id: post_id } });
    if (!post) throw new NotFoundException('帖子不存在');

    switch (action) {
      case 'view':
        await this.prisma.post.update({
          where: { id: post_id },
          data: { viewCount: { increment: count } },
        });
        break;
      case 'like':
        await this.prisma.post.update({
          where: { id: post_id },
          data: { likeCount: { increment: count } },
        });
        // 批量创建 likes
        for (let i = 0; i < count; i++) {
          await this.prisma.like
            .create({
              data: { userId: `sim_${Date.now()}_${i}`, targetType: 'post', targetId: post_id },
            })
            .catch(() => {}); // 忽略重复
        }
        break;
      case 'comment':
        await this.prisma.post.update({
          where: { id: post_id },
          data: { commentCount: { increment: count } },
        });
        break;
      default:
        throw new BadRequestException(`不支持的操作类型: ${action}`);
    }

    return { success: true, action, count, postId: post_id };
  }
}
