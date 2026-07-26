import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import {
  CreateSchoolDto,
  UpdateSchoolDto,
  SchoolQueryDto,
  AdminSchoolQueryDto,
} from './dto/school.dto';

@Injectable()
export class SchoolService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== 公开接口（小程序用） ====================

  async list(query: SchoolQueryDto) {
    const page = Math.max(Number(query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(query.page_size) || 20, 1), 100);
    const where: any = { isEnabled: true };

    if (query.keyword) {
      const keyword = query.keyword.trim();
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { shortName: { contains: keyword, mode: 'insensitive' } },
        { campusName: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    if (query.region_id) {
      where.regionId = query.region_id;
    }

    if (query.city) {
      where.city = { contains: query.city, mode: 'insensitive' };
    }

    if (query.type) {
      where.type = query.type;
    }

    const [list, total] = await Promise.all([
      this.prisma.school.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.school.count({ where }),
    ]);

    return {
      data: list.map((s) => this.toPublicSchool(s)),
      total,
      page,
      page_size: pageSize,
    };
  }

  async detail(id: string) {
    const school = await this.prisma.school.findUnique({ where: { id } });
    if (!school) throw new NotFoundException('学校不存在');
    return { data: this.toPublicSchool(school) };
  }

  // ==================== 管理接口 ====================

  async adminList(query: AdminSchoolQueryDto) {
    const page = Math.max(Number(query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 20, 1), 100);
    const where: any = {};

    if (query.keyword) {
      const keyword = query.keyword.trim();
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { shortName: { contains: keyword, mode: 'insensitive' } },
        { campusName: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    if (query.regionId) {
      where.regionId = query.regionId;
    }

    if (query.city) {
      where.city = { contains: query.city, mode: 'insensitive' };
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.isEnabled !== undefined) {
      where.isEnabled = query.isEnabled;
    }

    const [list, total] = await Promise.all([
      this.prisma.school.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          region: { select: { id: true, name: true } },
          _count: { select: { studentVerifies: true } },
        },
      }),
      this.prisma.school.count({ where }),
    ]);

    return {
      list: list.map((s) => this.toAdminSchool(s)),
      total,
      page,
      pageSize,
    };
  }

  async adminStats() {
    const [totalCount, enabledCount, boundCount, unboundCount] = await Promise.all([
      this.prisma.school.count(),
      this.prisma.school.count({ where: { isEnabled: true } }),
      this.prisma.school.count({ where: { regionId: { not: null } } }),
      this.prisma.school.count({ where: { regionId: null } }),
    ]);
    return {
      total: totalCount,
      enabled: enabledCount,
      bound: boundCount,
      unbound: unboundCount,
    };
  }

  async create(dto: CreateSchoolDto) {
    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('学校名称不能为空');
    }

    const school = await this.prisma.school.create({
      data: {
        name: dto.name.trim(),
        shortName: dto.shortName?.trim() || null,
        type: dto.type || 'university',
        province: dto.province?.trim() || null,
        city: dto.city?.trim() || null,
        district: dto.district?.trim() || null,
        address: dto.address?.trim() || null,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        campusName: dto.campusName?.trim() || null,
        logo: dto.logo || null,
        cover: dto.cover || null,
        regionId: dto.regionId || null,
        isEnabled: dto.isEnabled !== false,
        sortOrder: dto.sortOrder ?? 0,
        remark: dto.remark?.trim() || null,
      },
      include: {
        region: { select: { id: true, name: true } },
        _count: { select: { studentVerifies: true } },
      },
    });

    return { success: true, data: this.toAdminSchool(school) };
  }

  async update(id: string, dto: UpdateSchoolDto) {
    const existing = await this.prisma.school.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('学校不存在');

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.shortName !== undefined) data.shortName = dto.shortName?.trim() || null;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.province !== undefined) data.province = dto.province?.trim() || null;
    if (dto.city !== undefined) data.city = dto.city?.trim() || null;
    if (dto.district !== undefined) data.district = dto.district?.trim() || null;
    if (dto.address !== undefined) data.address = dto.address?.trim() || null;
    if (dto.latitude !== undefined) data.latitude = dto.latitude ?? null;
    if (dto.longitude !== undefined) data.longitude = dto.longitude ?? null;
    if (dto.campusName !== undefined) data.campusName = dto.campusName?.trim() || null;
    if (dto.logo !== undefined) data.logo = dto.logo || null;
    if (dto.cover !== undefined) data.cover = dto.cover || null;
    if (dto.regionId !== undefined) data.regionId = dto.regionId || null;
    if (dto.isEnabled !== undefined) data.isEnabled = dto.isEnabled;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.remark !== undefined) data.remark = dto.remark?.trim() || null;

    const school = await this.prisma.school.update({
      where: { id },
      data,
      include: {
        region: { select: { id: true, name: true } },
        _count: { select: { studentVerifies: true } },
      },
    });

    return { success: true, data: this.toAdminSchool(school) };
  }

  async updateStatus(id: string, isEnabled: boolean) {
    const existing = await this.prisma.school.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('学校不存在');

    await this.prisma.school.update({
      where: { id },
      data: { isEnabled },
    });

    return { success: true };
  }

  async delete(id: string) {
    const existing = await this.prisma.school.findUnique({
      where: { id },
      include: { _count: { select: { studentVerifies: true } } },
    });
    if (!existing) throw new NotFoundException('学校不存在');

    // 如果有关联认证记录，只禁用不删除
    if (existing._count.studentVerifies > 0) {
      await this.prisma.school.update({
        where: { id },
        data: { isEnabled: false },
      });
      return { success: true, message: '学校已禁用（存在关联认证记录）' };
    }

    await this.prisma.school.delete({ where: { id } });
    return { success: true };
  }

  async getByRegion(regionId: string) {
    const schools = await this.prisma.school.findMany({
      where: { regionId, isEnabled: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return { data: schools.map((s) => this.toPublicSchool(s)) };
  }

  async bindToRegion(regionId: string, schoolIds: string[]) {
    // 验证区域存在
    const region = await this.prisma.region.findUnique({ where: { id: regionId } });
    if (!region) throw new NotFoundException('区域不存在');

    // 批量更新学校的 regionId
    await this.prisma.school.updateMany({
      where: { id: { in: schoolIds } },
      data: { regionId },
    });

    return { success: true };
  }

  // ==================== 序列化 ====================

  private toPublicSchool(s: any) {
    return {
      id: s.id,
      name: s.name,
      short_name: s.shortName || '',
      shortName: s.shortName || '',
      type: s.type,
      province: s.province || '',
      city: s.city || '',
      district: s.district || '',
      address: s.address || '',
      campus_name: s.campusName || '',
      campusName: s.campusName || '',
      region_id: s.regionId || '',
      regionId: s.regionId || '',
    };
  }

  private toAdminSchool(s: any) {
    return {
      id: s.id,
      name: s.name,
      shortName: s.shortName || '',
      type: s.type,
      province: s.province || '',
      city: s.city || '',
      district: s.district || '',
      address: s.address || '',
      latitude: s.latitude ? Number(s.latitude) : null,
      longitude: s.longitude ? Number(s.longitude) : null,
      campusName: s.campusName || '',
      logo: s.logo || '',
      cover: s.cover || '',
      regionId: s.regionId || '',
      regionName: s.region?.name || '',
      isEnabled: s.isEnabled,
      sortOrder: s.sortOrder,
      remark: s.remark || '',
      studentVerifyCount: s._count?.studentVerifies || 0,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }
}
