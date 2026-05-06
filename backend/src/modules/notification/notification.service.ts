import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll(userId: string, query: any) {
    const { type, page = 1, pageSize = 10, region_id } = query;
    const where: any = { userId };
    if (type) where.type = type;
    const [list, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({ where, skip: (page - 1) * pageSize, take: Number(pageSize), orderBy: { createdAt: 'desc' } }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    return { list, total, unreadCount, page, pageSize };
  }

  async markRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== userId) throw new NotFoundException('通知不存在');
    return this.prisma.notification.update({ where: { id }, data: { isRead: true, readAt: new Date() } });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true, readAt: new Date() } });
    return { success: true };
  }

  async deleteNotification(notificationId: string, userId: string) {
    await this.prisma.notification.deleteMany({ where: { id: notificationId, userId } });
    return { success: true };
  }

  async getUnreadCount(userId: string, regionId: string) {
    const count = await this.prisma.notification.count({ where: { userId, isRead: false } });
    return { unreadCount: count };
  }
}
