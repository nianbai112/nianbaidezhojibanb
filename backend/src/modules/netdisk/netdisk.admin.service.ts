import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class NetDiskAdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ======================== 分类管理 ========================

  async getCategoryList(query: any) {
    const { page = 1, pageSize = 20, regionId } = query;
    const where: any = {};
    if (regionId) where.regionId = regionId;

    const [list, total] = await Promise.all([
      this.prisma.netDiskCategory.findMany({
        where,
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { resources: true } } },
      }),
      this.prisma.netDiskCategory.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  async createCategory(dto: any) {
    return this.prisma.netDiskCategory.create({ data: dto });
  }

  async updateCategory(id: string, dto: any) {
    return this.prisma.netDiskCategory.update({ where: { id }, data: dto });
  }

  async deleteCategory(id: string) {
    await this.prisma.netDiskCategory.delete({ where: { id } });
    return { success: true };
  }

  // ======================== 平台管理 ========================

  async getPlatformList(query: any) {
    const { page = 1, pageSize = 20 } = query;
    const [list, total] = await Promise.all([
      this.prisma.netDiskPlatform.findMany({
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { resources: true } } },
      }),
      this.prisma.netDiskPlatform.count(),
    ]);
    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  async createPlatform(dto: any) {
    return this.prisma.netDiskPlatform.create({ data: dto });
  }

  async updatePlatform(id: string, dto: any) {
    return this.prisma.netDiskPlatform.update({ where: { id }, data: dto });
  }

  async deletePlatform(id: string) {
    await this.prisma.netDiskPlatform.delete({ where: { id } });
    return { success: true };
  }

  // ======================== 资源管理 ========================

  async getResourceList(query: any) {
    const { page = 1, pageSize = 20, keyword, categoryId, platformId, status } = query;
    const where: any = {};
    if (categoryId) where.categoryId = categoryId;
    if (platformId) where.platformId = platformId;
    if (status) where.status = status;
    if (keyword) where.title = { contains: keyword };

    const [list, total] = await Promise.all([
      this.prisma.netDiskResource.findMany({
        where,
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
        include: {
          User: { select: { id: true, nickname: true, avatar: true } },
          category: { select: { id: true, name: true } },
          platform: { select: { id: true, name: true } },
        },
      }),
      this.prisma.netDiskResource.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  async getResourceDetail(id: string) {
    const item = await this.prisma.netDiskResource.findUnique({
      where: { id },
      include: {
        User: { select: { id: true, nickname: true, avatar: true, phone: true } },
        category: { select: { id: true, name: true } },
        platform: { select: { id: true, name: true } },
      },
    });
    if (!item) throw new NotFoundException('资源不存在');
    return item;
  }

  async createResource(dto: any) {
    const { price, ...rest } = dto;
    const data: any = { ...rest };
    if (price !== undefined) data.price = price;
    return this.prisma.netDiskResource.create({ data });
  }

  async updateResource(id: string, dto: any) {
    const { price, ...rest } = dto;
    const data: any = { ...rest };
    if (price !== undefined) data.price = price;
    return this.prisma.netDiskResource.update({ where: { id }, data });
  }

  async updateResourceStatus(id: string, status: string) {
    const data: any = { status };
    if (status === 'active') data.isShared = true;
    if (status === 'banned') data.isShared = false;
    return this.prisma.netDiskResource.update({ where: { id }, data });
  }

  async deleteResource(id: string) {
    await this.prisma.netDiskResource.delete({ where: { id } });
    return { success: true };
  }

  // ======================== 评论管理 ========================

  async getCommentList(query: any) {
    const { page = 1, pageSize = 20, resourceId, status } = query;
    const where: any = {};
    if (resourceId) where.resourceId = resourceId;
    if (status) where.status = status;

    const [list, total] = await Promise.all([
      this.prisma.netDiskComment.findMany({
        where,
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, nickname: true, avatar: true } },
          resource: { select: { id: true, title: true } },
        },
      }),
      this.prisma.netDiskComment.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  async updateCommentStatus(id: string, status: string) {
    return this.prisma.netDiskComment.update({ where: { id }, data: { status } });
  }

  async deleteComment(id: string) {
    await this.prisma.netDiskComment.delete({ where: { id } });
    return { success: true };
  }

  // ======================== 下载记录 ========================

  async getDownloadList(query: any) {
    const { page = 1, pageSize = 20, resourceId, userId, paid } = query;
    const where: any = {};
    if (resourceId) where.resourceId = resourceId;
    if (userId) where.userId = userId;
    if (paid !== undefined && paid !== '') where.paid = paid === 'true' || paid === true;

    const [list, total] = await Promise.all([
      this.prisma.netDiskDownload.findMany({
        where,
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, nickname: true, avatar: true } },
          resource: { select: { id: true, title: true, price: true } },
        },
      }),
      this.prisma.netDiskDownload.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  // ======================== 收益配置 ========================

  async getProfitConfig(regionId: string) {
    if (!regionId) throw new Error('regionId is required');
    const config = await this.prisma.netDiskProfitConfig.findUnique({ where: { regionId } });
    return config || { regionId, platformCommission: 0, regionCommission: 0, authorShare: 1 };
  }

  async upsertProfitConfig(regionId: string, dto: any) {
    if (!regionId) throw new Error('regionId is required');
    return this.prisma.netDiskProfitConfig.upsert({
      where: { regionId },
      create: { regionId, ...dto },
      update: dto,
    });
  }

  // ======================== 举报管理 ========================

  async getReportList(query: any) {
    const { page = 1, pageSize = 20, status } = query;
    const where: any = { targetType: 'netdisk' };
    if (status) where.status = status;

    const [list, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: { select: { id: true, nickname: true, avatar: true } },
        },
      }),
      this.prisma.report.count({ where }),
    ]);
    return { list, total, page: Number(page), pageSize: Number(pageSize) };
  }

  async handleReport(id: string, status: string) {
    return this.prisma.report.update({ where: { id }, data: { status } });
  }
}
