import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { NotifyService } from '../notify/notify.service';
import { AiRuntimeService } from '../ai-runtime/ai-runtime.service';

@Injectable()
export class CommentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifyService: NotifyService,
    private readonly aiRuntime: AiRuntimeService,
  ) {}

  private async getCommentApprovalType(regionId?: string | null) {
    if (!regionId) return 'manual';
    const config = await this.prisma.config.findUnique({
      where: { key: `content.note_settings.${regionId}` },
      select: { value: true },
    });
    return String((config?.value as any)?.comment_approval_type || 'manual').toLowerCase();
  }

  private async resolveCommentReview(content: string, regionId?: string | null) {
    const approvalType = await this.getCommentApprovalType(regionId);
    if (['none', 'auto', 'pass', 'published', 'approved'].includes(approvalType)) {
      return { status: 'active', auditStatus: 'approved', auditReason: '无需审核' };
    }
    if (['ai', 'llm', 'model'].includes(approvalType)) {
      const result = await this.aiRuntime.moderateContent({
        type: 'comment',
        content,
        regionId,
        approvalType,
      });
      if (result.decision === 'approve') return { status: 'active', auditStatus: 'approved', auditReason: result.reason || 'AI审核通过' };
      if (result.decision === 'reject') return { status: 'hidden', auditStatus: 'rejected', auditReason: result.reason || 'AI审核不通过' };
      return { status: 'hidden', auditStatus: 'pending', auditReason: result.reason || 'AI建议人工复核' };
    }
    return { status: 'hidden', auditStatus: 'pending', auditReason: '等待人工审核' };
  }

  async getCommentsV2(postId: string, query: any) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || query.limit) || 20));
    const sonPage = Math.min(50, Math.max(0, Number(query.sonPage) || 10));
    const [list, total] = await Promise.all([
      this.prisma.comment.findMany({
          where: { postId, deletedAt: null, parentId: null, status: 'active' },
        include: {
          user: { select: { id: true, nickname: true, avatar: true } },
          replies: {
            include: { user: { select: { id: true, nickname: true, avatar: true } } },
            orderBy: [{ createdAt: 'asc' }],
            take: sonPage,
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ isTop: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.comment.count({ where: { postId, deletedAt: null, status: 'active' } }),
    ]);
    return { list, total, page, pageSize };
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
            include: { user: { select: { id: true, nickname: true, avatar: true } } },
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
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { userId: true, regionId: true },
    });
    if (!post) throw new NotFoundException('帖子不存在');
    const review = await this.resolveCommentReview(dto.content, post.regionId);
    const comment = await this.prisma.comment.create({
      data: {
        postId,
        userId,
        parentId: dto.parent_id || null,
        content: dto.content,
        status: review.status,
        auditStatus: review.auditStatus,
        auditReason: review.auditReason,
      },
    });
    if (review.status === 'active' && review.auditStatus === 'approved') {
      await this.prisma.post.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } });
    }

    // 发送评论/回复通知
    try {
      const commenter = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { nickname: true },
      });

      if (dto.parent_id) {
        // 回复通知 -> 通知父评论作者
        const parentComment = await this.prisma.comment.findUnique({
          where: { id: dto.parent_id },
          select: { userId: true },
        });
        if (parentComment && parentComment.userId !== userId) {
            await this.notifyService.createAndDispatch({
              userId: parentComment.userId,
              regionId: post?.regionId || undefined,
            type: 'REPLY',
            scene: 'comment_reply',
            title: '有人回复了你的评论',
            content: `${commenter?.nickname || '用户'}：${dto.content}`,
            data: { postId, commentId: comment.id, fromUserId: userId },
            linkType: 'post',
            linkValue: postId,
            channelMask: { inApp: true, websocket: true },
          });
        }
      } else {
        // 评论通知 -> 通知帖子作者
        if (post.userId !== userId && review.status === 'active' && review.auditStatus === 'approved') {
          await this.notifyService.createAndDispatch({
            userId: post.userId,
            regionId: post.regionId || undefined,
            type: 'COMMENT',
            scene: 'post_comment',
            title: '有人评论了你的帖子',
            content: `${commenter?.nickname || '用户'}：${dto.content}`,
            data: { postId, commentId: comment.id, fromUserId: userId },
            linkType: 'post',
            linkValue: postId,
            channelMask: { inApp: true, websocket: true },
          });
        }
      }
    } catch {}

    return {
      ...comment,
      audit_status: review.auditStatus,
      audit_reason: review.auditReason,
      visible: review.status === 'active' && review.auditStatus === 'approved',
    };
  }

  async deleteComment(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('评论不存在');
    await this.prisma.comment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
    await this.prisma.post.update({ where: { id: comment.postId }, data: { commentCount: { decrement: 1 } } });
    return { success: true };
  }

  async pinComment(commentId: string, dto: any) {
    return this.prisma.comment.update({ where: { id: commentId }, data: { isTop: dto.pin_status === 1 } });
  }

  private lotteryStatus(status: string, drawAt: Date) {
    if (status === 'cancelled') return 'cancelled';
    if (status === 'drawn' || status === 'finished') return 'finished';
    if (status === 'processing') return 'processing';
    return drawAt.getTime() <= Date.now() ? 'scheduled' : 'scheduled';
  }

  private normalizeLotteryPrizes(prizes: any[]) {
    return (Array.isArray(prizes) ? prizes : [])
      .map((item, index) => ({
        name: String(item.name || `奖项 ${index + 1}`).trim(),
        count: Math.max(1, Number(item.winner_count ?? item.count ?? 1) || 1),
      }))
      .filter((item) => item.name);
  }

  private async formatLotteryDetail(lottery: any) {
    if (!lottery) return null;
    const prizes = (lottery.prizes || []).map((prize: any) => ({
      ...prize,
      winner_count: prize.count,
      prize_name: prize.name,
    }));
    const prizeMap = new Map<string, any>(prizes.map((prize: any) => [String(prize.id), prize]));
    const userIds = Array.from(
      new Set<string>((lottery.winners || []).map((winner: any) => String(winner.userId || '')).filter(Boolean)),
    );
    const comments = userIds.length
      ? await this.prisma.comment.findMany({
          where: { postId: lottery.postId, userId: { in: userIds }, deletedAt: null },
          include: { user: { select: { id: true, nickname: true, avatar: true } } },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const commentMap = new Map<string, any>();
    for (const comment of comments) {
      if (!commentMap.has(comment.userId)) commentMap.set(comment.userId, comment);
    }
    const winners = (lottery.winners || []).map((winner: any) => {
      const comment = commentMap.get(winner.userId);
      const prize = prizeMap.get(String(winner.prizeId));
      return {
        id: winner.id,
        user_id: winner.userId,
        userId: winner.userId,
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
      allow_duplicate: lottery.allowDuplicate ? 1 : 0,
      raw_status: lottery.status,
      status: this.lotteryStatus(lottery.status, lottery.drawAt),
    };
    return { lottery: payloadLottery, prizes, winners };
  }

  async createLottery(userId: string, dto: any) {
    const postId = String(dto.post_id || dto.postId || '').trim();
    const title = String(dto.title || '').trim();
    const drawAt = new Date(dto.draw_at || dto.drawAt);
    const prizes = this.normalizeLotteryPrizes(dto.prizes);
    if (!postId) throw new BadRequestException('缺少帖子ID');
    if (!title) throw new BadRequestException('请输入抽奖标题');
    if (Number.isNaN(drawAt.getTime())) throw new BadRequestException('开奖时间不正确');
    if (!prizes.length) throw new BadRequestException('请至少配置一个奖项');

    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) throw new NotFoundException('帖子不存在');
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

  async cancelLottery(lotteryId: string, dto: any) {
    const lottery = await this.prisma.commentLottery.update({
      where: { id: lotteryId },
      data: { status: 'cancelled', cancelledReason: dto.reason || '' },
      include: { prizes: true, winners: true },
    });
    return this.formatLotteryDetail(lottery);
  }

  async drawLottery(lotteryId: string) {
    const lottery = await this.prisma.commentLottery.findUnique({
      where: { id: lotteryId },
      include: { prizes: true, winners: true },
    });
    if (!lottery) throw new NotFoundException('抽奖不存在');
    if (lottery.status === 'cancelled') throw new BadRequestException('抽奖已取消');
    if (lottery.winners.length) return this.formatLotteryDetail(lottery);

    const comments = await this.prisma.comment.findMany({
      where: {
        postId: lottery.postId,
        deletedAt: null,
        status: 'active',
        auditStatus: { not: 'rejected' },
      },
      include: { user: { select: { id: true, nickname: true, avatar: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const pool = lottery.allowDuplicate
      ? [...comments]
      : Array.from(new Map(comments.map((comment) => [comment.userId, comment])).values());

    const winners: Array<{ lotteryId: string; userId: string; prizeId: string }> = [];
    for (const prize of lottery.prizes) {
      for (let i = 0; i < prize.count && pool.length; i += 1) {
        const index = Math.floor(Math.random() * pool.length);
        const selected = pool[index];
        winners.push({ lotteryId: lottery.id, userId: selected.userId, prizeId: prize.id });
        if (!lottery.allowDuplicate) pool.splice(index, 1);
      }
    }

    await this.prisma.$transaction([
      ...(winners.length ? [this.prisma.commentLotteryWinner.createMany({ data: winners })] : []),
      this.prisma.commentLottery.update({ where: { id: lottery.id }, data: { status: 'drawn' } }),
    ]);
    const updated = await this.prisma.commentLottery.findUnique({
      where: { id: lottery.id },
      include: { prizes: true, winners: true },
    });
    return this.formatLotteryDetail(updated);
  }
}
