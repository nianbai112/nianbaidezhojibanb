import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class CommentService {
  constructor(private readonly prisma: PrismaService) {}

  async getCommentsV2(postId: string, query: any) {
    const { page = 1, sonPage = 10, cType = 0, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: { postId, deletedAt: null, parentId: null },
        include: { user: { select: { id: true, nickname: true, avatar: true } }, replies: { include: { user: { select: { id: true, nickname: true, avatar: true } } }, orderBy: { createdAt: 'asc' }, take: Number(sonPage) } },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
        orderBy: { isTop: 'desc', createdAt: 'desc' },
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
