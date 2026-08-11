import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { NotifyService } from '../notify/notify.service';
import { AiRuntimeService, type AiModerationResult } from '../ai-runtime/ai-runtime.service';
import { QrcodeModerationService } from '../ai-runtime/qrcode-moderation.service';
import { UserAccessPolicyService } from '../../common/services/user-access-policy.service';
import { InteractionPermissionService } from '../../common/services/interaction-permission.service';
import { MembershipService } from '../membership/membership.service';

@Injectable()
export class CommentService {
  private readonly noteSettingsCacheTtl = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notifyService: NotifyService,
    private readonly aiRuntime: AiRuntimeService,
    private readonly qrcodeModeration: QrcodeModerationService,
    private readonly userAccess: UserAccessPolicyService,
    private readonly interactionPermission: InteractionPermissionService,
    private readonly membershipService: MembershipService,
  ) {}

  private async getRawNoteSettings(regionId?: string | null): Promise<Record<string, any>> {
    if (!regionId) return {};
    const cacheKey = `comment:settings:${regionId}`;
    const cached = await this.redis.getJson<Record<string, any>>(cacheKey).catch(() => null);
    if (cached) return cached;
    const config = await this.prisma.config.findUnique({
      where: { key: `content.note_settings.${regionId}` },
      select: { value: true },
    });
    const settings = ((config?.value as Record<string, any>) || {}) as Record<string, any>;
    await this.redis.setJson(cacheKey, settings, this.noteSettingsCacheTtl).catch(() => undefined);
    return settings;
  }

  private async clearPostFeedCache(regionId?: string | null) {
    if (!regionId) return;
    await this.redis.delPattern(`post:feed:${regionId}:*`).catch(() => undefined);
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

  private miniCommentAuthorSelect() {
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

  private async getCommentReviewSettings(regionId?: string | null) {
    if (!regionId) return { approvalType: 'none', aiFailureToManual: true };
    const settings = await this.getRawNoteSettings(regionId);
    return {
      approvalType: String(settings.comment_approval_type || 'none').toLowerCase(),
      aiFailureToManual: this.toSettingFlag(
        settings.ai_review_failure_to_manual ?? settings.ai_review_failed_to_manual ?? settings.ai_manual_fallback,
        1,
      ) === 1,
    };
  }

  private toArray(value: any): any[] {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return [value];
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
    commentId: string;
  }) {
    const actorName = params.actorName || '用户';
    await Promise.all(params.users
      .filter((user) => user?.id && user.id !== params.actorId)
      .map((user) => this.notifyService.createAndDispatchInteraction({
        userId: user.id,
        regionId: params.regionId || undefined,
        type: 'MENTION',
        scene: 'comment_mention',
        title: '有人在评论中@了你',
        content: `${actorName}在评论中@了你`,
        data: { postId: params.postId, commentId: params.commentId, fromUserId: params.publicActorId ?? params.actorId },
        linkType: 'post',
        linkValue: params.postId,
        channelMask: { inApp: true, websocket: true },
      }, { actorId: params.actorId }).catch(() => undefined)));
  }

  private normalizeCommentImages(dto: any): string[] {
    const urls: string[] = [];
    for (const item of this.toArray(dto.images ?? dto.image_urls ?? dto.comment_images)) {
      if (item) urls.push(typeof item === 'string' ? item : item.url || item.src || '');
    }
    for (const item of this.toArray(dto.media)) {
      const type = String(item?.type || 'image').toLowerCase();
      if (typeof item === 'string' || type === 'image') urls.push(typeof item === 'string' ? item : item.url || item.src || '');
    }
    return [...new Set(urls.map((url) => String(url || '').trim()).filter(Boolean))];
  }

  private normalizeStoredCommentImages(value: any): string[] {
    const urls: string[] = [];
    const pushImage = (item: any) => {
      if (!item) return;
      if (typeof item === 'string') {
        urls.push(item);
        return;
      }
      urls.push(item.url || item.src || item.image || item.image_url || item.imageUrl || '');
    };
    for (const item of this.toArray(value)) pushImage(item);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const item of this.toArray(value.list ?? value.urls ?? value.images)) pushImage(item);
    }
    return [...new Set(urls.map((url) => String(url || '').trim()).filter(Boolean))];
  }

  private toSettingInt(value: any, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
  }

  private toSettingFlag(value: any, fallback: number) {
    if (value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true') return 1;
    if (value === false || value === 0 || value === '0' || String(value).toLowerCase() === 'false') return 0;
    return fallback;
  }

  private buildNoteSettings(raw: Record<string, any> | null | undefined, currentCommentCount: number) {
    const settings = raw || {};
    const maxComments = this.toSettingInt(settings.max_comments, 0);
    const commentCount = Math.max(0, Math.floor(Number(currentCommentCount) || 0));
    const isLimited = maxComments > 0;
    const remainingComments = isLimited ? Math.max(0, maxComments - commentCount) : 999999;

    return {
      ...{
        allow_comments: 1,
        max_comments: 0,
        comment_length_limit: 500,
        allow_anonymous_comments: 0,
        allow_author_pin_comment: 0,
        comment_approval_type: 'none',
        ai_review_failure_to_manual: 1,
      },
      ...settings,
      allow_comments: this.toSettingFlag(settings.allow_comments, 1),
      max_comments: maxComments,
      comment_length_limit: this.toSettingInt(settings.comment_length_limit, 500) || 500,
      comment_count: commentCount,
      remaining_comments: remainingComments,
      is_comment_full: isLimited && commentCount >= maxComments,
    };
  }

  private async getNoteSettings(regionId?: string | null, currentCommentCount = 0) {
    const settings = await this.getRawNoteSettings(regionId);
    return this.buildNoteSettings(settings, currentCommentCount);
  }

  private async getRandomAnonymousIdentity(regionId: string) {
    const where = { regionId };
    const count = await this.prisma.anonymousIdentity.count({ where });
    if (!count) return null;
    const skip = Math.floor(Math.random() * count);
    return this.prisma.anonymousIdentity.findFirst({ where, skip, orderBy: { id: 'asc' } });
  }

  private async resolveAnonymousCommentPayload(regionId: string | null | undefined, settings: Record<string, any>, dto: any) {
    const anonymousId = String(dto.anonymous_id ?? dto.anonymousId ?? '').trim();
    const wantsAnonymous = !!anonymousId || [dto.is_anonymous, dto.isAnonymous].some((value) => value === true || value === 1 || value === '1');
    if (!wantsAnonymous) return {};
    if (this.toSettingFlag(settings.allow_anonymous_comments, 0) !== 1) {
      throw new BadRequestException('当前区域未开启匿名评论');
    }
    if (!regionId) throw new BadRequestException('匿名评论必须属于区域');
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

  private isCountedComment(comment: any) {
    return !!comment && !comment.deletedAt && comment.status === 'active' && comment.auditStatus === 'approved';
  }

  private visibleCommentWhere(extra: Record<string, any> = {}) {
    return {
      ...extra,
      deletedAt: null,
      status: 'active',
      auditStatus: 'approved',
    };
  }

  private async assertPostOwner(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, userId: true, regionId: true, commentCount: true },
    });
    if (!post) throw new NotFoundException('帖子不存在');
    if (post.userId !== userId) throw new ForbiddenException('只有作者可以执行该操作');
    return post;
  }

  private async assertPostLotteryManager(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        userId: true,
        regionId: true,
        commentCount: true,
        region: { select: { managerUserId: true } },
      },
    });
    if (!post) throw new NotFoundException('帖子不存在');
    if (post.userId === userId) return post;
    if (post.region?.managerUserId === userId) return post;
    throw new ForbiddenException('只有作者或区域管理员可以执行该操作');
  }

  private async resolveCommentReview(
    content: string,
    regionId?: string | null,
    imageUrls: string[] = [],
    userId?: string | null,
  ): Promise<{
    status: string;
    auditStatus: string;
    auditReason: string;
    approvalType: string;
    aiResult?: AiModerationResult;
  }> {
    const { approvalType, aiFailureToManual } = await this.getCommentReviewSettings(regionId);
    const qrcodeResult = await this.qrcodeModeration.reviewImages({
      targetType: 'comment',
      regionId,
      userId,
      approvalType,
      imageUrls,
    });
    if (qrcodeResult) {
      if (qrcodeResult.decision === 'reject') {
        return { status: 'hidden', auditStatus: 'rejected', auditReason: qrcodeResult.reason || '评论图片包含违规二维码', approvalType: 'qrcode_filter', aiResult: qrcodeResult };
      }
      return { status: 'hidden', auditStatus: 'pending', auditReason: qrcodeResult.reason || '评论图片疑似包含二维码，等待人工审核', approvalType: 'qrcode_filter', aiResult: qrcodeResult };
    }

    // AUD-P1-152: 敏感词检查在所有审核类型前执行
    const sensitiveHit = await this.aiRuntime.detectSensitiveHit(content);
    if (sensitiveHit) {
      const level = String(sensitiveHit.level || 'audit').toLowerCase();
      if (level === 'strict') {
        return { status: 'hidden', auditStatus: 'rejected', auditReason: `命中敏感词：${sensitiveHit.word}`, approvalType: 'sensitive_word' };
      }
      if (level === 'audit') {
        return { status: 'hidden', auditStatus: 'pending', auditReason: `命中敏感词：${sensitiveHit.word}（${sensitiveHit.category || '其他'}）`, approvalType: 'sensitive_word' };
      }
    }

    if (['none', 'auto', 'pass', 'published', 'approved'].includes(approvalType)) {
      return { status: 'active', auditStatus: 'approved', auditReason: '无需审核', approvalType };
    }
    if (['ai', 'llm', 'model'].includes(approvalType)) {
      const result = await this.aiRuntime.moderateContent({
        type: 'comment',
        content,
        regionId,
        approvalType,
        manualFallback: aiFailureToManual,
      });
      if (result.decision === 'approve') return { status: 'active', auditStatus: 'approved', auditReason: result.reason || 'AI审核通过', approvalType, aiResult: result };
      if (result.decision === 'reject') return { status: 'hidden', auditStatus: 'rejected', auditReason: result.reason || 'AI审核不通过', approvalType, aiResult: result };
      return { status: 'hidden', auditStatus: 'pending', auditReason: result.reason || 'AI建议人工复核', approvalType, aiResult: result };
    }
    return { status: 'hidden', auditStatus: 'pending', auditReason: '等待人工审核', approvalType };
  }

  private toIsoDate(value?: Date | string | null) {
    if (!value) return '';
    return value instanceof Date ? value.toISOString() : value;
  }

  private selectRegionalTitleRecord(records: any[], regionId?: string | null) {
    const scopeRegionId = String(regionId || '').trim();
    if (!records.length) return null;
    if (!scopeRegionId) return records.find((record: any) => !record?.title?.regionId) || records[0];
    return records.find((record: any) => record?.title?.regionId === scopeRegionId)
      || records.find((record: any) => !record?.title?.regionId)
      || records[0];
  }

  private formatCommentUser(user?: any, memberIds: Set<string> = new Set(), anonymous?: any, regionId?: string | null) {
    const isAnonymous = !!anonymous?.isAnonymous;
    const anonymousName = String(anonymous?.anonymousName || anonymous?.anonymousIdentity?.name || '匿名用户').trim() || '匿名用户';
    const anonymousAvatar = this.publicAssetUrl(anonymous?.anonymousAvatar || anonymous?.anonymousIdentity?.avatar || '/static/logo.jpg');
    const name = isAnonymous ? anonymousName : (user?.nickname || '用户');
    const isMember = !!user?.id && memberIds.has(user.id);
    const currentRecord = this.selectRegionalTitleRecord(Array.isArray(user?.titleRecords) ? user.titleRecords : [], regionId);
    const title = currentRecord?.title || null;
    const titleImageUrl = this.publicAssetUrl(title?.image || title?.icon || '');
    const badges: any[] = [];
    const publicUid = user?.publicUid || user?.uid || null;
    return {
      id: isAnonymous ? '' : (user?.id || ''),
      user_id: isAnonymous ? '' : (user?.id || ''),
      uid: isAnonymous ? null : publicUid,
      public_uid: isAnonymous ? null : publicUid,
      publicUid: isAnonymous ? null : publicUid,
      legacy_uid: isAnonymous ? null : (user?.uid || null),
      name,
      nickname: name,
      avatar: isAnonymous ? anonymousAvatar : this.publicAssetUrl(user?.avatar),
      type: 0,
      is_anonymous: isAnonymous,
      isAnonymous,
      anonymous_identity_id: isAnonymous ? (anonymous?.anonymousIdentityId || '') : '',
      anonymousIdentityId: isAnonymous ? (anonymous?.anonymousIdentityId || '') : '',
      is_member: isMember,
      isMember,
      member_badge: isMember ? '会员' : '',
      memberBadge: isMember ? '会员' : '',
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

  private formatCommentForMini(comment: any, replyTarget?: any, memberIds: Set<string> = new Set()) {
    const createdAt = this.toIsoDate(comment.createdAt);
    const updatedAt = this.toIsoDate(comment.updatedAt);
    const commentRegionId = comment.post?.regionId || comment.regionId || null;
    const replyUser = replyTarget ? this.formatCommentUser(replyTarget.user || replyTarget, memberIds, replyTarget, commentRegionId) : null;
    const isAnonymous = !!comment?.isAnonymous;
    return {
      id: comment.id,
      comment_id: comment.id,
      post_id: comment.postId,
      postId: comment.postId,
      user_id: isAnonymous ? '' : comment.userId,
      userId: isAnonymous ? '' : comment.userId,
      parent_id: comment.parentId || '',
      parentId: comment.parentId || null,
      parent_type: comment.parentId ? 'comment' : 'post',
      content: comment.content,
      province: '',
      like_count: comment.likeCount || 0,
      likeCount: comment.likeCount || 0,
      is_pinned: !!comment.isTop,
      isTop: !!comment.isTop,
      status: comment.status,
      audit_status: comment.auditStatus,
      auditStatus: comment.auditStatus,
      audit_reason: comment.auditReason || '',
      auditReason: comment.auditReason || '',
      is_anonymous: isAnonymous,
      isAnonymous,
      anonymous_identity_id: isAnonymous ? (comment.anonymousIdentityId || '') : '',
      anonymousIdentityId: isAnonymous ? (comment.anonymousIdentityId || '') : '',
      images: this.normalizeStoredCommentImages(comment.images),
      image_urls: this.normalizeStoredCommentImages(comment.images),
      created_at: createdAt,
      create_time: createdAt,
      updated_at: updatedAt,
      user: this.formatCommentUser(comment.user, memberIds, comment, commentRegionId),
      reply_user: replyUser,
      reply_user_id: replyUser?.id || '',
      reply_nickname: replyUser?.name || '',
      mentions: this.formatMentions(comment.mentions || []),
      list: [],
      replies: [],
      list_count: 0,
    };
  }

  async getCommentsV2(postId: string, query: any, currentUserId?: string) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || query.limit) || 20));
    const sonPage = Math.min(50, Math.max(0, Number(query.sonPage) || 10));
    const visibleWhere = this.visibleCommentWhere({ postId });
    const targetCommentId = String(query.targetCommentId || query.target_comment_id || query.commentId || query.comment_id || '').trim();
    const [post, list, total, visibleTotal] = await Promise.all([
      this.prisma.post.findUnique({
        where: { id: postId },
        select: {
          userId: true,
          regionId: true,
          commentCount: true,
          region: { select: { managerUserId: true } },
        },
      }),
      this.prisma.comment.findMany({
        where: { ...visibleWhere, parentId: null },
        include: {
          user: this.miniCommentAuthorSelect(),
          anonymousIdentity: true,
          replies: {
            where: this.visibleCommentWhere(),
            include: {
              user: this.miniCommentAuthorSelect(),
              anonymousIdentity: true,
              mentions: { include: { user: this.miniCommentAuthorSelect() }, orderBy: { createdAt: 'asc' } },
            },
            orderBy: [{ createdAt: 'asc' }],
            take: sonPage,
          },
          mentions: { include: { user: this.miniCommentAuthorSelect() }, orderBy: { createdAt: 'asc' } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ isTop: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.comment.count({ where: { ...visibleWhere, parentId: null } }),
      this.prisma.comment.count({ where: visibleWhere }),
    ]);
    let finalList: any[] = list;
    if (targetCommentId) {
      const targetComment = await this.prisma.comment.findFirst({
        where: { ...visibleWhere, id: targetCommentId },
        select: { id: true, parentId: true },
      });
      const targetRootId = targetComment?.parentId || targetComment?.id || '';
      if (targetRootId) {
        const targetRoot = await this.prisma.comment.findFirst({
          where: { ...visibleWhere, id: targetRootId, parentId: null },
          include: {
            user: this.miniCommentAuthorSelect(),
            anonymousIdentity: true,
            replies: {
              where: this.visibleCommentWhere(),
              include: {
                user: this.miniCommentAuthorSelect(),
                anonymousIdentity: true,
                mentions: { include: { user: this.miniCommentAuthorSelect() }, orderBy: { createdAt: 'asc' } },
              },
              orderBy: [{ createdAt: 'asc' }],
              take: Math.max(sonPage, 50),
            },
            mentions: { include: { user: this.miniCommentAuthorSelect() }, orderBy: { createdAt: 'asc' } },
          },
        });
        if (targetRoot) {
          const existingIndex = list.findIndex((comment: any) => comment.id === targetRootId);
          finalList = existingIndex >= 0
            ? list.map((comment: any) => comment.id === targetRootId ? targetRoot : comment)
            : [targetRoot, ...list];
        }
      }
    }
    const commentCount = Math.max(Number(post?.commentCount || 0), visibleTotal);
    const settings = await this.getNoteSettings(post?.regionId, commentCount);
    const userIds = [...new Set(finalList.flatMap((comment: any) => [
      comment.userId,
      ...(comment.replies || []).map((reply: any) => reply.userId),
    ]).filter(Boolean))];
    const activeMembers = userIds.length ? await this.prisma.userMembership.findMany({
      where: { userId: { in: userIds }, status: 'active', expiredAt: { gt: new Date() } },
      select: { userId: true },
    }) : [];
    const memberIds = new Set(activeMembers.map((item) => item.userId));
    const commentIds = finalList.flatMap((comment: any) => [
      comment.id,
      ...(comment.replies || []).map((reply: any) => reply.id),
    ]).filter(Boolean);
    const likedCommentIds = currentUserId && commentIds.length
      ? new Set((await this.prisma.like.findMany({
        where: { userId: currentUserId, targetType: 'comment', targetId: { in: commentIds } },
        select: { targetId: true },
      })).map((item) => item.targetId))
      : new Set<string>();
    const commentList = finalList.map((comment: any) => {
      const replies = (comment.replies || []).map((reply: any) => ({
        ...this.formatCommentForMini(reply, comment, memberIds),
        is_liked: likedCommentIds.has(reply.id),
        isLiked: likedCommentIds.has(reply.id),
      }));
      return {
        ...this.formatCommentForMini(comment, null, memberIds),
        is_liked: likedCommentIds.has(comment.id),
        isLiked: likedCommentIds.has(comment.id),
        list: replies,
        replies,
        list_count: replies.length,
      };
    });
    return {
      success: true,
      list: commentList,
      commentList,
      total,
      count: total,
      page,
      pageSize,
      comment_count: commentCount,
      visible_comment_count: visibleTotal,
      AuthorId: post?.userId || '',
      RegionalAdministratorId: post?.region?.managerUserId || '',
      region_manager_id: post?.region?.managerUserId || '',
      noteSettings: settings,
      wechatTemplate: null,
    };
  }

  async likeComment(commentId: string, userId: string) {
    await this.userAccess.assertCanInteract(userId, 'like', '点赞评论');
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { post: { select: { id: true, regionId: true, status: true, deletedAt: true } } },
    });
    if (!comment || comment.deletedAt || comment.status === 'deleted') throw new NotFoundException('评论不存在');
    if (!comment.post || comment.post.deletedAt || comment.post.status === 'DELETED') throw new NotFoundException('帖子不存在');
    await this.userAccess.assertStudentProtectedAction(userId, comment.post.regionId, '点赞评论');
    const created = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.like.findUnique({
        where: { userId_targetType_targetId: { userId, targetType: 'comment', targetId: commentId } },
      });
      if (existing) return false;
      try {
        await tx.like.create({ data: { userId, targetType: 'comment', targetId: commentId } });
      } catch (error: any) {
        if (error?.code === 'P2002') return false;
        throw error;
      }
      await tx.comment.update({ where: { id: commentId }, data: { likeCount: { increment: 1 } } });
      return true;
    });
    const latest = await this.prisma.comment.findUnique({ where: { id: commentId }, select: { likeCount: true } }).catch(() => null);
    return { liked: true, changed: created, like_count: latest?.likeCount ?? 0, likeCount: latest?.likeCount ?? 0 };
  }

  async unlikeComment(commentId: string, userId: string) {
    await this.userAccess.assertCanInteract(userId, 'like', '取消评论点赞');
    const deleted = await this.prisma.$transaction(async (tx) => {
      const result = await tx.like.deleteMany({ where: { userId, targetType: 'comment', targetId: commentId } });
      if (result.count > 0) {
        await tx.comment.updateMany({
          where: { id: commentId, likeCount: { gt: 0 } },
          data: { likeCount: { decrement: 1 } },
        });
      }
      return result.count;
    });
    const latest = await this.prisma.comment.findUnique({ where: { id: commentId }, select: { likeCount: true } }).catch(() => null);
    return { liked: false, changed: deleted > 0, like_count: latest?.likeCount ?? 0, likeCount: latest?.likeCount ?? 0 };
  }

  async getMyComments(userId: string, query: any) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || query.limit) || 20));
    const where = { userId, deletedAt: null };

    const [items, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        include: {
          parent: {
            include: { user: this.miniCommentAuthorSelect() },
          },
          post: {
            select: {
              id: true,
              title: true,
              content: true,
              status: true,
              createdAt: true,
              media: {
                select: { url: true, thumb: true, type: true, sortOrder: true },
                orderBy: { sortOrder: 'asc' },
                take: 3,
              },
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.comment.count({ where }),
    ]);

    const list = items.map((item) => {
      const postImages = item.post?.media?.map((media) => media.thumb || media.url).filter(Boolean) || [];
      return {
        id: item.id,
        comment_id: item.id,
        post_id: item.postId,
        content: item.content,
        like_count: item.likeCount,
        is_reply: !!item.parentId,
        status: item.status,
        audit_status: item.auditStatus,
        audit_reason: item.auditReason,
        created_at: item.createdAt.toISOString(),
        updated_at: item.updatedAt.toISOString(),
        images: postImages,
        post: item.post
          ? {
            id: item.post.id,
            title: item.post.title || item.post.content?.slice(0, 30) || '原笔记',
            content_preview: item.post.content?.slice(0, 80) || '',
            status: item.post.status,
            created_at: item.post.createdAt.toISOString(),
            images: postImages,
          }
          : null,
        reply_to: item.parent
          ? {
            id: item.parent.id,
            content: item.parent.content,
            user: item.parent.user
              ? {
                id: item.parent.user.id,
                name: item.parent.user.nickname || '用户',
                avatar: item.parent.user.avatar || '',
              }
              : null,
          }
          : null,
      };
    });

    return {
      success: true,
      list,
      total,
      page,
      pageSize,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  async createComment(postId: string, userId: string, dto: any) {
    await this.userAccess.assertCanCreateContent(userId, 'comment', '评论');
    const [post, total] = await Promise.all([
      this.prisma.post.findUnique({
        where: { id: postId },
        select: { userId: true, regionId: true, commentCount: true, status: true, deletedAt: true },
      }),
      this.prisma.comment.count({ where: this.visibleCommentWhere({ postId }) }),
    ]);
    if (!post) throw new NotFoundException('帖子不存在');
    if (post.deletedAt || post.status === 'DELETED') throw new NotFoundException('帖子不存在');
    if (post.status !== 'PUBLISHED' && post.userId !== userId) throw new ForbiddenException('帖子未发布，暂不能评论');
    await this.userAccess.assertStudentProtectedAction(userId, post.regionId, '评论');
    await this.userAccess.assertNoBlockBetween(userId, post.userId, '评论');
    const settings = await this.getNoteSettings(post.regionId, Math.max(post.commentCount || 0, total));
    if (!settings.allow_comments) throw new BadRequestException('该笔记已关闭评论功能');
    if (settings.is_comment_full) throw new BadRequestException(`评论数已达上限(${settings.max_comments})`);
    const anonymousData: any = await this.resolveAnonymousCommentPayload(post.regionId, settings, dto);
    const content = String(dto.content || '').trim();
    if (!content) throw new BadRequestException('请输入评论内容');
    if (content.length > settings.comment_length_limit) throw new BadRequestException(`评论不能超过${settings.comment_length_limit}字`);
    const parentId = dto.parent_id || dto.parentId || null;
    let parentComment: any = null;
    if (parentId) {
      parentComment = await this.prisma.comment.findUnique({
          where: { id: parentId },
          select: { id: true, postId: true, userId: true, deletedAt: true, status: true, auditStatus: true },
        });
      if (!parentComment || parentComment.postId !== postId || !this.isCountedComment(parentComment)) {
        throw new BadRequestException('回复的评论不存在或不属于该帖子');
      }
    }
    if (parentComment) {
      await this.interactionPermission.assertAllowed(userId, parentComment.userId, 'replyPermission', '回复评论');
    } else {
      await this.interactionPermission.assertAllowed(userId, post.userId, 'commentPermission', '评论');
    }
    const imageUrls = this.normalizeCommentImages(dto);
    const mentionIds = this.normalizeMentionUserIds(dto.mentions ?? dto.mention_user_ids ?? dto.mentionUserIds, userId);
    const [mentionUsers, commenter] = await Promise.all([
      this.resolveMentionUsers(mentionIds),
      this.prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } }).catch(() => null),
    ]);
    for (const mentionUser of mentionUsers) {
      await this.interactionPermission.assertAllowed(userId, mentionUser.id, 'mentionPermission', '@用户');
    }
    const review = await this.resolveCommentReview(content, post.regionId, imageUrls, userId);
    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          postId,
          userId,
          parentId,
          content,
          images: imageUrls,
          ...anonymousData,
          status: review.status,
          auditStatus: review.auditStatus,
          auditReason: review.auditReason,
          mentions: mentionUsers.length
            ? { createMany: { data: mentionUsers.map((user: any) => ({ userId: user.id })), skipDuplicates: true } }
            : undefined,
        },
      });
      if (this.isCountedComment(created)) {
        await tx.post.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } });
      }
      return created;
    });
    if (this.isCountedComment(comment)) await this.clearPostFeedCache(post.regionId);
    if (review.aiResult) {
      await this.aiRuntime.recordModeration({
        targetType: 'comment',
        targetId: comment.id,
        userId,
        regionId: post.regionId,
        approvalType: review.approvalType,
        result: review.aiResult,
        finalStatus: review.auditStatus,
      });
    }

    // 发送评论/回复通知
    try {
      if (parentId) {
        // 回复通知 -> 通知父评论作者
        if (parentComment && parentComment.userId !== userId) {
            await this.notifyService.createAndDispatchInteraction({
              userId: parentComment.userId,
              regionId: post?.regionId || undefined,
            type: 'REPLY',
            scene: 'comment_reply',
            title: '有人回复了你的评论',
            content: `${anonymousData.isAnonymous ? anonymousData.anonymousName : commenter?.nickname || '用户'}：${dto.content}`,
            data: { postId, commentId: comment.id, fromUserId: anonymousData.isAnonymous ? '' : userId },
            linkType: 'post',
            linkValue: postId,
            channelMask: { inApp: true, websocket: true },
          }, { actorId: userId });
        }
      } else {
        // 评论通知 -> 通知帖子作者
        if (post.userId !== userId && review.status === 'active' && review.auditStatus === 'approved') {
          await this.notifyService.createAndDispatchInteraction({
            userId: post.userId,
            regionId: post.regionId || undefined,
            type: 'COMMENT',
            scene: 'post_comment',
            title: '有人评论了你的帖子',
            content: `${anonymousData.isAnonymous ? anonymousData.anonymousName : commenter?.nickname || '用户'}：${dto.content}`,
            data: { postId, commentId: comment.id, fromUserId: anonymousData.isAnonymous ? '' : userId },
            linkType: 'post',
            linkValue: postId,
            channelMask: { inApp: true, websocket: true },
          }, { actorId: userId });
        }
      }
    } catch {}

    if (review.status === 'active' && review.auditStatus === 'approved' && mentionUsers.length) {
      await this.notifyMentionUsers({
        users: mentionUsers,
        actorId: userId,
        publicActorId: anonymousData.isAnonymous ? '' : userId,
        actorName: anonymousData.isAnonymous ? anonymousData.anonymousName : commenter?.nickname || '用户',
        regionId: post.regionId,
        postId,
        commentId: comment.id,
      });
    }

    return {
      ...comment,
      mentions: this.formatMentions(mentionUsers),
      audit_status: review.auditStatus,
      audit_reason: review.auditReason,
      visible: review.status === 'active' && review.auditStatus === 'approved',
    };
  }

  async reportComment(commentId: string, userId: string, dto: any) {
    await this.userAccess.assertCanInteract(userId, 'report', '举报评论');
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { post: { select: { id: true, userId: true, status: true, deletedAt: true } } },
    });
    if (!comment || comment.deletedAt || comment.status === 'deleted') throw new NotFoundException('评论不存在');
    if (!comment.post || comment.post.deletedAt || comment.post.status === 'DELETED') throw new NotFoundException('帖子不存在');
    await this.userAccess.assertNoBlockBetween(userId, comment.userId, '举报评论');
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // AUD-P1-018: targetId 应为评论 ID（commentId）而非帖子 ID，使评论管理可按评论聚合举报
    const existing = await this.prisma.report.findFirst({
      where: {
        reporterId: userId,
        targetType: 'comment',
        targetId: commentId,
        status: { in: ['pending', 'processing'] },
        createdAt: { gte: oneDayAgo },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return { ...existing, duplicated: true };
    const evidenceImages = dto.images || dto.evidence_images || null;
    return this.prisma.report.create({
      data: {
        reporterId: userId,
        reportedId: comment.userId,
        targetType: 'comment',
        targetId: commentId,
        reason: dto.reason || dto.report_type || '用户举报',
        detail: `[comment:${commentId}] ${dto.detail || dto.description || ''}`.trim(),
        images: { commentId, images: evidenceImages },
      },
    });
  }

  async deleteComment(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { post: { select: { userId: true, regionId: true } } },
    });
    if (!comment) throw new NotFoundException('评论不存在');
    if (comment.userId !== userId && comment.post?.userId !== userId) {
      throw new ForbiddenException('无权删除该评论');
    }
    const countedBefore = this.isCountedComment(comment);
    if (comment.deletedAt || comment.status === 'deleted') {
      return { success: true, changed: false };
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.comment.update({
        where: { id: commentId },
        data: { status: 'deleted', deletedAt: new Date(), isTop: false },
      });
      if (countedBefore) {
        await tx.post.updateMany({
          where: { id: comment.postId, commentCount: { gt: 0 } },
          data: { commentCount: { decrement: 1 } },
        });
      }
    });
    if (countedBefore) await this.clearPostFeedCache(comment.post?.regionId);
    return { success: true, changed: true };
  }

  async pinComment(commentId: string, userId: string, dto: any) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { post: { select: { userId: true, regionId: true } } },
    });
    if (!comment || comment.deletedAt || comment.status === 'deleted') throw new NotFoundException('评论不存在');
    if (!this.isCountedComment(comment)) throw new BadRequestException('只有已通过且可见的评论可以置顶');
    if (comment.post?.userId !== userId) throw new ForbiddenException('只有帖子作者可以置顶评论');
    const pinStatus = dto.pin_status ?? dto.pinStatus ?? dto.isTop ?? dto.pinned;
    const updated = await this.prisma.comment.update({ where: { id: commentId }, data: { isTop: pinStatus === true || pinStatus === 1 || pinStatus === '1' } });
    await this.clearPostFeedCache(comment.post?.regionId);
    return updated;
  }

  private lotteryStatus(status: string, drawAt: Date) {
    if (status === 'cancelled') return 'cancelled';
    if (status === 'drawn' || status === 'finished') return 'finished';
    if (status === 'processing') return 'processing';
    return drawAt.getTime() <= Date.now() ? 'scheduled' : 'scheduled';
  }

  private async dispatchLotteryWinnerNotifications(detail: any) {
    const lottery = detail?.lottery;
    const winners = Array.isArray(detail?.winners) ? detail.winners : [];
    if (!lottery?.postId || winners.length === 0) return;
    const sent = new Set<string>();
    for (const winner of winners) {
      const userId = String(winner.user_id || winner.userId || '').trim();
      if (!userId || sent.has(userId)) continue;
      sent.add(userId);
      await this.notifyService.createAndDispatch({
        userId,
        type: 'SYSTEM',
        scene: 'comment_lottery_winner',
        title: '你中奖了',
        content: `你在「${lottery.title || '评论抽奖'}」中中奖，请查看详情`,
        data: {
          postId: lottery.postId,
          lotteryId: lottery.id,
          prizeId: winner.prize_id || winner.prizeId,
          prizeName: winner.prize_name || winner.prize?.name || '',
        },
        linkType: 'post',
        linkValue: lottery.postId,
        channelMask: { inApp: true, websocket: true },
      }).catch(() => undefined);
    }
  }

  private normalizeLotteryPrizes(prizes: any[]) {
    return (Array.isArray(prizes) ? prizes : [])
      .map((item, index) => {
        const probabilityWeight = Math.max(1, Math.min(10000, Number(item.probability_weight ?? item.probabilityWeight ?? 100) || 100));
        return {
          name: String(item.name || `奖项 ${index + 1}`).trim(),
          rewardText: String(item.reward_text ?? item.rewardText ?? '').trim() || null,
          count: Math.max(1, Number(item.winner_count ?? item.count ?? 1) || 1),
          probabilityWeight,
          sortOrder: Number(item.sort_order ?? item.sortOrder ?? index) || 0,
        };
      })
      .filter((item) => item.name);
  }

  private createLotteryDrawSeed(lotteryId: string) {
    return createHash('sha256')
      .update(`${lotteryId}:${Date.now()}:${randomBytes(16).toString('hex')}`)
      .digest('hex');
  }

  private drawIndex(seed: string, counter: number, length: number) {
    if (length <= 1) return 0;
    const digest = createHash('sha256').update(`${seed}:${counter}`).digest();
    return digest.readUInt32BE(0) % length;
  }

  private async formatLotteryDetail(lottery: any) {
    if (!lottery) return null;
    const prizes = (lottery.prizes || []).map((prize: any) => ({
      ...prize,
      winner_count: prize.count,
      prize_name: prize.name,
      reward_text: prize.rewardText || prize.reward_text || '',
      probability_weight: prize.probabilityWeight ?? prize.probability_weight ?? 100,
      sort_order: prize.sortOrder ?? prize.sort_order ?? 0,
    }));
    const prizeMap = new Map<string, any>(prizes.map((prize: any) => [String(prize.id), prize]));
    const commentIds = Array.from(
      new Set<string>((lottery.winners || []).map((winner: any) => String(winner.commentId || winner.comment_id || '')).filter(Boolean)),
    );
    const userIds = Array.from(
      new Set<string>((lottery.winners || []).map((winner: any) => String(winner.userId || '')).filter(Boolean)),
    );
    const comments = commentIds.length
      ? await this.prisma.comment.findMany({
          where: this.visibleCommentWhere({ postId: lottery.postId, id: { in: commentIds } }),
          include: { user: this.miniCommentAuthorSelect() },
          orderBy: { createdAt: 'desc' },
        })
      : userIds.length
        ? await this.prisma.comment.findMany({
            where: this.visibleCommentWhere({ postId: lottery.postId, userId: { in: userIds } }),
            include: { user: this.miniCommentAuthorSelect() },
            orderBy: { createdAt: 'desc' },
          })
      : [];
    const commentMap = new Map<string, any>();
    const userCommentMap = new Map<string, any>();
    for (const comment of comments) {
      if (!commentMap.has(comment.id)) commentMap.set(comment.id, comment);
      if (!userCommentMap.has(comment.userId)) userCommentMap.set(comment.userId, comment);
    }
    const winners = (lottery.winners || []).map((winner: any) => {
      const comment = commentMap.get(winner.commentId || winner.comment_id) || userCommentMap.get(winner.userId);
      const prize = prizeMap.get(String(winner.prizeId));
      return {
        id: winner.id,
        user_id: winner.userId,
        userId: winner.userId,
        comment_id: winner.commentId || winner.comment_id || '',
        commentId: winner.commentId || winner.comment_id || '',
        prize_id: winner.prizeId,
        prizeId: winner.prizeId,
        prize_name: prize?.name || '',
        prize,
        user: comment?.user || null,
        user_nickname: comment?.user?.nickname || '用户',
        user_avatar: comment?.user?.avatar || '',
        comment,
        comment_content: comment?.content || '',
        content: comment?.content || '',
        created_at: winner.createdAt,
        createdAt: winner.createdAt,
      };
    });
    const payloadLottery = {
      ...lottery,
      post_id: lottery.postId,
      draw_at: lottery.drawAt,
      drawn_at: lottery.drawnAt || lottery.drawn_at || null,
      allow_duplicate: lottery.allowDuplicate ? 1 : 0,
      participant_count: lottery.participantCount ?? lottery.participant_count ?? 0,
      candidate_comment_count: lottery.candidateCommentCount ?? lottery.candidate_comment_count ?? 0,
      winner_count: lottery.winnerCount ?? lottery.winner_count ?? (lottery.winners || []).length,
      draw_seed: lottery.drawSeed || lottery.draw_seed || '',
      raw_status: lottery.status,
      status: this.lotteryStatus(lottery.status, lottery.drawAt),
    };
    return {
      lottery: payloadLottery,
      post: lottery.post || null,
      prizes,
      winners,
    };
  }

  async createLottery(userId: string, dto: any) {
    const canUseAdvancedTools = await this.membershipService.hasBenefit(userId, 'advanced_content_tools').catch(() => false);
    if (!canUseAdvancedTools) throw new BadRequestException('抽奖属于会员高级配置，请先开通会员');
    const postId = String(dto.post_id || dto.postId || '').trim();
    const title = String(dto.title || '').trim();
    const drawAt = new Date(dto.draw_at || dto.drawAt);
    const prizes = this.normalizeLotteryPrizes(dto.prizes);
    if (!postId) throw new BadRequestException('缺少帖子ID');
    if (!title) throw new BadRequestException('请输入抽奖标题');
    if (Number.isNaN(drawAt.getTime())) throw new BadRequestException('开奖时间不正确');
    if (drawAt.getTime() <= Date.now()) throw new BadRequestException('开奖时间必须晚于当前时间');
    if (!prizes.length) throw new BadRequestException('请至少配置一个奖项');

    await this.assertPostLotteryManager(postId, userId);
    const existing = await this.prisma.commentLottery.findUnique({ where: { postId }, select: { id: true } });
    if (existing) throw new BadRequestException('该帖子已创建评论抽奖');

    const lottery = await this.prisma.commentLottery.create({
      data: {
        postId,
        title,
        drawAt,
        allowDuplicate: !!dto.allow_duplicate || !!dto.allowDuplicate,
        prizes: { create: prizes },
      },
      include: { prizes: true, winners: true },
    });
    return this.formatLotteryDetail(lottery);
  }

  async getLotteryDetail(postId: string) {
    const lottery = await this.prisma.commentLottery.findUnique({
      where: { postId: String(postId) },
      include: { prizes: true, winners: true },
    });
    return this.formatLotteryDetail(lottery);
  }

  async cancelLottery(lotteryId: string, userId: string, dto: any) {
    const existing = await this.prisma.commentLottery.findUnique({
      where: { id: lotteryId },
      select: { postId: true },
    });
    if (!existing) throw new NotFoundException('抽奖不存在');
    await this.assertPostLotteryManager(existing.postId, userId);
    const lottery = await this.prisma.commentLottery.update({
      where: { id: lotteryId },
      data: { status: 'cancelled', cancelledReason: dto.reason || '' },
      include: { prizes: true, winners: true },
    });
    return this.formatLotteryDetail(lottery);
  }

  async drawLottery(lotteryId: string, userId: string) {
    return this.drawLotteryById(lotteryId, userId);
  }

  private async drawLotteryById(lotteryId: string, userId?: string) {
    const lottery = await this.prisma.commentLottery.findUnique({
      where: { id: lotteryId },
      include: { prizes: true, winners: true },
    });
    if (!lottery) throw new NotFoundException('抽奖不存在');
    if (userId) await this.assertPostLotteryManager(lottery.postId, userId);
    if (lottery.status === 'cancelled') throw new BadRequestException('抽奖已取消');
    if (lottery.winners.length) return this.formatLotteryDetail(lottery);

    const comments = await this.prisma.comment.findMany({
      where: {
        postId: lottery.postId,
        ...this.visibleCommentWhere(),
      },
      include: { user: this.miniCommentAuthorSelect() },
      orderBy: { createdAt: 'asc' },
    });
    const pool = lottery.allowDuplicate
      ? [...comments]
      : Array.from(new Map(comments.map((comment) => [comment.userId, comment])).values());

    const participantCount = new Set(comments.map((comment: any) => String(comment.userId || '')).filter(Boolean)).size;
    const drawSeed = this.createLotteryDrawSeed(lottery.id);
    let drawCounter = 0;
    const winners: Array<{ lotteryId: string; userId: string; prizeId: string; commentId: string }> = [];
    const prizes = [...lottery.prizes].sort((a: any, b: any) => {
      const sortA = Number(a.sortOrder ?? a.sort_order ?? 0) || 0;
      const sortB = Number(b.sortOrder ?? b.sort_order ?? 0) || 0;
      return sortA - sortB;
    });
    for (const prize of prizes) {
      for (let i = 0; i < prize.count && pool.length; i += 1) {
        const index = this.drawIndex(drawSeed, drawCounter, pool.length);
        drawCounter += 1;
        const selected = pool[index];
        winners.push({ lotteryId: lottery.id, userId: selected.userId, prizeId: prize.id, commentId: selected.id });
        if (!lottery.allowDuplicate) pool.splice(index, 1);
      }
    }

    const drawnAt = new Date();
    await this.prisma.$transaction([
      ...(winners.length ? [this.prisma.commentLotteryWinner.createMany({ data: winners })] : []),
      this.prisma.commentLottery.update({
        where: { id: lottery.id },
        data: {
          status: 'drawn',
          participantCount,
          candidateCommentCount: comments.length,
          winnerCount: winners.length,
          drawSeed,
          drawnAt,
        },
      }),
    ]);
    const updated = await this.prisma.commentLottery.findUnique({
      where: { id: lottery.id },
      include: { prizes: true, winners: true },
    });
    const detail = await this.formatLotteryDetail(updated);
    await this.dispatchLotteryWinnerNotifications(detail);
    return detail;
  }

  @Interval(60 * 1000)
  async autoDrawDueLotteries() {
    const due = await this.prisma.commentLottery.findMany({
      where: {
        status: { in: ['active', 'scheduled', 'processing'] },
        drawAt: { lte: new Date() },
        winners: { none: {} },
      },
      select: { id: true },
      take: 20,
      orderBy: { drawAt: 'asc' },
    }).catch(() => []);
    for (const lottery of due) {
      await this.drawLotteryById(lottery.id).catch(() => undefined);
    }
  }

  async getAdminLotteryList(query: any) {
    const page = Math.max(1, Number(query.page || 1) || 1);
    const pageSize = Math.min(Math.max(1, Number(query.pageSize || query.limit || 20) || 20), 100);
    const keyword = String(query.keyword || '').trim();
    const status = String(query.status || '').trim();
    const where: any = {};
    if (status) where.status = status;
    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
        { postId: { contains: keyword } },
      ];
    }
    const [list, total] = await Promise.all([
      this.prisma.commentLottery.findMany({
        where,
        include: { prizes: true, winners: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.commentLottery.count({ where }),
    ]);
    const postIds = [...new Set(list.map((item) => item.postId).filter(Boolean))];
    const posts = postIds.length
      ? await this.prisma.post.findMany({
          where: { id: { in: postIds } },
          select: {
            id: true,
            title: true,
            content: true,
            userId: true,
            regionId: true,
            user: { select: { id: true, nickname: true, avatar: true } },
            region: { select: { id: true, name: true } },
          },
        })
      : [];
    const postMap = new Map(posts.map((post) => [post.id, post]));
    const data = await Promise.all(list.map((item) => this.formatLotteryDetail({ ...item, post: postMap.get(item.postId) || null })));
    return { list: data, data, total, page, pageSize };
  }

  async adminCancelLottery(lotteryId: string, dto: any = {}) {
    const existing = await this.prisma.commentLottery.findUnique({
      where: { id: lotteryId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('抽奖不存在');
    if (existing.status === 'drawn' || existing.status === 'finished') throw new BadRequestException('已开奖的抽奖不能取消');
    const lottery = await this.prisma.commentLottery.update({
      where: { id: lotteryId },
      data: { status: 'cancelled', cancelledReason: dto.reason || '后台取消' },
      include: { prizes: true, winners: true },
    });
    return this.formatLotteryDetail(lottery);
  }

  async adminDrawLottery(lotteryId: string) {
    return this.drawLotteryById(lotteryId);
  }
}
