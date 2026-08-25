import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { NotifyService } from '../notify/notify.service';
import { AiRuntimeService, type AiModerationResult } from '../ai-runtime/ai-runtime.service';
import { QrcodeModerationService } from '../ai-runtime/qrcode-moderation.service';
import { UserAccessPolicyService } from '../../common/services/user-access-policy.service';
import { InteractionPermissionService } from '../../common/services/interaction-permission.service';

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
      if (level === 'audit' && aiFailureToManual) {
        // 仅"失败转人工"开启时才强制转人工;关闭时放行到下方 AI 审核,由策略自动裁决(score 0.75 → 自动拒绝)
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
        imageUrls,
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

}
