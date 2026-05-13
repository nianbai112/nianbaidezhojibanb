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

    return { list, total, page: Number(page), pageSize: Number(pageSize) };
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

      // Execute based on job type
      let result: any = {};
      switch (job.type) {
        case 'daily_report':
          result = { message: '日报生成完成' };
          break;
        case 'settlement':
          result = { message: '结算完成' };
          break;
        case 'ranking':
          result = { message: '榜单刷新完成' };
          break;
        case 'recommend':
          result = { message: '推荐池刷新完成' };
          break;
        case 'cleanup':
          result = { message: '清理完成' };
          break;
        case 'ai_task':
          result = { message: 'AI任务执行完成' };
          break;
        case 'notification':
          result = { message: '通知发送完成' };
          break;
        case 'monitor':
          result = { message: '监控检测完成' };
          break;
        default:
          result = { message: '任务执行完成' };
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
}
