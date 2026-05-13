import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { NotifyService } from '../notify/notify.service';

@Injectable()
export class CommentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifyService: NotifyService,
  ) {}

  async getCommentsV2(postId: string, query: any) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || query.limit) || 20));
    const sonPage = Math.min(50, Math.max(0, Number(query.sonPage) || 10));
    const [list, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: { postId, deletedAt: null, parentId: null },
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
      this.prisma.comment.count({ where: { postId, deletedAt: null } }),
    ]);
    return { list, total, page, pageSize };
  }

  async getMyComments(userId: string, query: any) {
    const { page = 1, pageSize = 20 } = query;
    return this.prisma.comment.findMany({
      where: { userId, deletedAt: null },
      include: { post: { select: { id: true, title: true } } },
      skip: (page - 1) * pageSize,
      take: Number(pageSize),
      orderBy: { createdAt: 'desc' },
    });
  }

  async createComment(postId: string, userId: string, dto: any) {
    const comment = await this.prisma.comment.create({
      data: { postId, userId, parentId: dto.parent_id || null, content: dto.content },
    });
    await this.prisma.post.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } });

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
          const post = await this.prisma.post.findUnique({
            where: { id: postId },
            select: { regionId: true },
          });
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
        const post = await this.prisma.post.findUnique({
          where: { id: postId },
          select: { userId: true, regionId: true },
        });
        if (post && post.userId !== userId) {
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

    return comment;
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

  async createLottery(userId: string, dto: any) {
    return this.prisma.commentLottery.create({
      data: { postId: dto.post_id, title: dto.title, drawAt: new Date(dto.draw_at), allowDuplicate: !!dto.allow_duplicate },
    });
  }

  async getLotteryDetail(postId: string) {
    return this.prisma.commentLottery.findUnique({ where: { postId }, include: { prizes: true } });
  }

  async cancelLottery(lotteryId: string, dto: any) {
    return this.prisma.commentLottery.update({ where: { id: lotteryId }, data: { status: 'cancelled', cancelledReason: dto.reason } });
  }

  async drawLottery(lotteryId: string) {
    return { success: true, winners: [] };
  }
}
