import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class ABTestService {
  constructor(private readonly prisma: PrismaService) {}

  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  private assignVariant(userId: string, variants: any[]): any {
    const hash = this.hashUserId(userId);
    const totalWeight = variants.reduce((sum, v) => sum + (v.weight || 1), 0);
    const normalizedHash = hash % totalWeight;

    let cumulative = 0;
    for (const variant of variants) {
      cumulative += variant.weight || 1;
      if (normalizedHash < cumulative) {
        return variant;
      }
    }
    return variants[0];
  }

  async getAssignment(query: any, userId?: string) {
    const { type, regionId } = query;
    if (!userId) return { tests: [] };

    const where: any = { status: 'running' };
    if (type) where.type = type;
    if (regionId) where.OR = [{ regionId }, { regionId: null }];

    const tests = await this.prisma.aBTest.findMany({ where });

    const assignments = await Promise.all(
      tests.map(async (test) => {
        // Check existing assignment
        let assignment = await this.prisma.aBTestAssignment.findUnique({
          where: { testId_userId: { testId: test.id, userId } },
        });

        if (!assignment) {
          // Assign to variant
          const variants = test.variants as any[];
          const variant = this.assignVariant(userId + test.id, variants);

          assignment = await this.prisma.aBTestAssignment.create({
            data: {
              testId: test.id,
              userId,
              variantId: variant.id,
            },
          });
        }

        const variants = test.variants as any[];
        const variant = variants.find((v) => v.id === assignment.variantId);

        return {
          testId: test.id,
          testName: test.name,
          type: test.type,
          variantId: assignment.variantId,
          variantName: variant?.name,
          config: variant?.config,
        };
      }),
    );

    return { tests: assignments };
  }

  async getTests(query: any) {
    const { page = 1, pageSize = 20, status, type } = query;

    const where: any = {};
    if (status) where.status = status;
    if (type) where.type = type;

    const [list, total] = await Promise.all([
      this.prisma.aBTest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
      }),
      this.prisma.aBTest.count({ where }),
    ]);

    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  async createTest(data: any, operatorId: string) {
    const { name, description, type, regionId, variants, targetMetric, startAt, endAt } = data;

    if (!name) throw new BadRequestException('实验名称不能为空');
    if (!variants?.length) throw new BadRequestException('至少需要一个变体');

    const test = await this.prisma.aBTest.create({
      data: {
        name,
        description,
        type,
        regionId,
        variants,
        targetMetric,
        startAt: startAt ? new Date(startAt) : null,
        endAt: endAt ? new Date(endAt) : null,
        status: 'draft',
        createdBy: operatorId,
      },
    });

    return { success: true, data: test };
  }

  async updateTest(id: string, data: any, operatorId: string) {
    const test = await this.prisma.aBTest.findUnique({ where: { id } });
    if (!test) throw new NotFoundException('实验不存在');
    if (test.status === 'running') throw new BadRequestException('运行中的实验不能修改');

    const updated = await this.prisma.aBTest.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        type: data.type,
        regionId: data.regionId,
        variants: data.variants,
        targetMetric: data.targetMetric,
        startAt: data.startAt ? new Date(data.startAt) : undefined,
        endAt: data.endAt ? new Date(data.endAt) : undefined,
      },
    });

    return { success: true, data: updated };
  }

  async startTest(id: string, operatorId: string) {
    const test = await this.prisma.aBTest.findUnique({ where: { id } });
    if (!test) throw new NotFoundException('实验不存在');
    if (test.status === 'running') throw new BadRequestException('实验已在运行中');

    await this.prisma.aBTest.update({
      where: { id },
      data: { status: 'running', startAt: new Date() },
    });

    return { success: true };
  }

  async stopTest(id: string, operatorId: string) {
    const test = await this.prisma.aBTest.findUnique({ where: { id } });
    if (!test) throw new NotFoundException('实验不存在');
    if (test.status !== 'running') throw new BadRequestException('实验未在运行中');

    await this.prisma.aBTest.update({
      where: { id },
      data: { status: 'completed', endAt: new Date() },
    });

    return { success: true };
  }

  async getTestResults(id: string, query: any) {
    const test = await this.prisma.aBTest.findUnique({ where: { id } });
    if (!test) throw new NotFoundException('实验不存在');

    const variants = test.variants as any[];
    const assignments = await this.prisma.aBTestAssignment.findMany({
      where: { testId: id },
    });

    const results = await this.prisma.aBTestResult.findMany({
      where: { testId: id },
      orderBy: { date: 'desc' },
    });

    // Aggregate results by variant
    const variantStats = variants.map((variant) => {
      const variantAssignments = assignments.filter((a) => a.variantId === variant.id);
      const variantResults = results.filter((r) => r.variantId === variant.id);

      const metrics: Record<string, any> = {};
      variantResults.forEach((r) => {
        if (!metrics[r.metric]) {
          metrics[r.metric] = { total: 0, count: 0 };
        }
        metrics[r.metric].total += Number(r.value);
        metrics[r.metric].count += r.count;
      });

      return {
        variantId: variant.id,
        variantName: variant.name,
        assignments: variantAssignments.length,
        metrics,
      };
    });

    return {
      testId: id,
      testName: test.name,
      status: test.status,
      targetMetric: test.targetMetric,
      variants: variantStats,
      totalAssignments: assignments.length,
    };
  }
}
