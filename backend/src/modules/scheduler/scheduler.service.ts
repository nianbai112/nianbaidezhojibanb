import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class SchedulerService {
  constructor(private readonly prisma: PrismaService) {}

  async getJobs(query: any) {
    const { page = 1, pageSize = 20, type, isEnabled } = query;

    const where: any = {};
    if (type) where.type = type;
    if (isEnabled !== undefined) where.isEnabled = isEnabled === 'true' || isEnabled === true;

    const [list, total] = await Promise.all([
      this.prisma.scheduledJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.scheduledJob.count({ where }),
    ]);

    return {
      list: list.map((job) => ({
        ...job,
        executorBound: this.hasRealExecutor(job.type),
        executorLabel: this.hasRealExecutor(job.type) ? '已接入真实执行器' : '未绑定真实执行器',
      })),
      total,
      page: Number(page),
      pageSize: Number(pageSize),
    };
  }

  async createJob(data: any, operatorId: string) {
    const { name, type, cron, config, isEnabled = true } = data;

    if (!name) throw new BadRequestException('任务名称不能为空');
    if (!type) throw new BadRequestException('任务类型不能为空');

    const job = await this.prisma.scheduledJob.create({
      data: {
        name,
        type,
        cron,
        config,
        isEnabled,
        createdBy: operatorId,
      },
    });

    return { success: true, data: job };
  }

  async updateJob(id: string, data: any, operatorId: string) {
    const job = await this.prisma.scheduledJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('任务不存在');

    const updated = await this.prisma.scheduledJob.update({
      where: { id },
      data: {
        name: data.name,
        cron: data.cron,
        config: data.config,
        isEnabled: data.isEnabled,
      },
    });

    return { success: true, data: updated };
  }

  async runJob(id: string, operatorId: string) {
    const job = await this.prisma.scheduledJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('任务不存在');
    if (!this.hasRealExecutor(job.type)) {
      throw new BadRequestException(`任务类型 ${job.type} 尚未绑定真实执行器，不能标记为执行成功`);
    }

    // Create log entry
    const log = await this.prisma.scheduledJobLog.create({
      data: {
        jobId: id,
        status: 'running',
        detail: { triggeredBy: operatorId },
      },
    });

    // Update job status
    await this.prisma.scheduledJob.update({
      where: { id },
      data: { lastRunAt: new Date(), lastStatus: 'running' },
    });

    // Execute job asynchronously
    this.executeJob(id, log.id).catch(() => {});

    return { success: true, logId: log.id };
  }

  private async executeJob(jobId: string, logId: string) {
    try {
      const job = await this.prisma.scheduledJob.findUnique({ where: { id: jobId } });
      if (!job) return;

      let result: any = {};
      switch (job.type) {
        case 'cleanup':
          result = await this.executeCleanupJob(job.config);
          break;
        case 'monitor':
          result = await this.executeMonitorJob();
          break;
        default:
          throw new BadRequestException(`任务类型 ${job.type} 尚未绑定真实执行器，未执行任何业务动作`);
      }

      // Update log
      await this.prisma.scheduledJobLog.update({
        where: { id: logId },
        data: { status: 'success', detail: result, finishedAt: new Date() },
      });

      // Update job
      await this.prisma.scheduledJob.update({
        where: { id: jobId },
        data: { lastStatus: 'success', runCount: { increment: 1 } },
      });
    } catch (error: any) {
      // Update log with error
      await this.prisma.scheduledJobLog.update({
        where: { id: logId },
        data: {
          status: 'failed',
          error: error.message,
          finishedAt: new Date(),
        },
      });

      // Update job
      await this.prisma.scheduledJob.update({
        where: { id: jobId },
        data: { lastStatus: 'failed', lastError: error.message },
      });
    }
  }

  async stopJob(id: string, operatorId: string) {
    const job = await this.prisma.scheduledJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('任务不存在');

    await this.prisma.scheduledJob.update({
      where: { id },
      data: { isEnabled: false },
    });

    return { success: true };
  }

  async getJobLogs(id: string, query: any) {
    const { page = 1, pageSize = 20, status } = query;

    const where: any = { jobId: id };
    if (status) where.status = status;

    const [list, total] = await Promise.all([
      this.prisma.scheduledJobLog.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.scheduledJobLog.count({ where }),
    ]);

    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  private hasRealExecutor(type: string) {
    return ['cleanup', 'monitor'].includes(type);
  }

  private async executeCleanupJob(config: any) {
    const beforeDays = Math.max(Number(config?.beforeDays || 30), 7);
    const beforeDate = new Date(Date.now() - beforeDays * 24 * 60 * 60 * 1000);
    const [serverLogs, jobLogs] = await Promise.all([
      this.prisma.serverLog.deleteMany({ where: { createdAt: { lt: beforeDate } } }),
      this.prisma.scheduledJobLog.deleteMany({ where: { startedAt: { lt: beforeDate }, status: { not: 'running' } } }),
    ]);
    return {
      message: `清理完成，保留最近 ${beforeDays} 天`,
      deletedServerLogs: serverLogs.count,
      deletedJobLogs: jobLogs.count,
    };
  }

  private async executeMonitorJob() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [recentErrors, pendingAlerts, activeJobs] = await Promise.all([
      this.prisma.serverLog.count({ where: { level: 'error', createdAt: { gte: oneHourAgo } } }),
      this.prisma.systemAlert.count({ where: { status: 'pending' } }),
      this.prisma.scheduledJob.count({ where: { isEnabled: true } }),
    ]);
    return {
      message: '监控检测完成',
      recentErrors,
      pendingAlerts,
      activeJobs,
    };
  }
}
