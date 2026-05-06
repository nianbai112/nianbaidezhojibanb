import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async getPendingStats() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [postPending, commentPending, merchantPending, withdrawPending, cityAgentPending, reportPending] = await Promise.all([
      this.prisma.post.count({ where: { auditStatus: 'pending', status: { not: 'DELETED' }, deletedAt: null } }),
      this.prisma.comment.count({ where: { auditStatus: 'pending', status: { not: 'deleted' } } }),
      this.prisma.merchant.count({ where: { status: 'pending' } }),
      this.prisma.withdraw.count({ where: { status: 'PENDING' } }),
      this.prisma.cityAgentApplication.count({ where: { status: 'pending' } }),
      this.prisma.report.count({ where: { status: 'pending' } }),
    ]);

    const todayApproved = await this.prisma.auditRecord.count({
      where: { status: 'approved', reviewedAt: { gte: todayStart } },
    });
    const todayRejected = await this.prisma.auditRecord.count({
      where: { status: 'rejected', reviewedAt: { gte: todayStart } },
    });

    return {
      todayPending: postPending + commentPending + merchantPending + withdrawPending + cityAgentPending + reportPending,
      postPending,
      commentPending,
      merchantPending,
      withdrawPending,
      cityAgentPending,
      reportPending,
      totalPending: postPending + commentPending + merchantPending + withdrawPending + cityAgentPending + reportPending,
      todayApproved,
      todayRejected,
      overdueCount: 0,
    };
  }

  async getPendingCounts() {
    const [posts, comments, merchants, withdraws, cityAgents, reports] = await Promise.all([
      this.prisma.post.count({ where: { auditStatus: 'pending', status: { not: 'DELETED' }, deletedAt: null } }),
      this.prisma.comment.count({ where: { auditStatus: 'pending', status: { not: 'deleted' } } }),
      this.prisma.merchant.count({ where: { status: 'pending' } }),
      this.prisma.withdraw.count({ where: { status: 'PENDING' } }),
      this.prisma.cityAgentApplication.count({ where: { status: 'pending' } }),
      this.prisma.report.count({ where: { status: 'pending' } }),
    ]);
    return { posts, comments, merchants, withdraws, cityAgents, reports };
  }

  async getPendingList(query: any) {
    const { page = 1, pageSize = 20, targetType } = query;
    const skip = (+page - 1) * +pageSize;
    const take = +pageSize;

    const items: any[] = [];
    let total = 0;

    if (!targetType || targetType === 'post') {
      const posts = await this.prisma.post.findMany({
        where: { auditStatus: 'pending', status: { not: 'DELETED' }, deletedAt: null },
        skip, take,
        include: { user: { select: { id: true, nickname: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
      });
      items.push(...posts.map((p: any) => ({ ...p, targetType: 'post', targetTitle: p.title || p.content?.slice(0, 50) })));
      total += await this.prisma.post.count({ where: { auditStatus: 'pending', status: { not: 'DELETED' }, deletedAt: null } });
    }

    if (!targetType || targetType === 'comment') {
      const comments = await this.prisma.comment.findMany({
        where: { auditStatus: 'pending', status: { not: 'deleted' } },
        skip, take,
        include: { user: { select: { id: true, nickname: true, avatar: true } }, post: { select: { id: true, title: true } } },
        orderBy: { createdAt: 'desc' },
      });
      items.push(...comments.map((c: any) => ({ ...c, targetType: 'comment', targetTitle: c.content?.slice(0, 50) })));
      total += await this.prisma.comment.count({ where: { auditStatus: 'pending', status: { not: 'deleted' } } });
    }

    if (!targetType || targetType === 'merchant') {
      const merchants = await this.prisma.merchant.findMany({
        where: { status: 'pending' },
        skip, take,
        orderBy: { createdAt: 'desc' },
      });
      items.push(...merchants.map((m: any) => ({ ...m, targetType: 'merchant', targetTitle: m.name })));
      total += await this.prisma.merchant.count({ where: { status: 'pending' } });
    }

    if (!targetType || targetType === 'withdraw') {
      const withdraws = await this.prisma.withdraw.findMany({
        where: { status: 'PENDING' },
        skip, take,
        include: { user: { select: { id: true, nickname: true } } },
        orderBy: { createdAt: 'desc' },
      });
      items.push(...withdraws.map((w: any) => ({ ...w, targetType: 'withdraw', targetTitle: `提现 ${w.amount}` })));
      total += await this.prisma.withdraw.count({ where: { status: 'PENDING' } });
    }

    if (!targetType || targetType === 'city_agent') {
      const apps = await this.prisma.cityAgentApplication.findMany({
        where: { status: 'pending' },
        skip, take,
        orderBy: { createdAt: 'desc' },
      });
      items.push(...apps.map((a: any) => ({ ...a, targetType: 'city_agent', targetTitle: a.name || a.contactName })));
      total += await this.prisma.cityAgentApplication.count({ where: { status: 'pending' } });
    }

    if (!targetType || targetType === 'report') {
      const reports = await this.prisma.report.findMany({
        where: { status: 'pending' },
        skip, take,
        include: { reporter: { select: { id: true, nickname: true } } },
        orderBy: { createdAt: 'desc' },
      });
      items.push(...reports.map((r: any) => ({ ...r, targetType: 'report', targetTitle: r.reason })));
      total += await this.prisma.report.count({ where: { status: 'pending' } });
    }

    return { list: items, total, page: +page, pageSize: +pageSize };
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
      await this.prisma.post.updateMany({
        where: { id: { in: ids.map(String) } },
        data: { auditStatus: status, status: approved ? 'PUBLISHED' : 'REJECTED', auditReason: remark },
      });
    } else if (type === 'comment') {
      await this.prisma.comment.updateMany({
        where: { id: { in: ids.map(String) } },
        data: { auditStatus: status, status: approved ? 'active' : 'hidden', auditReason: remark },
      });
    } else if (type === 'merchant') {
      await this.prisma.merchant.updateMany({
        where: { id: { in: ids.map(String) } },
        data: { status },
      });
    } else if (type === 'withdraw') {
      await this.prisma.withdraw.updateMany({
        where: { id: { in: ids.map(String) } },
        data: { status: approved ? 'SUCCESS' : 'REJECTED', failReason: approved ? null : remark, processedAt: new Date() },
      });
    } else if (type === 'city_agent') {
      await this.prisma.cityAgentApplication.updateMany({
        where: { id: { in: ids.map(String) } },
        data: { status, rejectReason: approved ? null : remark, approvedAt: approved ? new Date() : null },
      });
    } else if (type === 'report') {
      await this.prisma.report.updateMany({
        where: { id: { in: ids.map(String) } },
        data: { status: approved ? 'handled' : 'rejected', result: remark, handlerId: reviewerId, handledAt: new Date() },
      });
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
}
