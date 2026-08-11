import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

@Injectable()
export class NetDiskAdminService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeNullableString(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined;
    return String(value);
  }

  private normalizeNullableNumber(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private async resolveResourceOwnerId(userId?: string) {
    if (userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) throw new BadRequestException('资源归属用户不存在');
      return user.id;
    }

    const systemOpenid = 'admin_netdisk_operator';
    const existing = await this.prisma.user.findUnique({
      where: { openid: systemOpenid },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await this.prisma.user.create({
      data: {
        openid: systemOpenid,
        nickname: '后台资源助手',
        userType: 4,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    return created.id;
  }

  private async resolveConfigRegionId(regionId?: string) {
    if (regionId) return regionId;
    const region = await this.prisma.region.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!region) throw new BadRequestException('暂无区域，请先创建区域');
    return region.id;
  }

  private async normalizeResourcePayload(dto: any, isCreate = false) {
    const data: any = {};
    const stringFields = ['title', 'cover', 'description', 'url', 'extractCode', 'status'];

    for (const field of stringFields) {
      const value = this.normalizeNullableString(dto?.[field]);
      if (value !== undefined) data[field] = value;
    }

    if (dto?.categoryId !== undefined) data.categoryId = this.normalizeNullableString(dto.categoryId) ?? null;
    if (dto?.platformId !== undefined) data.platformId = this.normalizeNullableString(dto.platformId) ?? null;

    const price = this.normalizeNullableNumber(dto?.price);
    if (price !== undefined) data.price = price;
    else if (dto?.price === '') data.price = null;

    const size = this.normalizeNullableNumber(dto?.size);
    if (size !== undefined) data.size = Math.max(Math.floor(size), 0);
    else if (isCreate) data.size = 0;

    const type = this.normalizeNullableString(dto?.type);
    if (type !== undefined) data.type = type;
    else if (isCreate) data.type = 'file';

    if (dto?.isShared !== undefined) data.isShared = Boolean(dto.isShared);

    if (isCreate) {
      if (!data.title) throw new BadRequestException('资源名称不能为空');
      if (!data.url) throw new BadRequestException('资源链接不能为空');
      data.userId = await this.resolveResourceOwnerId(this.normalizeNullableString(dto?.userId));
    } else if (dto?.userId) {
      data.userId = await this.resolveResourceOwnerId(this.normalizeNullableString(dto.userId));
    }

    return data;
  }

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
    const data = {
      name: String(dto.name || ''),
      icon: this.normalizeNullableString(dto.icon),
      regionId: this.normalizeNullableString(dto.regionId),
      sortOrder: this.normalizeNullableNumber(dto.sortOrder) ?? 0,
    };
    if (!data.name) throw new BadRequestException('分类名称不能为空');
    return this.prisma.netDiskCategory.create({ data });
  }

  async updateCategory(id: string, dto: any) {
    const data: any = {};
    if (dto.name !== undefined) data.name = String(dto.name || '');
    if (dto.icon !== undefined) data.icon = this.normalizeNullableString(dto.icon) ?? null;
    if (dto.regionId !== undefined) data.regionId = this.normalizeNullableString(dto.regionId) ?? null;
    const sortOrder = this.normalizeNullableNumber(dto.sortOrder);
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    return this.prisma.netDiskCategory.update({ where: { id }, data });
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
    const data = {
      name: String(dto.name || ''),
      icon: this.normalizeNullableString(dto.icon),
      baseUrl: this.normalizeNullableString(dto.baseUrl),
      sortOrder: this.normalizeNullableNumber(dto.sortOrder) ?? 0,
    };
    if (!data.name) throw new BadRequestException('平台名称不能为空');
    return this.prisma.netDiskPlatform.create({ data });
  }

  async updatePlatform(id: string, dto: any) {
    const data: any = {};
    if (dto.name !== undefined) data.name = String(dto.name || '');
    if (dto.icon !== undefined) data.icon = this.normalizeNullableString(dto.icon) ?? null;
    if (dto.baseUrl !== undefined) data.baseUrl = this.normalizeNullableString(dto.baseUrl) ?? null;
    const sortOrder = this.normalizeNullableNumber(dto.sortOrder);
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    return this.prisma.netDiskPlatform.update({ where: { id }, data });
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
    const data = await this.normalizeResourcePayload(dto, true);
    return this.prisma.netDiskResource.create({ data });
  }

  async updateResource(id: string, dto: any) {
    const data = await this.normalizeResourcePayload(dto, false);
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
    regionId = await this.resolveConfigRegionId(regionId);
    const config = await this.prisma.netDiskProfitConfig.findUnique({ where: { regionId } });
    return config || { regionId, platformCommission: 0, regionCommission: 0, authorShare: 1 };
  }

  async upsertProfitConfig(regionId: string, dto: any) {
    regionId = await this.resolveConfigRegionId(regionId);
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
