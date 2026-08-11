import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import {
  CreatePunchCategoryDto,
  UpdatePunchCategoryDto,
  CreatePunchLocationDto,
  UpdatePunchLocationDto,
  UpdatePunchConfigDto,
  PunchQueryDto,
} from './dto/punch-in.admin.dto';

@Injectable()
export class PunchInService {
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

  private normalizePage(query: { page?: unknown; pageSize?: unknown }) {
    const page = Math.max(Number(query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 20, 1), 100);
    return { page, pageSize };
  }

  // ==================== 分类管理 ====================

  async getCategories(query: PunchQueryDto) {
    const { page, pageSize } = this.normalizePage(query);
    const { keyword, status } = query;
    const where: any = {};
    if (keyword) where.name = { contains: keyword };
    if (status) where.status = status;

    const [list, total] = await Promise.all([
      this.prisma.punchInCategory.findMany({
        where,
        include: { _count: { select: { locations: true } } },
        orderBy: { sortOrder: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.punchInCategory.count({ where }),
    ]);

    return {
      list: list.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        sortOrder: c.sortOrder,
        status: c.status,
        locationCount: c._count.locations,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  async getCategory(id: string) {
    const cat = await this.prisma.punchInCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('分类不存在');
    return cat;
  }

  async createCategory(dto: CreatePunchCategoryDto) {
    const data = {
      name: dto.name,
      icon: this.normalizeNullableString(dto.icon),
      sortOrder: this.normalizeNullableNumber(dto.sortOrder) ?? 0,
      status: dto.status,
    };
    return this.prisma.punchInCategory.create({ data: data as any });
  }

  async updateCategory(id: string, dto: UpdatePunchCategoryDto) {
    const cat = await this.prisma.punchInCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('分类不存在');
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.icon !== undefined) data.icon = this.normalizeNullableString(dto.icon) ?? null;
    if (dto.sortOrder !== undefined) data.sortOrder = this.normalizeNullableNumber(dto.sortOrder) ?? 0;
    if (dto.status !== undefined) data.status = dto.status;
    return this.prisma.punchInCategory.update({ where: { id }, data });
  }

  async deleteCategory(id: string) {
    const cat = await this.prisma.punchInCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('分类不存在');

    const locCount = await this.prisma.punchInLocation.count({ where: { categoryId: id } });
    if (locCount > 0) throw new BadRequestException('该分类下有地点，无法删除');

    return this.prisma.punchInCategory.delete({ where: { id } });
  }

  // ==================== 地点管理 ====================

  async getLocations(query: any) {
    const { page, pageSize } = this.normalizePage(query);
    const { keyword, regionId, categoryId, status } = query;
    const where: any = {};
    if (keyword) where.name = { contains: keyword };
    if (regionId) where.regionId = regionId;
    if (categoryId) where.categoryId = categoryId;
    if (status) where.status = status;

    const [list, total] = await Promise.all([
      this.prisma.punchInLocation.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          _count: { select: { records: true, comments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.punchInLocation.count({ where }),
    ]);

    return {
      list: list.map((l) => ({
        id: l.id,
        regionId: l.regionId,
        categoryId: l.categoryId,
        categoryName: l.category?.name,
        name: l.name,
        description: l.description,
        address: l.address,
        latitude: l.latitude,
        longitude: l.longitude,
        coverImage: l.coverImage,
        images: l.images,
        videos: l.videos,
        status: l.status,
        isShared: l.isShared,
        recordCount: l._count.records,
        commentCount: l._count.comments,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  async getLocation(id: string) {
    const loc = await this.prisma.punchInLocation.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        _count: { select: { records: true, comments: true } },
      },
    });
    if (!loc) throw new NotFoundException('地点不存在');
    return { ...loc, recordCount: loc._count.records, commentCount: loc._count.comments };
  }

  async createLocation(dto: CreatePunchLocationDto) {
    if (!dto.regionId) throw new BadRequestException('请选择所属区域');
    if (!dto.name) throw new BadRequestException('地点名称不能为空');
    const data = this.normalizeLocationPayload(dto, true);
    return this.prisma.punchInLocation.create({ data });
  }

  async updateLocation(id: string, dto: UpdatePunchLocationDto) {
    const loc = await this.prisma.punchInLocation.findUnique({ where: { id } });
    if (!loc) throw new NotFoundException('地点不存在');
    const data = this.normalizeLocationPayload(dto, false);
    return this.prisma.punchInLocation.update({ where: { id }, data });
  }

  private normalizeLocationPayload(dto: CreatePunchLocationDto | UpdatePunchLocationDto, isCreate: boolean) {
    const data: any = {};
    const stringFields = ['regionId', 'name', 'description', 'address', 'coverImage', 'status'];

    for (const field of stringFields) {
      const value = this.normalizeNullableString((dto as any)[field]);
      if (value !== undefined) data[field] = value;
    }

    if ((dto as any).categoryId !== undefined) {
      data.categoryId = this.normalizeNullableString((dto as any).categoryId) ?? null;
    }

    const latitude = this.normalizeNullableNumber((dto as any).latitude);
    if (latitude !== undefined) data.latitude = latitude;

    const longitude = this.normalizeNullableNumber((dto as any).longitude);
    if (longitude !== undefined) data.longitude = longitude;

    if ((dto as any).images !== undefined) data.images = (dto as any).images;
    if ((dto as any).videos !== undefined) data.videos = (dto as any).videos;
    if ((dto as any).isShared !== undefined) data.isShared = Boolean((dto as any).isShared);

    if (isCreate && !data.regionId) throw new BadRequestException('请选择所属区域');
    if (isCreate && !data.name) throw new BadRequestException('地点名称不能为空');

    return data;
  }

  async deleteLocation(id: string) {
    const loc = await this.prisma.punchInLocation.findUnique({ where: { id } });
    if (!loc) throw new NotFoundException('地点不存在');

    const recordCount = await this.prisma.punchInRecord.count({ where: { locationId: id } });
    if (recordCount > 0) throw new BadRequestException('该地点还有打卡记录，无法删除');

    return this.prisma.punchInLocation.delete({ where: { id } });
  }

  // ==================== 打卡记录 ====================

  async getRecords(query: any) {
    const { page, pageSize } = this.normalizePage(query);
    const { userId, locationId, regionId, status, startDate, endDate, keyword } = query;
    const where: any = {};
    if (userId) where.userId = userId;
    if (locationId) where.locationId = locationId;
    if (regionId) where.regionId = regionId;
    if (status) where.status = status;
    if (keyword) {
      where.OR = [
        { content: { contains: keyword } },
        { User: { nickname: { contains: keyword } } },
        { location: { name: { contains: keyword } } },
      ];
    }
    if (startDate) where.date = { ...(where.date || {}), gte: startDate };
    if (endDate) where.date = { ...(where.date || {}), lte: endDate };

    const [list, total] = await Promise.all([
      this.prisma.punchInRecord.findMany({
        where,
        include: {
          User: { select: { id: true, nickname: true, avatar: true } },
          location: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.punchInRecord.count({ where }),
    ]);

    return { list, total, page, pageSize };
  }

  async getRecord(id: string) {
    const record = await this.prisma.punchInRecord.findUnique({
      where: { id },
      include: {
        User: { select: { id: true, nickname: true, avatar: true } },
        location: { select: { id: true, name: true, address: true } },
      },
    });
    if (!record) throw new NotFoundException('打卡记录不存在');
    return record;
  }

  async deleteRecord(id: string) {
    const record = await this.prisma.punchInRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('打卡记录不存在');
    return this.prisma.punchInRecord.update({
      where: { id },
      data: { status: 'DELETED' },
    });
  }

  // ==================== 评论管理 ====================

  async getComments(query: any) {
    const { page, pageSize } = this.normalizePage(query);
    const { keyword, userId, locationId, status, startDate, endDate } = query;
    const where: any = { parentId: null }; // only top-level comments
    if (userId) where.userId = userId;
    if (locationId) where.locationId = locationId;
    if (status) where.status = status;
    if (keyword) {
      where.OR = [
        { content: { contains: keyword } },
        { location: { name: { contains: keyword } } },
        { User: { nickname: { contains: keyword } } },
      ];
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59Z');
    }

    const [list, total] = await Promise.all([
      this.prisma.punchInComment.findMany({
        where,
        include: {
          User: { select: { id: true, nickname: true, avatar: true } },
          location: { select: { id: true, name: true } },
          _count: { select: { replies: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.punchInComment.count({ where }),
    ]);

    return { list, total, page, pageSize };
  }

  async getComment(id: string) {
    const comment = await this.prisma.punchInComment.findUnique({
      where: { id },
      include: {
        User: { select: { id: true, nickname: true, avatar: true } },
        location: { select: { id: true, name: true } },
        replies: {
          include: { User: { select: { id: true, nickname: true, avatar: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!comment) throw new NotFoundException('评论不存在');
    return comment;
  }

  async deleteComment(id: string) {
    const comment = await this.prisma.punchInComment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException('评论不存在');

    // Cascade soft-delete replies
    await this.prisma.$transaction([
      this.prisma.punchInComment.updateMany({
        where: { parentId: id },
        data: { status: 'DELETED' },
      }),
      this.prisma.punchInComment.update({
        where: { id },
        data: { status: 'DELETED' },
      }),
    ]);

    return { success: true };
  }

  // ==================== 区域配置 ====================

  async getConfigs(query: any) {
    const { page, pageSize } = this.normalizePage(query);
    const { isEnabled } = query;
    const where: any = {};
    if (isEnabled !== undefined) where.isEnabled = isEnabled === 'true' || isEnabled === true;

    const [list, total] = await Promise.all([
      this.prisma.punchInConfig.findMany({
        where,
        orderBy: { regionId: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.punchInConfig.count({ where }),
    ]);

    return { list, total, page, pageSize };
  }

  async getConfig(regionId: string) {
    const config = await this.prisma.punchInConfig.findUnique({ where: { regionId } });
    if (!config) {
      return {
        regionId,
        isEnabled: true,
        maxDailyCheckins: 10,
        maxLocationCheckins: 3,
        minCheckinInterval: 300,
        allowDuplicateLocation: true,
        requireLocationVerify: false,
        locationVerifyRadius: 100,
        allowImageUpload: true,
        maxImageCount: 9,
        allowVideoUpload: true,
        maxContentLength: 500,
        requireContent: false,
        allowComment: true,
        allowReply: true,
        maxCommentLength: 300,
        enableRanking: true,
        rankingCycle: 'WEEKLY',
        enableSharedLocations: true,
        enableUserSuggest: true,
        workingHoursStart: '00:00:00',
        workingHoursEnd: '23:59:59',
        weekendEnabled: true,
        holidayEnabled: true,
        isDefault: true,
      };
    }
    return config;
  }

  async updateConfig(regionId: string, dto: UpdatePunchConfigDto) {
    return this.prisma.punchInConfig.upsert({
      where: { regionId },
      update: dto as any,
      create: { regionId, ...(dto as any) },
    });
  }

  async deleteConfig(regionId: string) {
    const config = await this.prisma.punchInConfig.findUnique({ where: { regionId } });
    if (!config) throw new NotFoundException('区域配置不存在');
    return this.prisma.punchInConfig.delete({ where: { regionId } });
  }

  // ==================== 数据统计 ====================

  async getStatsOverview() {
    const [totalRecords, todayRecords, totalLocations, totalUsers] = await Promise.all([
      this.prisma.punchInRecord.count({ where: { status: 'NORMAL' } }),
      this.prisma.punchInRecord.count({
        where: { status: 'NORMAL', date: new Date().toISOString().slice(0, 10) },
      }),
      this.prisma.punchInLocation.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.punchInRecord.groupBy({
        by: ['userId'],
        where: { status: 'NORMAL' },
      }).then((r) => r.length),
    ]);

    return { totalRecords, todayRecords, totalLocations, totalUsers };
  }

  async getStatsTrends(days: number = 7) {
    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }

    const records = await this.prisma.punchInRecord.groupBy({
      by: ['date'],
      where: { status: 'NORMAL', date: { in: dates } },
      _count: { id: true },
    });

    return dates.map((date) => ({
      date,
      count: records.find((r) => r.date === date)?._count.id || 0,
    }));
  }

  async getStatsLocations(top: number = 10) {
    const locations = await this.prisma.punchInLocation.findMany({
      where: { status: 'PUBLISHED' },
      include: { _count: { select: { records: true } } },
      orderBy: { records: { _count: 'desc' } },
      take: top,
    });

    return locations.map((l) => ({
      id: l.id,
      name: l.name,
      address: l.address,
      recordCount: l._count.records,
    }));
  }
}
