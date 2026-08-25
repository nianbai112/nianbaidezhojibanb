import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { AiRuntimeService } from '../ai-runtime/ai-runtime.service';
import { NotifyService } from '../notify/notify.service';

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly aiRuntime: AiRuntimeService,
    private readonly notifyService: NotifyService,
  ) {}

  private isPublishedPost(post: any) {
    return !!post && !post.deletedAt && post.status === 'PUBLISHED' && post.auditStatus === 'approved';
  }

  private isCountedComment(comment: any) {
    return !!comment && !comment.deletedAt && comment.status === 'active' && comment.auditStatus === 'approved';
  }

  private async clearPostFeedCache(regionId?: string | null) {
    if (!regionId) return;
    await this.redis.delPattern(`post:feed:${regionId}:*`).catch(() => undefined);
  }

  private async syncTopicPostCounts(oldTopicIds: string[] = [], newTopicIds: string[] = []) {
    const decIds = oldTopicIds.filter((id) => id && !newTopicIds.includes(id));
    const incIds = newTopicIds.filter((id) => id && !oldTopicIds.includes(id));
    await Promise.all([
      ...decIds.map((id) => this.prisma.topic.updateMany({ where: { id, postCount: { gt: 0 } }, data: { postCount: { decrement: 1 } } })),
      ...incIds.map((id) => this.prisma.topic.update({ where: { id }, data: { postCount: { increment: 1 } } }).catch(() => undefined)),
    ]);
  }

  private async recountCirclePostCount(circleId?: string | null) {
    if (!circleId) return;
    const postCount = await this.prisma.post.count({
      where: { circleId, status: 'PUBLISHED', auditStatus: 'approved', deletedAt: null },
    });
    await this.prisma.circle.update({ where: { id: circleId }, data: { postCount } }).catch(() => undefined);
  }

  private async auditPostClosedLoop(id: string, approved: boolean, remark?: string) {
    const before = await this.prisma.post.findUnique({ where: { id }, include: { topics: true } });
    if (!before) return;
    const updated = await this.prisma.post.update({
      where: { id },
      data: { auditStatus: approved ? 'approved' : 'rejected', status: approved ? 'PUBLISHED' : 'REJECTED', auditReason: remark },
      include: { topics: true },
    });
    const beforePublished = this.isPublishedPost(before);
    const afterPublished = this.isPublishedPost(updated);
    if (beforePublished !== afterPublished) {
      await this.syncTopicPostCounts(
        beforePublished ? before.topics.map((item: any) => item.topicId) : [],
        afterPublished ? updated.topics.map((item: any) => item.topicId) : [],
      );
      await this.recountCirclePostCount(updated.circleId || before.circleId);
    }
    await this.clearPostFeedCache(updated.regionId || before.regionId);
  }

  private async auditCommentClosedLoop(id: string, approved: boolean, remark?: string) {
    const before = await this.prisma.comment.findUnique({ where: { id }, include: { post: { select: { regionId: true } } } });
    if (!before) return;
    const after = await this.prisma.comment.update({
      where: { id },
      data: {
        auditStatus: approved ? 'approved' : 'rejected',
        status: approved ? 'active' : 'hidden',
        auditReason: remark,
        ...(approved ? { deletedAt: null } : {}),
      },
      include: { post: { select: { regionId: true } } },
    });
    const beforeCounted = this.isCountedComment(before);
    const afterCounted = this.isCountedComment(after);
    if (beforeCounted !== afterCounted) {
      if (afterCounted) {
        await this.prisma.post.update({ where: { id: after.postId }, data: { commentCount: { increment: 1 } } });
      } else {
        await this.prisma.post.updateMany({ where: { id: after.postId, commentCount: { gt: 0 } }, data: { commentCount: { decrement: 1 } } });
      }
    }
    await this.clearPostFeedCache(after.post?.regionId || before.post?.regionId);
  }

  private formatAiRecord(record?: any | null) {
    if (!record) return null;
    return {
      id: record.id,
      decision: record.decision,
      reason: record.reason,
      labels: record.labels || [],
      score: record.score || 0,
      approvalType: record.approvalType,
      fallbackType: record.fallbackType,
      finalStatus: record.finalStatus,
      callLogId: record.callLogId,
      handledBy: record.handledBy,
      handledAt: record.handledAt,
      createdAt: record.createdAt,
    };
  }

  private normalizeAiReviewImages(value: any): string[] {
    const urls: string[] = [];
    const visit = (item: any) => {
      if (!item) return;
      if (typeof item === 'string') {
        urls.push(item);
        return;
      }
      if (Array.isArray(item)) {
        item.forEach(visit);
        return;
      }
      if (typeof item === 'object') {
        const direct = item.url || item.src || item.image || item.image_url || item.imageUrl;
        if (direct) urls.push(String(direct));
        if (item.list) visit(item.list);
        if (item.urls) visit(item.urls);
        if (item.images) visit(item.images);
      }
    };
    visit(value);
    return [...new Set(urls.map((url) => String(url || '').trim()).filter(Boolean))];
  }

  private async attachAiModeration(items: any[]) {
    const targets = items
      .filter((item) => ['post', 'comment'].includes(item.targetType) && item.id)
      .map((item) => ({ targetType: item.targetType, targetId: String(item.id) }));
    if (!targets.length) return items;

    const records = await this.prisma.aiModerationRecord.findMany({
      where: { OR: targets.map((target) => ({ targetType: target.targetType, targetId: target.targetId })) },
      orderBy: { createdAt: 'desc' },
    });
    const latest = new Map<string, any>();
    for (const record of records) {
      const key = `${record.targetType}:${record.targetId}`;
      if (!latest.has(key)) latest.set(key, record);
    }

    return items.map((item) => {
      const aiModeration = this.formatAiRecord(latest.get(`${item.targetType}:${item.id}`));
      return {
        ...item,
        aiModeration,
        ai_moderation: aiModeration,
      };
    });
  }

  async getPendingStats() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [postPending, commentPending, reportPending] = await Promise.all([
      this.prisma.post.count({ where: { auditStatus: 'pending', status: { not: 'DELETED' }, deletedAt: null } }),
      this.prisma.comment.count({ where: { auditStatus: 'pending', status: { not: 'deleted' } } }),
      this.prisma.report.count({ where: { status: 'pending' } }),
    ]);

    const todayApproved = await this.prisma.auditRecord.count({
      where: { status: 'approved', reviewedAt: { gte: todayStart } },
    });
    const todayRejected = await this.prisma.auditRecord.count({
      where: { status: 'rejected', reviewedAt: { gte: todayStart } },
    });

    return {
      todayPending: postPending + commentPending + reportPending,
      postPending,
      commentPending,
      reportPending,
      totalPending: postPending + commentPending + reportPending,
      todayApproved,
      todayRejected,
      overdueCount: 0,
    };
  }

  async getPendingCounts() {
    const [posts, comments, reports] = await Promise.all([
      this.prisma.post.count({ where: { auditStatus: 'pending', status: { not: 'DELETED' }, deletedAt: null } }),
      this.prisma.comment.count({ where: { auditStatus: 'pending', status: { not: 'deleted' } } }),
      this.prisma.report.count({ where: { status: 'pending' } }),
    ]);
    return { posts, comments, reports };
  }

  async getPendingList(query: any) {
    const { page = 1, pageSize = 20, targetType } = query;
    if (targetType && !['post', 'comment', 'report'].includes(targetType)) {
      throw new BadRequestException('该审核类型请使用专用审核流程');
    }
    const skip = (+page - 1) * +pageSize;
    const take = +pageSize;
    const sourceSkip = targetType ? skip : 0;
    const sourceTake = targetType ? take : skip + take;

    const items: any[] = [];
    let total = 0;

    if (!targetType || targetType === 'post') {
      const posts = await this.prisma.post.findMany({
        where: { auditStatus: 'pending', status: { not: 'DELETED' }, deletedAt: null },
        skip: sourceSkip,
        take: sourceTake,
        include: { user: { select: { id: true, nickname: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
      });
      items.push(...posts.map((p: any) => ({ ...p, targetType: 'post', targetTitle: p.title || p.content?.slice(0, 50) })));
      total += await this.prisma.post.count({ where: { auditStatus: 'pending', status: { not: 'DELETED' }, deletedAt: null } });
    }

    if (!targetType || targetType === 'comment') {
      const comments = await this.prisma.comment.findMany({
        where: { auditStatus: 'pending', status: { not: 'deleted' } },
        skip: sourceSkip,
        take: sourceTake,
        include: { user: { select: { id: true, nickname: true, avatar: true } }, post: { select: { id: true, title: true } } },
        orderBy: { createdAt: 'desc' },
      });
      items.push(...comments.map((c: any) => ({ ...c, targetType: 'comment', targetTitle: c.content?.slice(0, 50) })));
      total += await this.prisma.comment.count({ where: { auditStatus: 'pending', status: { not: 'deleted' } } });
    }

    if (!targetType || targetType === 'report') {
      const reports = await this.prisma.report.findMany({
        where: { status: 'pending' },
        skip: sourceSkip,
        take: sourceTake,
        include: { reporter: { select: { id: true, nickname: true } } },
        orderBy: { createdAt: 'desc' },
      });
      items.push(...reports.map((r: any) => ({ ...r, targetType: 'report', targetTitle: r.reason })));
      total += await this.prisma.report.count({ where: { status: 'pending' } });
    }

    const list = targetType
      ? items
      : items
          .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
          .slice(skip, skip + take);

    return { list: await this.attachAiModeration(list), total, page: +page, pageSize: +pageSize };
  }

  async createAuditRecord(targetType: string, targetId: string, targetTitle?: string, submitterId?: string) {
    return this.prisma.auditRecord.create({
      data: { targetType, targetId, targetTitle, submitterId },
    });
  }

  async updateAuditRecord(targetType: string, targetId: string, reviewerId: string, status: string, reason?: string) {
    const record = await this.prisma.auditRecord.findFirst({
      where: { targetType, targetId },
      orderBy: { createdAt: 'desc' },
    });
    if (record) {
      await this.prisma.auditRecord.update({
        where: { id: record.id },
        data: { reviewerId, status, reason, reviewedAt: new Date() },
      });
    }
  }

  async batchAudit(dto: any, reviewerId: string) {
    const { type, ids = [], action, remark } = dto;
    if (!type || !Array.isArray(ids) || ids.length === 0) {
      return { code: 400, message: '缺少 type 或 ids' };
    }
    const approved = action === 'approve' || action === 'approved';
    const status = approved ? 'approved' : 'rejected';

    if (type === 'post') {
      for (const id of ids.map(String)) await this.auditPostClosedLoop(id, approved, remark);
    } else if (type === 'comment') {
      for (const id of ids.map(String)) await this.auditCommentClosedLoop(id, approved, remark);
    } else if (['merchant', 'withdraw', 'city_agent'].includes(type)) {
      throw new BadRequestException(
        '该审核类型请通过对应业务的专用审核流程处理，不支持统一批量操作',
      );
    } else if (type === 'report') {
      await this.prisma.report.updateMany({
        where: { id: { in: ids.map(String) } },
        data: { status: approved ? 'resolved' : 'rejected', result: remark, handlerId: reviewerId, handledAt: new Date() },
      });

      // AUD-P1-155: 举报处理结果回流给举报人 — 写入 Notification
      const reports = await this.prisma.report.findMany({
        where: { id: { in: ids.map(String) } },
        select: {
          id: true,
          reporterId: true,
          targetType: true,
          targetId: true,
          reporter: { select: { profile: { select: { regionId: true } } } },
        },
      });
      for (const r of reports) {
        await this.notifyService.createAndDispatch({
          userId: r.reporterId,
          regionId: r.reporter?.profile?.regionId || undefined,
          type: 'SYSTEM',
          scene: 'report_result',
          title: '举报处理结果',
          content: approved
            ? `您举报的${r.targetType === 'post' ? '帖子' : r.targetType === 'comment' ? '评论' : '内容'}已处理，感谢您的反馈。`
            : `您举报的内容经审核未发现违规，感谢您的监督。`,
          data: { reportId: r.id, targetType: r.targetType, targetId: r.targetId, approved, result: remark },
          linkType: r.targetType === 'post' ? 'post' : undefined,
          linkValue: r.targetType === 'post' ? r.targetId : undefined,
          channelMask: { inApp: true, websocket: true },
        }).catch(() => undefined); // 静默失败，不阻塞主流程
      }
    } else {
      return { code: 400, message: `不支持的审核类型: ${type}` };
    }

    await this.prisma.auditRecord.createMany({
      data: ids.map((id: string | number) => ({
        targetType: type,
        targetId: String(id),
        reviewerId,
        status,
        reason: remark,
        reviewedAt: new Date(),
      })),
    });
    return { success: true, count: ids.length };
  }

  async aiReview(dto: any, reviewerId?: string) {
    const type = String(dto?.type || dto?.targetType || '').trim();
    const id = String(dto?.id || dto?.targetId || '').trim();
    if (!['post', 'comment'].includes(type) || !id) {
      throw new BadRequestException('AI复审只支持帖子和评论');
    }

    const target = type === 'post'
      ? await this.prisma.post.findUnique({
          where: { id },
          select: {
            id: true,
            userId: true,
            regionId: true,
            title: true,
            content: true,
            auditStatus: true,
            status: true,
            media: { where: { type: 'IMAGE' }, select: { url: true } },
          },
        })
      : await this.prisma.comment.findUnique({
          where: { id },
          select: { id: true, userId: true, postId: true, content: true, images: true, auditStatus: true, status: true, post: { select: { regionId: true, title: true } } },
        });
    if (!target) throw new NotFoundException(type === 'post' ? '帖子不存在' : '评论不存在');

    const imageUrls = type === 'post'
      ? this.normalizeAiReviewImages((target as any).media)
      : this.normalizeAiReviewImages((target as any).images);

    const result = await this.aiRuntime.moderateContent({
      type: type as 'post' | 'comment',
      title: type === 'post' ? (target as any).title : (target as any).post?.title,
      content: (target as any).content || '',
      imageUrls,
      regionId: type === 'post' ? (target as any).regionId : (target as any).post?.regionId,
      approvalType: 'ai',
    });

    const auditStatus = result.decision === 'approve' ? 'approved' : result.decision === 'reject' ? 'rejected' : 'pending';
    const auditReason = result.reason || (auditStatus === 'approved' ? 'AI审核通过' : auditStatus === 'rejected' ? 'AI审核不通过' : 'AI建议人工复核');

    if (auditStatus !== 'pending') {
      if (type === 'post') {
        await this.auditPostClosedLoop(id, auditStatus === 'approved', auditReason);
      } else {
        await this.auditCommentClosedLoop(id, auditStatus === 'approved', auditReason);
      }
    }

    const aiRecord = await this.aiRuntime.recordModeration({
      targetType: type as 'post' | 'comment',
      targetId: id,
      userId: (target as any).userId,
      regionId: type === 'post' ? (target as any).regionId : (target as any).post?.regionId,
      approvalType: 'ai',
      result,
      finalStatus: auditStatus,
    });
    if (aiRecord?.id && reviewerId) {
      await this.prisma.aiModerationRecord.update({
        where: { id: aiRecord.id },
        data: { handledBy: reviewerId, handledAt: new Date() },
      }).catch(() => undefined);
    }

    await this.prisma.auditRecord.create({
      data: {
        targetType: type,
        targetId: id,
        targetTitle: type === 'post' ? ((target as any).title || (target as any).content?.slice(0, 50)) : (target as any).content?.slice(0, 50),
        submitterId: (target as any).userId,
        reviewerId: reviewerId || null,
        status: auditStatus,
        reason: `AI复审：${auditReason}`,
        reviewedAt: new Date(),
      },
    });

    return {
      success: true,
      type,
      id,
      auditStatus,
      auditReason,
      reviewedImageCount: imageUrls.length,
      aiModeration: this.formatAiRecord(aiRecord),
    };
  }
}
