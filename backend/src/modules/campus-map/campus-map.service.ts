import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/services/prisma.service';
import {
  CAMPUS_PROJECT_CATALOG,
  ILLUSTRATED_ARTWORK_HEIGHT,
  ILLUSTRATED_ARTWORK_WIDTH,
  isPublicCampusProject,
  validateCampusProjectCollection,
} from './campus-map-project-catalog';
import {
  normalizeCampusAvailability,
  normalizeCampusFeatureProperties,
  validateCampusAvailabilityManifest,
} from './campus-map-availability';
import { isNativeGcj02Manifest, projectGpsToManifestPoint } from './campus-map-collection.service';

const GLOBAL_REGION_ID = 'global';
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_LAYERS = 64;
const MAX_INLINE_FEATURES = 20_000;
const EARTH_METERS_PER_DEGREE = 111_320;
// 旧路线没有显式服务器 ACK 路口锚点时的兼容合并距离。新采集路线优先按
// routeEndpointAnchors.key 确定性连接，不再依赖邻近距离猜测拓扑。
const ROUTE_ENDPOINT_MERGE_METERS = 12;
const ENTRANCE_ROUTE_CONNECT_METERS = 60;
// 画师 AI 原文件的 1-38 号地点均已提取文字中心锚点；真实 GCJ-02 坐标仍需现场采集。
const ILLUSTRATED_ARTWORK_NUMBER_MIN = 1;
const ILLUSTRATED_ARTWORK_NUMBER_MAX = 38;
const ILLUSTRATED_ARTWORK_BOUNDS = [0, 0, ILLUSTRATED_ARTWORK_WIDTH, ILLUSTRATED_ARTWORK_HEIGHT] as const;

const VALID_CONSTRUCTION_STATUS = ['built', 'under_construction', 'planned', 'renovating'] as const;
const VALID_VISIBILITY_SCOPE = ['phase1_active', 'phase1_review', 'future_reference'] as const;
const VALID_GEOMETRY_STATUS = ['verified_polygon', 'verified_point', 'point_only', 'unmatched'] as const;
const VALID_SOURCE_CONFIDENCE = ['official_signage_and_cad', 'official_signage_only'] as const;
const VALID_SERVICE_STATUS = ['unknown', 'open', 'limited', 'unopened', 'closed', 'temporarily_closed'] as const;
const VALID_PUBLISH_STATUS = ['draft', 'review', 'published', 'hidden'] as const;
const VALID_COORDINATE_STATUS = ['uncollected', 'pending_review', 'verified', 'resample_required'] as const;

type GcjPoint = { longitude: number; latitude: number };

function gcjDistanceMeters(left: GcjPoint, right: GcjPoint) {
  const latitude = (left.latitude + right.latitude) / 2 * Math.PI / 180;
  const dx = (left.longitude - right.longitude) * EARTH_METERS_PER_DEGREE * Math.cos(latitude);
  const dy = (left.latitude - right.latitude) * EARTH_METERS_PER_DEGREE;
  return Math.sqrt(dx * dx + dy * dy);
}

function projectGcjToSegment(point: GcjPoint, start: GcjPoint, end: GcjPoint) {
  const latitude = (point.latitude + start.latitude + end.latitude) / 3 * Math.PI / 180;
  const scaleX = EARTH_METERS_PER_DEGREE * Math.cos(latitude);
  const vx = (end.longitude - start.longitude) * scaleX;
  const vy = (end.latitude - start.latitude) * EARTH_METERS_PER_DEGREE;
  const px = (point.longitude - start.longitude) * scaleX;
  const py = (point.latitude - start.latitude) * EARTH_METERS_PER_DEGREE;
  const denominator = vx * vx + vy * vy;
  const t = denominator > 0 ? Math.max(0, Math.min(1, (px * vx + py * vy) / denominator)) : 0;
  const projected = {
    longitude: start.longitude + (end.longitude - start.longitude) * t,
    latitude: start.latitude + (end.latitude - start.latitude) * t,
  };
  return { point: projected, t, distanceM: gcjDistanceMeters(point, projected) };
}

function dedupeConsecutiveGcj(points: GcjPoint[]) {
  return points.filter((point, index) => index === 0 || gcjDistanceMeters(points[index - 1], point) >= 0.3);
}

@Injectable()
export class CampusMapService {
  constructor(private readonly prisma: PrismaService) {}

  async getProjectCatalog(regionId = GLOBAL_REGION_ID) {
    const normalizedRegionId = this.normalizeRegionId(regionId);
    const rows = await this.prisma.campusMapProject.findMany({
      where: { regionId: normalizedRegionId },
      orderBy: { officialNumber: 'asc' },
      include: { media: { orderBy: { sortOrder: 'asc' } }, entrances: { orderBy: { createdAt: 'asc' } } },
    });
    if (rows.length > 0) return rows;
    // 仅全局兼容路由保留静态兜底；学校路由不再读取其他学校地点。
    if (normalizedRegionId !== GLOBAL_REGION_ID) return [];
    return CAMPUS_PROJECT_CATALOG.map((item) => ({ ...item }));
  }

  async resolveCatalogRegionId(regionId?: string, mapId?: string) {
    const requestedRegionId = String(regionId || '').trim();
    const requestedMapId = String(mapId || '').trim();
    if (!requestedRegionId && !requestedMapId) {
      throw new BadRequestException('regionId 必填；也可以提供 mapId 用于解析区域');
    }
    if (!requestedMapId) return this.requireWriteRegionId(requestedRegionId);

    const normalizedRequestedRegionId = requestedRegionId
      ? this.requireWriteRegionId(requestedRegionId)
      : '';
    if (
      normalizedRequestedRegionId
      && requestedMapId === `campus-map-${normalizedRequestedRegionId}`
    ) {
      return normalizedRequestedRegionId;
    }

    const map = await this.prisma.campusMap.findUnique({
      where: { id: requestedMapId },
      select: { regionId: true },
    });
    if (!map?.regionId) {
      throw new BadRequestException('mapId 无法解析到校园地图区域');
    }
    const resolvedRegionId = this.requireWriteRegionId(map.regionId);
    if (normalizedRequestedRegionId && normalizedRequestedRegionId !== resolvedRegionId) {
      throw new BadRequestException('regionId 与 mapId 所属区域不一致');
    }
    return resolvedRegionId;
  }

  async upsertProject(dto: Record<string, any>, adminId?: string) {
    const regionId = this.requireWriteRegionId(dto.regionId);
    const { officialNumber, officialName } = this.projectIdentity(dto);
    try {
      const placeId = await this.prisma.$transaction(async (tx) => {
        const map = regionId === GLOBAL_REGION_ID ? null : await tx.campusMap.findUnique({
          where: { regionId },
          select: { id: true },
        });
        const place = await tx.campusMapProject.upsert({
          where: { regionId_officialNumber: { regionId, officialNumber } },
          create: {
            officialNumber,
            ...this.projectMutationData(dto, regionId, map?.id || null, officialNumber, officialName, adminId),
            createdBy: adminId,
          },
          update: this.projectMutationData(dto, regionId, map?.id || null, officialNumber, officialName, adminId),
        });
        if (Array.isArray(dto.entrances)) {
          await this.replacePlaceEntrances(tx, place.id, dto.entrances, adminId);
        }
        return place.id;
      });
      return this.getPlace(regionId, placeId);
    } catch (error) {
      if (this.isUniqueConflict(error)) throw new ConflictException('地点编号或图形绑定与其他档案冲突');
      throw error;
    }
  }

  async deleteProject(officialNumber: number, regionId?: string) {
    const normalizedRegionId = this.requireWriteRegionId(regionId);
    const existing = await this.prisma.campusMapProject.findUnique({
      where: { regionId_officialNumber: { regionId: normalizedRegionId, officialNumber } },
      include: { taskLinks: { select: { taskId: true }, take: 1 } },
    });
    if (!existing) throw new NotFoundException(`编号 ${officialNumber} 不存在`);
    if (existing.taskLinks?.length) {
      throw new ConflictException('该地点已被采集任务引用，不能删除；请将发布状态改为 hidden');
    }
    return this.prisma.campusMapProject.delete({ where: { id: existing.id } });
  }

  async addProjectPhoto(officialNumber: number, photoUrl: string, adminId?: string, regionId?: string) {
    const normalizedRegionId = this.requireWriteRegionId(regionId);
    const existing = await this.prisma.campusMapProject.findUnique({
      where: { regionId_officialNumber: { regionId: normalizedRegionId, officialNumber } },
    });
    if (!existing) throw new NotFoundException(`编号 ${officialNumber} 不存在`);
    const photos = Array.isArray(existing.photos) ? existing.photos as string[] : [];
    return this.prisma.$transaction(async (tx) => {
      const updated = photos.includes(photoUrl) ? existing : await tx.campusMapProject.update({
        where: { id: existing.id },
        data: { photos: [...photos, photoUrl], updatedBy: adminId },
      });
      const media = await tx.campusMapPlaceMedia.findFirst({ where: { placeId: existing.id, url: photoUrl } });
      if (!media) {
        await tx.campusMapPlaceMedia.create({
          data: {
            placeId: existing.id,
            mediaType: photos.length === 0 ? 'cover' : 'gallery',
            sourceType: 'admin',
            url: photoUrl,
            reviewStatus: 'approved',
            isPublic: true,
            sortOrder: photos.length,
            createdBy: adminId,
          },
        });
      }
      return updated;
    });
  }

  async removeProjectPhoto(officialNumber: number, photoUrl: string, adminId?: string, regionId?: string) {
    const normalizedRegionId = this.requireWriteRegionId(regionId);
    const existing = await this.prisma.campusMapProject.findUnique({
      where: { regionId_officialNumber: { regionId: normalizedRegionId, officialNumber } },
    });
    if (!existing) throw new NotFoundException(`编号 ${officialNumber} 不存在`);
    const photos = Array.isArray(existing.photos) ? (existing.photos as string[]).filter((u) => u !== photoUrl) : [];
    return this.prisma.$transaction(async (tx) => {
      await tx.campusMapPlaceMedia.deleteMany({ where: { placeId: existing.id, url: photoUrl, sourceType: 'admin' } });
      return tx.campusMapProject.update({
        where: { id: existing.id },
        data: { photos, updatedBy: adminId },
      });
    });
  }

  async seedProjectsFromCatalog(adminId?: string, regionId?: string) {
    const normalizedRegionId = this.requireWriteRegionId(regionId);
    const existing = await this.prisma.campusMapProject.count({ where: { regionId: normalizedRegionId } });
    if (existing > 0) return { skipped: true, count: existing };
    const map = normalizedRegionId === GLOBAL_REGION_ID ? null : await this.prisma.campusMap.findUnique({
      where: { regionId: normalizedRegionId }, select: { id: true },
    });
    await this.prisma.campusMapProject.createMany({
      data: CAMPUS_PROJECT_CATALOG.map((item) => ({
        regionId: normalizedRegionId,
        mapId: map?.id,
        officialNumber: item.officialNumber,
        officialName: item.officialName,
        engineeringAlias: item.engineeringAlias || '',
        phase: item.phase,
        constructionStatus: item.constructionStatus,
        serviceStatus: item.visibilityScope === 'phase1_active' ? 'open' : 'unopened',
        unavailableMessage: item.visibilityScope === 'phase1_active' ? null : '项目尚未开放',
        // 初始目录只是后台待核对底稿；名称、建设状态、现场照片与真实地址
        // 都需运营/骑手证据闭环后再手动发布，不允许 seed 直接对用户公开。
        publishStatus: item.visibilityScope === 'future_reference' ? 'draft' : 'review',
        visibilityScope: item.visibilityScope,
        semanticType: item.semanticType,
        searchable: item.searchable,
        navigable: item.navigable,
        geometryStatus: item.geometryStatus,
        sourceConfidence: item.sourceConfidence,
        artworkFeatureKey: item.artworkFeatureKey,
        artworkAnchorX: item.artworkAnchorX,
        artworkAnchorY: item.artworkAnchorY,
        artworkGeometry: item.artworkGeometry,
        photos: [],
        sortOrder: item.officialNumber,
        createdBy: adminId,
      })),
      skipDuplicates: true,
    });
    return { seeded: true, count: CAMPUS_PROJECT_CATALOG.length };
  }

  async listPlaces(regionId: string, filters: Record<string, any> = {}) {
    const normalizedRegionId = this.normalizeRegionId(regionId);
    const where: any = {
      regionId: normalizedRegionId,
      ...(filters.publishStatus ? { publishStatus: String(filters.publishStatus) } : {}),
      ...(filters.constructionStatus ? { constructionStatus: String(filters.constructionStatus) } : {}),
      ...(filters.coordinateStatus ? { coordinateStatus: String(filters.coordinateStatus) } : {}),
    };
    if (filters.keyword) {
      const keyword = String(filters.keyword).trim();
      where.OR = [
        { officialName: { contains: keyword } },
        { displayName: { contains: keyword } },
        { engineeringAlias: { contains: keyword } },
      ];
    }
    const page = Math.max(1, Number(filters.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 20));
    const [items, total] = await Promise.all([
      this.prisma.campusMapProject.findMany({
        where,
        include: { media: { orderBy: { sortOrder: 'asc' } }, entrances: { orderBy: { createdAt: 'asc' } } },
        orderBy: [{ sortOrder: 'asc' }, { officialNumber: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.campusMapProject.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getPlace(regionId: string, placeId: string) {
    const place = await this.prisma.campusMapProject.findFirst({
      where: { id: placeId, regionId: this.normalizeRegionId(regionId) },
      include: { media: { orderBy: { sortOrder: 'asc' } }, entrances: { orderBy: { createdAt: 'asc' } }, taskLinks: true },
    });
    if (!place) throw new NotFoundException('地点不存在');
    return place;
  }

  async createPlace(regionId: string, dto: Record<string, any>, adminId?: string) {
    const normalizedRegionId = this.requireWriteRegionId(regionId);
    const { officialNumber, officialName } = this.projectIdentity(dto);
    try {
      const placeId = await this.prisma.$transaction(async (tx) => {
        const exists = await tx.campusMapProject.findUnique({
          where: { regionId_officialNumber: { regionId: normalizedRegionId, officialNumber } },
          select: { id: true },
        });
        if (exists) throw new ConflictException(`编号 ${officialNumber} 已存在`);
        const map = await tx.campusMap.findUnique({ where: { regionId: normalizedRegionId }, select: { id: true } });
        const place = await tx.campusMapProject.create({
          data: {
            officialNumber,
            ...this.projectMutationData(
              dto,
              normalizedRegionId,
              map?.id || null,
              officialNumber,
              officialName,
              adminId,
            ),
            createdBy: adminId,
          },
        });
        if (Array.isArray(dto.entrances)) {
          await this.replacePlaceEntrances(tx, place.id, dto.entrances, adminId);
        }
        return place.id;
      });
      return this.getPlace(normalizedRegionId, placeId);
    } catch (error) {
      if (this.isUniqueConflict(error)) throw new ConflictException(`编号 ${officialNumber} 已存在`);
      throw error;
    }
  }

  async updatePlace(regionId: string, placeId: string, dto: Record<string, any>, adminId?: string) {
    const normalizedRegionId = this.requireWriteRegionId(regionId);
    try {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.campusMapProject.findFirst({
          where: { id: placeId, regionId: normalizedRegionId },
        });
        if (!current) throw new NotFoundException('地点不存在');
        const merged = {
          ...current,
          ...dto,
          regionId: normalizedRegionId,
          officialNumber: dto.officialNumber ?? current.officialNumber,
          officialName: dto.officialName ?? current.officialName,
        };
        const { officialNumber, officialName } = this.projectIdentity(merged);
        if (officialNumber !== current.officialNumber) {
          const conflicting = await tx.campusMapProject.findUnique({
            where: { regionId_officialNumber: { regionId: normalizedRegionId, officialNumber } },
            select: { id: true },
          });
          if (conflicting && conflicting.id !== placeId) {
            throw new ConflictException(`编号 ${officialNumber} 已被其他地点使用`);
          }
        }
        const map = await tx.campusMap.findUnique({
          where: { regionId: normalizedRegionId },
          select: { id: true },
        });
        await tx.campusMapProject.update({
          where: { id: placeId },
          data: {
            officialNumber,
            ...this.projectMutationData(
              merged,
              normalizedRegionId,
              map?.id || current.mapId || null,
              officialNumber,
              officialName,
              adminId,
            ),
          },
        });
        if (Array.isArray(dto.entrances)) {
          await this.replacePlaceEntrances(tx, placeId, dto.entrances, adminId);
        }
      });
      return this.getPlace(normalizedRegionId, placeId);
    } catch (error) {
      if (this.isUniqueConflict(error)) throw new ConflictException('地点编号或图形绑定与其他档案冲突');
      throw error;
    }
  }

  async deletePlace(regionId: string, placeId: string) {
    const place = await this.getPlace(regionId, placeId);
    if (place.taskLinks?.length) {
      throw new ConflictException('该地点已被采集任务引用，不能删除；请将发布状态改为 hidden');
    }
    return this.prisma.campusMapProject.delete({ where: { id: placeId } });
  }

  async addPlaceMedia(regionId: string, placeId: string, dto: Record<string, any>, adminId?: string) {
    await this.getPlace(regionId, placeId);
    const url = String(dto.url || '').trim();
    if (!url) throw new BadRequestException('媒体地址不能为空');
    return this.prisma.campusMapPlaceMedia.create({
      data: {
        placeId,
        mediaType: ['cover', 'gallery', 'facade', 'entrance', 'signage', 'construction'].includes(dto.mediaType) ? dto.mediaType : 'gallery',
        sourceType: String(dto.sourceType || 'admin'),
        url,
        storageKey: dto.storageKey || null,
        mimeType: dto.mimeType || null,
        byteSize: Number(dto.byteSize) || 0,
        checksum: dto.checksum || null,
        reviewStatus: 'approved',
        isPublic: dto.isPublic === true,
        sortOrder: Number(dto.sortOrder) || 0,
        metadata: this.asRecord(dto.metadata) || undefined,
        createdBy: adminId,
      },
    });
  }

  async submitUserCheckIn(placeId: string, dto: Record<string, any>, userId: string) {
    const stablePlaceId = String(placeId || '').trim();
    const stableUserId = String(userId || '').trim();
    const url = String(dto.url || '').trim();
    if (!stablePlaceId || !stableUserId || !url) throw new BadRequestException('打卡信息不完整');

    const place = await this.prisma.campusMapProject.findFirst({
      where: {
        id: stablePlaceId,
        publishStatus: 'published',
        visibilityScope: 'phase1_active',
      },
    });
    if (!place) throw new NotFoundException('当前地点不可打卡');
    if (!['open', 'limited'].includes(String(place.serviceStatus || ''))
      || place.coordinateStatus !== 'verified'
      || !this.isValidPublicCoordinate(place.longitude, place.latitude)) {
      throw new BadRequestException('当前地点尚未完成开放和位置核验');
    }

    const longitude = Number(dto.longitude);
    const latitude = Number(dto.latitude);
    const accuracy = Number(dto.accuracy);
    if (!this.isValidPublicCoordinate(longitude, latitude)
      || !Number.isFinite(accuracy)
      || accuracy <= 0
      || accuracy > 50) {
      throw new BadRequestException('定位精度不足，请到室外重新定位');
    }
    const distanceM = gcjDistanceMeters(
      { longitude, latitude },
      { longitude: Number(place.longitude), latitude: Number(place.latitude) },
    );
    if (distanceM > 120) throw new BadRequestException('请到达地点附近后再打卡');

    const recent = await this.prisma.campusMapPlaceMedia.findFirst({
      where: {
        placeId: stablePlaceId,
        sourceType: 'user_checkin',
        createdBy: stableUserId,
        reviewStatus: { in: ['pending', 'approved'] },
        createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (recent) throw new ConflictException('你已提交过该地点打卡，请等待审核');

    const capturedAt = dto.capturedAt ? new Date(dto.capturedAt) : new Date();
    return this.prisma.campusMapPlaceMedia.create({
      data: {
        placeId: stablePlaceId,
        mediaType: 'gallery',
        sourceType: 'user_checkin',
        url,
        storageKey: dto.storageKey || null,
        mimeType: dto.mimeType || null,
        byteSize: Number(dto.byteSize) || 0,
        reviewStatus: 'pending',
        isPublic: false,
        sortOrder: 1000,
        capturedAt: Number.isNaN(capturedAt.getTime()) ? new Date() : capturedAt,
        captureLongitude: longitude,
        captureLatitude: latitude,
        captureAccuracy: accuracy,
        metadata: { kind: 'arrival_checkin', distanceM: Math.round(distanceM) },
        createdBy: stableUserId,
      },
    });
  }

  async updatePlaceMedia(regionId: string, placeId: string, mediaId: string, dto: Record<string, any>) {
    await this.getPlace(regionId, placeId);
    const media = await this.prisma.campusMapPlaceMedia.findFirst({ where: { id: mediaId, placeId } });
    if (!media) throw new NotFoundException('地点图片不存在');
    const reviewStatus = dto.reviewStatus === undefined ? undefined : String(dto.reviewStatus);
    if (reviewStatus && !['pending', 'approved', 'rejected'].includes(reviewStatus)) {
      throw new BadRequestException('地点图片审核状态无效');
    }
    const isPublic = reviewStatus === 'approved'
      ? true
      : reviewStatus === 'rejected'
        ? false
        : dto.isPublic;
    return this.prisma.campusMapPlaceMedia.update({
      where: { id: mediaId },
      data: {
        mediaType: dto.mediaType,
        isPublic,
        sortOrder: dto.sortOrder === undefined ? undefined : Number(dto.sortOrder),
        reviewStatus,
      },
    });
  }

  async deletePlaceMedia(regionId: string, placeId: string, mediaId: string) {
    await this.getPlace(regionId, placeId);
    const deleted = await this.prisma.campusMapPlaceMedia.deleteMany({ where: { id: mediaId, placeId } });
    if (!deleted.count) throw new NotFoundException('地点图片不存在');
    return { deleted: true };
  }

  private async replacePlaceEntrances(
    tx: any,
    placeId: string,
    entrances: Array<Record<string, any>>,
    adminId?: string,
  ) {
    if (entrances.length > 30) throw new BadRequestException('一个地点最多配置 30 个入口');
    const existingEntrances = await tx.campusMapPlaceEntrance.findMany({
      where: { placeId },
      select: { id: true },
    });
    const existingIds = new Set<string>(existingEntrances.map((entrance: any) => String(entrance.id)));
    const submittedIds = new Set<string>();
    const rows = entrances.map((entrance, index) => {
      const id = String(entrance.id || '').trim() || null;
      if (id && !existingIds.has(id)) {
        throw new BadRequestException(`第 ${index + 1} 个入口不属于当前地点`);
      }
      if (id && submittedIds.has(id)) {
        throw new BadRequestException(`第 ${index + 1} 个入口 ID 重复`);
      }
      if (id) submittedIds.add(id);
      const longitude = Number(entrance.longitude);
      const latitude = Number(entrance.latitude);
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180
        || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        throw new BadRequestException(`第 ${index + 1} 个入口坐标无效`);
      }
      const serviceStatus = String(entrance.serviceStatus || 'unknown');
      if (!VALID_SERVICE_STATUS.includes(serviceStatus as any)) throw new BadRequestException(`第 ${index + 1} 个入口服务状态无效`);
      return {
        id,
        name: String(entrance.name || `入口 ${index + 1}`).trim(),
        longitude,
        latitude,
        coordinateType: 'gcj02',
        accuracy: this.optionalFiniteNumber(entrance.accuracy),
        addressDescription: String(entrance.addressDescription || '').trim() || null,
        serviceStatus,
        isPrimary: entrance.isPrimary === true,
        sourceType: String(entrance.sourceType || 'admin'),
        updatedBy: adminId,
      };
    });

    for (const row of rows) {
      const { id, ...data } = row;
      if (id) {
        await tx.campusMapPlaceEntrance.update({ where: { id }, data });
      } else {
        await tx.campusMapPlaceEntrance.create({
          data: { ...data, placeId, createdBy: adminId },
        });
      }
    }

    const removedIds = [...existingIds].filter((id) => !submittedIds.has(id));
    if (removedIds.length) {
      await tx.campusMapPlaceEntrance.deleteMany({
        where: { placeId, id: { in: removedIds } },
      });
    }
  }

  async listAvailabilityStatuses(where: Record<string, any> = {}) {
    const maps = await this.prisma.campusMap.findMany({
      where,
      include: { activeVersion: true, draft: true },
      orderBy: { regionId: 'asc' },
    });

    return maps.map((map: any) => {
      const publishedManifest = this.asRecord(map.activeVersion?.manifest) || {};
      const draftManifest = this.asRecord(map.draft?.manifest) || {};
      const publishedAvailability = normalizeCampusAvailability(publishedManifest.availability);
      const draftAvailability = normalizeCampusAvailability(draftManifest.availability);

      return {
        regionId: map.regionId,
        configured: true,
        publishedStatus: map.activeVersion ? publishedAvailability.status : undefined,
        draftStatus: map.draft ? draftAvailability.status : undefined,
        unavailableMessage: map.activeVersion
          ? publishedAvailability.unavailableMessage
          : draftAvailability.unavailableMessage,
        draftRevision: map.draft?.revision,
        activeVersion: map.activeVersion?.version,
      };
    });
  }

  async getActiveMap(regionId?: string) {
    const requestedRegionId = this.normalizeRegionId(regionId);
    const regionMap = await this.findPublishedMap(requestedRegionId);
    if (this.isPublishedMapEnabled(regionMap)) {
      return this.attachPublicPlaces(this.toPublishedMap(regionMap, requestedRegionId, requestedRegionId));
    }

    if (requestedRegionId !== GLOBAL_REGION_ID) {
      const globalMap = await this.findPublishedMap(GLOBAL_REGION_ID);
      if (this.isPublishedMapEnabled(globalMap)) {
        return this.attachPublicPlaces(this.toPublishedMap(globalMap, requestedRegionId, GLOBAL_REGION_ID));
      }
    }

    // Public clients only consume an explicitly published immutable version.
    // Legacy Config rows remain readable by the admin migration surface, but
    // must never silently bypass draft review and publication here.
    return this.disabledConfig(requestedRegionId, regionMap ? 'not_published' : 'not_configured');
  }

  async getRegionMap(regionId: string) {
    const normalizedRegionId = this.normalizeRegionId(regionId);
    const map = await this.prisma.campusMap.findUnique({
      where: { regionId: normalizedRegionId },
      include: { draft: true, activeVersion: true },
    });
    if (map) {
      const value = this.asRecord(map.draft?.manifest)
        || this.asRecord(map.activeVersion?.manifest)
        || {};
      return this.withWorkflow(
        map.enabled || map.draft ? this.adminManifest(value, normalizedRegionId) : this.disabledConfig(normalizedRegionId, 'not_published'),
        map,
      );
    }

    const regionRecord = await this.prisma.config.findUnique({
      where: { key: this.configKey(normalizedRegionId) },
    });
    if (!regionRecord) {
      return this.disabledConfig(normalizedRegionId, 'not_configured');
    }
    return this.toPublicConfig(regionRecord, normalizedRegionId, normalizedRegionId, false);
  }

  async saveDraft(
    regionId: string,
    dto: Record<string, any>,
    adminId?: string,
    expectedRevision?: number,
  ) {
    const normalizedRegionId = this.normalizeRegionId(regionId);
    const manifest = this.normalizeAdminPayload(normalizedRegionId, dto);
    this.manifestStats(manifest);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const map = await tx.campusMap.upsert({
          where: { regionId: normalizedRegionId },
          create: { regionId: normalizedRegionId, enabled: false, createdBy: adminId, updatedBy: adminId },
          update: { updatedBy: adminId },
        });
        await this.repairRegionCatalogIntegrity(tx, normalizedRegionId, map.id);
        await this.syncBoundProjectFeatures(tx, normalizedRegionId, map.id, manifest, adminId);
        // 管理员可以编辑路线的展示属性，但“骑手已审核”不能由前端 JSON 自行声明。
        // 每次保存草稿都用同区域、已审核且已合并的采集对象重建可信证据。
        await this.reconcileApprovedRouteFeatures(tx, normalizedRegionId, manifest);
        this.manifestStats(manifest);
        const existing = await tx.campusMapDraft.findUnique({ where: { mapId: map.id } });

        if (!existing) {
          if (expectedRevision !== undefined && Number(expectedRevision) !== 0) {
            throw new ConflictException('草稿已被其他管理员更新，请重新加载');
          }
          const draft = await tx.campusMapDraft.create({
            data: { mapId: map.id, manifest, revision: 1, updatedBy: adminId },
          });
          return this.withWorkflow(this.adminManifest(manifest, normalizedRegionId), map, {
            draftRevision: draft.revision,
          });
        }

        const revision = expectedRevision === undefined ? existing.revision : Number(expectedRevision);
        const updated = await tx.campusMapDraft.updateMany({
          where: { mapId: map.id, revision },
          data: { manifest, revision: { increment: 1 }, updatedBy: adminId },
        });
        if (updated.count !== 1) {
          throw new ConflictException('草稿已被其他管理员更新，请重新加载');
        }
        return this.withWorkflow(this.adminManifest(manifest, normalizedRegionId), map, {
          draftRevision: revision + 1,
        });
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new ConflictException('草稿已被其他管理员更新，请重新加载');
      }
      throw error;
    }
  }

  async publishDraft(regionId: string, adminId?: string, expectedRevision?: number) {
    const normalizedRegionId = this.normalizeRegionId(regionId);
    return this.prisma.$transaction(async (tx) => {
      const map = await tx.campusMap.findUnique({ where: { regionId: normalizedRegionId } });
      if (!map) throw new NotFoundException('校园地图草稿不存在');
      await this.repairRegionCatalogIntegrity(tx, normalizedRegionId, map.id);
      const draft = await tx.campusMapDraft.findUnique({ where: { mapId: map.id } });
      if (!draft) throw new NotFoundException('校园地图草稿不存在');
      if (expectedRevision !== undefined && draft.revision !== Number(expectedRevision)) {
        throw new ConflictException('草稿已被其他管理员更新，请重新加载');
      }

      const sourceManifest = this.asRecord(draft.manifest);
      if (!sourceManifest) throw new BadRequestException('校园地图草稿内容无效');
      const manifest = JSON.parse(JSON.stringify(sourceManifest));
      // 发布可能直接面对旧草稿，不能假设它一定经过当前版本的 saveDraft。
      // 在发布事务里再次用数据库里的已审核采集对象重建路线来源，防止旧数据或
      // 手工 JSON 冒充 rider_app_approved 后直接进入公开导航。
      await this.reconcileApprovedRouteFeatures(tx, normalizedRegionId, manifest);
      // 地点与已明确提升的公开媒体必须随版本固化，回滚时不读数据库最新值。
      manifest.placeCatalog = await this.buildPublishedPlaceCatalog(tx, normalizedRegionId);
      manifest.navigation = this.compilePublishedNavigation(manifest, manifest.placeCatalog);
      this.assertPublishedNavigationClosure(manifest.placeCatalog, manifest.navigation);
      this.assertIllustratedNavigationCalibration(manifest.placeCatalog, manifest.navigation);
      const stats = this.manifestStats(manifest);
      const projectErrors = validateCampusProjectCollection(this.inlineFeatures(manifest));
      if (projectErrors.length) {
        throw new BadRequestException(projectErrors.join('；'));
      }
      const availabilityErrors = validateCampusAvailabilityManifest(manifest);
      if (availabilityErrors.length) {
        throw new BadRequestException(availabilityErrors.join('；'));
      }
      const numbered = await tx.campusMap.update({
        where: { id: map.id },
        data: { versionCounter: { increment: 1 }, updatedBy: adminId },
        select: { id: true, versionCounter: true },
      });
      const version = await tx.campusMapVersion.create({
        data: {
          mapId: map.id,
          version: numbered.versionCounter,
          manifest,
          checksum: stats.checksum,
          byteSize: stats.byteSize,
          featureCount: stats.featureCount,
          layerCount: stats.layerCount,
          publishedBy: adminId,
        },
      });
      const publishedMap = await tx.campusMap.update({
        where: { id: map.id },
        data: { activeVersionId: version.id, enabled: manifest.enabled !== false, updatedBy: adminId },
      });
      const claimedDraft = await tx.campusMapDraft.updateMany({
        where: { mapId: map.id, revision: draft.revision },
        data: { basedOnVersionId: version.id, updatedBy: adminId },
      });
      if (claimedDraft.count !== 1) {
        throw new ConflictException('草稿已被其他管理员更新，请重新加载');
      }

      return this.withWorkflow(this.adminManifest(manifest, normalizedRegionId), publishedMap, {
        draftRevision: draft.revision,
        activeVersion: numbered.versionCounter,
        activeVersionId: version.id,
      });
    });
  }

  async upsertRegionMap(regionId: string, dto: Record<string, any>, adminId?: string) {
    // 兼容旧 PUT 的调用方只允许落草稿。线上版本必须经显式 publish 接口激活，
    // 避免旧后台的自动保存行为绕过人工发布确认。
    return this.saveDraft(regionId, dto, adminId);
  }

  async listVersions(regionId: string, page = 1, pageSize = 20) {
    const normalizedRegionId = this.normalizeRegionId(regionId);
    const map = await this.prisma.campusMap.findUnique({ where: { regionId: normalizedRegionId } });
    if (!map) return { list: [], total: 0, page: 1, pageSize: Math.min(Math.max(Number(pageSize) || 20, 1), 100) };
    const safePage = Math.max(Number(page) || 1, 1);
    const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    const [list, total] = await Promise.all([
      this.prisma.campusMapVersion.findMany({
        where: { mapId: map.id },
        orderBy: { version: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
        select: {
          id: true,
          version: true,
          checksum: true,
          byteSize: true,
          featureCount: true,
          layerCount: true,
          rollbackOfId: true,
          publishedBy: true,
          publishedAt: true,
        },
      }),
      this.prisma.campusMapVersion.count({ where: { mapId: map.id } }),
    ]);
    return { list, total, page: safePage, pageSize: safePageSize };
  }

  async rollbackVersion(regionId: string, versionId: string, adminId?: string) {
    const normalizedRegionId = this.normalizeRegionId(regionId);
    return this.prisma.$transaction(async (tx) => {
      const map = await tx.campusMap.findUnique({ where: { regionId: normalizedRegionId } });
      if (!map) throw new NotFoundException('校园地图不存在');
      const target = await tx.campusMapVersion.findFirst({ where: { id: versionId, mapId: map.id } });
      if (!target) throw new NotFoundException('校园地图版本不存在');
      const sourceManifest = this.asRecord(target.manifest);
      if (!sourceManifest) throw new BadRequestException('校园地图版本内容无效');
      const manifest = JSON.parse(JSON.stringify(sourceManifest));
      // 历史版本也必须服从当前的路线来源规则。重新激活前按当前数据库审核结果
      // 对账，并重新编译导航，不能直接信任历史快照里的 collectionSource/navigation。
      await this.reconcileApprovedRouteFeatures(tx, normalizedRegionId, manifest);
      manifest.navigation = this.compilePublishedNavigation(
        manifest,
        this.publicPlaceSnapshots(manifest.placeCatalog),
      );
      const projectErrors = validateCampusProjectCollection(this.inlineFeatures(manifest));
      if (projectErrors.length) {
        throw new BadRequestException(projectErrors.join('；'));
      }
      const availabilityErrors = validateCampusAvailabilityManifest(manifest);
      if (availabilityErrors.length) {
        throw new BadRequestException(availabilityErrors.join('；'));
      }
      // 回滚是把历史快照重新发布，不能绕过当前发布规则。地点仍读取历史版本
      // 中的不可变快照，但必须再次确认入口确实存在于可达的已审核路网中。
      this.assertPublishedNavigationClosure(
        this.publicPlaceSnapshots(manifest.placeCatalog),
        manifest.navigation,
      );
      this.assertIllustratedNavigationCalibration(manifest.placeCatalog, manifest.navigation);
      const stats = this.manifestStats(manifest);
      const numbered = await tx.campusMap.update({
        where: { id: map.id },
        data: { versionCounter: { increment: 1 }, updatedBy: adminId },
        select: { id: true, versionCounter: true },
      });
      const version = await tx.campusMapVersion.create({
        data: {
          mapId: map.id,
          version: numbered.versionCounter,
          manifest,
          checksum: stats.checksum,
          byteSize: stats.byteSize,
          featureCount: stats.featureCount,
          layerCount: stats.layerCount,
          rollbackOfId: target.id,
          publishedBy: adminId,
        },
      });
      const publishedMap = await tx.campusMap.update({
        where: { id: map.id },
        data: { activeVersionId: version.id, enabled: manifest.enabled !== false, updatedBy: adminId },
      });
      const draft = await tx.campusMapDraft.findUnique({ where: { mapId: map.id } });
      if (draft) {
        const replacedDraft = await tx.campusMapDraft.updateMany({
          where: { mapId: map.id, revision: draft.revision },
          data: {
            manifest,
            revision: { increment: 1 },
            basedOnVersionId: version.id,
            updatedBy: adminId,
          },
        });
        if (replacedDraft.count !== 1) {
          throw new ConflictException('草稿已被其他管理员更新，请重新加载');
        }
      } else {
        await tx.campusMapDraft.create({
          data: { mapId: map.id, manifest, revision: 1, basedOnVersionId: version.id, updatedBy: adminId },
        });
      }
      return this.withWorkflow(this.adminManifest(manifest, normalizedRegionId), publishedMap, {
        draftRevision: (draft?.revision || 0) + 1,
        activeVersion: numbered.versionCounter,
        activeVersionId: version.id,
        rollbackOfId: target.id,
      });
    });
  }

  async disableRegionMap(regionId: string, adminId?: string) {
    const normalizedRegionId = this.normalizeRegionId(regionId);
    const map = await this.prisma.campusMap.upsert({
      where: { regionId: normalizedRegionId },
      create: { regionId: normalizedRegionId, enabled: false, createdBy: adminId, updatedBy: adminId },
      update: { enabled: false, updatedBy: adminId },
      include: { draft: true, activeVersion: true },
    });
    const value = this.asRecord(map.draft?.manifest) || this.asRecord(map.activeVersion?.manifest) || {};
    return this.withWorkflow(this.disabledConfig(normalizedRegionId, 'disabled', normalizedRegionId, value), map);
  }

  private async findPublishedMap(regionId: string) {
    return this.prisma.campusMap.findUnique({
      where: { regionId },
      include: { activeVersion: true },
    });
  }

  private async getLegacyActiveMap(requestedRegionId: string) {
    const regionRecord = await this.prisma.config.findUnique({
      where: { key: this.configKey(requestedRegionId) },
    });
    if (this.isLegacyMapEnabled(regionRecord)) {
      return this.toPublicConfig(regionRecord, requestedRegionId, requestedRegionId);
    }
    if (requestedRegionId !== GLOBAL_REGION_ID) {
      const globalRecord = await this.prisma.config.findUnique({
        where: { key: this.configKey(GLOBAL_REGION_ID) },
      });
      if (this.isLegacyMapEnabled(globalRecord)) {
        return this.toPublicConfig(globalRecord, requestedRegionId, GLOBAL_REGION_ID);
      }
    }
    return this.disabledConfig(requestedRegionId, 'not_configured');
  }

  private toPublishedMap(map: any, requestedRegionId: string, sourceRegionId: string) {
    if (!map.enabled) return this.withWorkflow(this.disabledConfig(requestedRegionId, 'disabled', sourceRegionId), map);
    const value = this.asRecord(map.activeVersion?.manifest);
    if (!value) return this.withWorkflow(this.disabledConfig(requestedRegionId, 'not_published', sourceRegionId), map);
    const availability = normalizeCampusAvailability(value.availability);
    if (availability.status === 'unopened') {
      return this.withWorkflow(
        {
          ...this.disabledConfig(
            requestedRegionId,
            'school_unopened',
            sourceRegionId,
            { ...value, layers: [] },
          ),
          availability,
          layers: [],
        },
        map,
        { activeVersion: map.activeVersion.version, activeVersionId: map.activeVersion.id },
      );
    }
    return this.withWorkflow(
      this.toPublicConfig({ isEnabled: true, value, updatedAt: map.activeVersion.publishedAt }, requestedRegionId, sourceRegionId),
      map,
      { activeVersion: map.activeVersion.version, activeVersionId: map.activeVersion.id },
    );
  }

  private isPublishedMapEnabled(map: any) {
    const manifest = this.asRecord(map?.activeVersion?.manifest);
    return !!map?.enabled && !!manifest && manifest.enabled !== false;
  }

  private isLegacyMapEnabled(record: any) {
    const value = this.asRecord(record?.value);
    return !!record?.isEnabled && !!value && value.enabled !== false && value.isEnabled !== false;
  }

  private adminManifest(value: Record<string, any>, regionId: string) {
    if (value.enabled === false) return this.disabledConfig(regionId, 'draft_disabled', regionId, value);
    return this.toPublicConfig({ isEnabled: true, value, updatedAt: value.updatedAt }, regionId, regionId, false);
  }

  private withWorkflow(value: Record<string, any>, map: any, overrides: Record<string, any> = {}): any {
    return {
      ...value,
      workflow: this.compact({
        mapId: map?.id,
        draftRevision: map?.draft?.revision,
        activeVersion: map?.activeVersion?.version,
        activeVersionId: map?.activeVersionId || map?.activeVersion?.id,
        ...overrides,
      }),
    };
  }

  private normalizeAdminPayload(regionId: string, dto: Record<string, any> = {}) {
    const raw = this.asRecord(dto.config) || this.asRecord(dto) || {};
    const enabled = raw.enabled !== false && raw.isEnabled !== false;
    const layers = this.normalizeLayers(raw.layers);
    const imageMap = this.normalizeImageMap(raw.imageMap || raw.backgroundImage || raw.baseImage);
    const mapId = String(raw.mapId || raw.id || `campus-map-${regionId}`).trim();

    if (enabled && !layers.length && !imageMap) {
      throw new BadRequestException('启用校园地图前至少需要配置 1 个可绘制图层或图片底图');
    }
    if (enabled && !mapId) {
      throw new BadRequestException('启用校园地图前需要填写地图标识 mapId');
    }
    if (enabled && this.isAmapPayload(raw) && this.countDrawableFeatures(layers) < 1) {
      throw new BadRequestException('高德校园地图至少需要绘制 1 个有效点位、区域或路线');
    }

    const bbox = this.normalizeNumberTuple(raw.bbox);
    const renderBBox = this.normalizeNumberTuple(raw.renderBBox) || bbox;
    const positioning = this.normalizePositioning(raw.positioning || raw.locationProjection || raw.gpsCalibration);
    const requestedPositioning = this.asRecord(raw.positioning || raw.locationProjection || raw.gpsCalibration);
    const calibrationPoints = positioning && Array.isArray(positioning.calibrationPoints)
      ? positioning.calibrationPoints
      : [];
    if (enabled && !this.isAmapPayload(raw) && requestedPositioning?.enabled === true
      && (calibrationPoints.length < 3
        || !this.hasNonCollinearCalibration(calibrationPoints))) {
      throw new BadRequestException('图片/CAD 底图开启定位时必须配置至少 3 个非共线校准点');
    }

    return this.compact({
      schemaVersion: Number(raw.schemaVersion || 1),
      enabled,
      availability: normalizeCampusAvailability(raw.availability),
      regionId,
      title: String(raw.title || '校园地图').trim(),
      mapId,
      version: String(raw.version || new Date().toISOString().slice(0, 10)).trim(),
      assetBaseUrl: String(raw.assetBaseUrl || '').trim(),
      imageMap,
      positioning,
      coordinateSystem: this.asRecord(raw.coordinateSystem) || {},
      amap: this.normalizeAmapSource(raw.amap || raw.amapMeta || raw.providerMeta),
      bbox,
      renderBBox,
      layers,
      recommendedInitialLayers: this.normalizeStringArray(raw.recommendedInitialLayers),
      recommendedRouteLayers: this.normalizeStringArray(raw.recommendedRouteLayers || raw.routeLayers),
      poiCandidateLayers: this.normalizeStringArray(raw.poiCandidateLayers),
      routeGraphUrl: String(raw.routeGraphUrl || '').trim(),
      navigation: this.asRecord(raw.navigation) || null,
      placeCatalog: Array.isArray(raw.placeCatalog) ? raw.placeCatalog : [],
      updatedAt: new Date().toISOString(),
    });
  }

  private toPublicConfig(record: any, requestedRegionId: string, sourceRegionId: string, publicOnly = true) {
    if (!record?.isEnabled) {
      return this.disabledConfig(requestedRegionId, 'disabled', sourceRegionId);
    }
    const value = this.asRecord(record.value) || {};
    if (value.enabled === false) {
      const disabledValue = publicOnly
        ? { ...value, layers: this.publicProjectLayers(this.normalizeLayers(value.layers)) }
        : value;
      return this.disabledConfig(requestedRegionId, 'disabled', sourceRegionId, disabledValue);
    }

    const normalizedLayers = this.normalizeLayers(value.layers);
    const layers = publicOnly ? this.publicProjectLayers(normalizedLayers) : normalizedLayers;
    const imageMap = this.normalizeImageMap(value.imageMap || value.backgroundImage || value.baseImage);
    if (!layers.length && !imageMap) {
      return this.disabledConfig(requestedRegionId, 'empty_layers', sourceRegionId, value);
    }

    return {
      schemaVersion: Number(value.schemaVersion || 1),
      enabled: true,
      availability: normalizeCampusAvailability(value.availability),
      regionId: requestedRegionId,
      sourceRegionId,
      title: String(value.title || '校园地图'),
      mapId: String(value.mapId || `campus-map-${sourceRegionId}`),
      version: String(value.version || ''),
      assetBaseUrl: String(value.assetBaseUrl || ''),
      imageMap,
      positioning: this.normalizePositioning(value.positioning || value.locationProjection || value.gpsCalibration),
      coordinateSystem: this.asRecord(value.coordinateSystem) || {},
      amap: this.normalizeAmapSource(value.amap || value.amapMeta || value.providerMeta),
      bbox: this.normalizeNumberTuple(value.bbox),
      renderBBox: this.normalizeNumberTuple(value.renderBBox) || this.normalizeNumberTuple(value.bbox),
      layers,
      recommendedInitialLayers: this.normalizeStringArray(value.recommendedInitialLayers),
      recommendedRouteLayers: this.normalizeStringArray(value.recommendedRouteLayers || value.routeLayers),
      poiCandidateLayers: this.normalizeStringArray(value.poiCandidateLayers),
      routeGraphUrl: String(value.routeGraphUrl || ''),
      navigation: this.asRecord(value.navigation) || null,
      publicPlaces: this.publicPlaceSnapshots(value.placeCatalog),
      updatedAt: value.updatedAt || record.updatedAt,
    };
  }

  private disabledConfig(regionId: string, reason: string, sourceRegionId = regionId, value: Record<string, any> = {}) {
    return {
      schemaVersion: Number(value.schemaVersion || 1),
      enabled: false,
      reason,
      availability: normalizeCampusAvailability(value.availability),
      regionId,
      sourceRegionId,
      title: String(value.title || '校园地图'),
      mapId: String(value.mapId || ''),
      version: String(value.version || ''),
      assetBaseUrl: String(value.assetBaseUrl || ''),
      imageMap: this.normalizeImageMap(value.imageMap || value.backgroundImage || value.baseImage),
      positioning: this.normalizePositioning(value.positioning || value.locationProjection || value.gpsCalibration),
      coordinateSystem: this.asRecord(value.coordinateSystem) || {},
      amap: this.normalizeAmapSource(value.amap || value.amapMeta || value.providerMeta),
      bbox: this.normalizeNumberTuple(value.bbox),
      renderBBox: this.normalizeNumberTuple(value.renderBBox) || this.normalizeNumberTuple(value.bbox),
      layers: this.normalizeLayers(value.layers),
      recommendedInitialLayers: this.normalizeStringArray(value.recommendedInitialLayers),
      recommendedRouteLayers: this.normalizeStringArray(value.recommendedRouteLayers || value.routeLayers),
      poiCandidateLayers: this.normalizeStringArray(value.poiCandidateLayers),
      routeGraphUrl: String(value.routeGraphUrl || ''),
      navigation: this.asRecord(value.navigation) || null,
      publicPlaces: this.publicPlaceSnapshots(value.placeCatalog),
      updatedAt: value.updatedAt || null,
    };
  }

  private manifestStats(manifest: Record<string, any>) {
    const layers = Array.isArray(manifest.layers) ? manifest.layers : [];
    const featureCount = layers.reduce((total, layer) => {
      const data = this.asRecord(layer?.inlineData || layer?.data);
      return total + (Array.isArray(data?.features) ? data.features.length : 0);
    }, 0);
    const canonicalJson = JSON.stringify(this.canonicalize(manifest));
    const byteSize = Buffer.byteLength(canonicalJson, 'utf8');

    if (layers.length > MAX_LAYERS) {
      throw new BadRequestException(`校园地图图层不能超过 ${MAX_LAYERS} 个`);
    }
    if (featureCount > MAX_INLINE_FEATURES) {
      throw new BadRequestException(`校园地图内嵌要素不能超过 ${MAX_INLINE_FEATURES} 个`);
    }
    if (byteSize > MAX_MANIFEST_BYTES) {
      throw new BadRequestException('校园地图发布数据不能超过 4MB，请改用远程图层或分片资源');
    }

    return {
      byteSize,
      featureCount,
      layerCount: layers.length,
      checksum: createHash('sha256').update(canonicalJson).digest('hex'),
    };
  }

  private inlineFeatures(manifest: Record<string, any>) {
    return (Array.isArray(manifest.layers) ? manifest.layers : [])
      .flatMap((layer: any) => {
        const inlineData = this.asRecord(layer?.inlineData || layer?.data);
        return Array.isArray(inlineData?.features) ? inlineData.features : [];
      });
  }

  private publicProjectLayers(layers: any[]) {
    return layers.map((layer) => {
      const inlineData = this.asRecord(layer.inlineData);
      if (!inlineData || !Array.isArray(inlineData.features)) return layer;
      const features = inlineData.features.filter((feature: any) => {
        const properties = this.asRecord(feature?.properties) || {};
        return isPublicCampusProject(properties);
      });
      return {
        ...layer,
        inlineData: { ...inlineData, features },
        featureCount: features.length,
      };
    });
  }

  private async attachPublicPlaces(config: Record<string, any>) {
    if (config.enabled !== true) return config;
    // 版本快照仍是内容来源；活动表只作为“撤回白名单”，不会把尚未发布的新改动
    // 动态拼进旧版本。这样运营把地点/照片降回待审核后可以即时止血，同时历史
    // 版本的名称、坐标、路线和样式仍保持不可变。
    const sourceRegionId = this.normalizeRegionId(config.sourceRegionId || config.regionId);
    const livePlaces = await this.prisma.campusMapProject.findMany({
      where: {
        regionId: sourceRegionId,
        publishStatus: 'published',
        visibilityScope: 'phase1_active',
      },
      select: {
        id: true,
        officialNumber: true,
        artworkFeatureKey: true,
        media: {
          where: { isPublic: true, reviewStatus: 'approved' },
          select: { id: true, url: true },
        },
      },
    });
    const byId = new Map<string, any>();
    const byOfficialNumber = new Map<number, any>();
    const byArtworkKey = new Map<string, any>();
    (livePlaces || []).forEach((place: any) => {
      byId.set(String(place.id), place);
      if (Number.isInteger(Number(place.officialNumber)) && Number(place.officialNumber) > 0) {
        byOfficialNumber.set(Number(place.officialNumber), place);
      }
      const artworkKey = String(place.artworkFeatureKey || '').trim();
      if (artworkKey) byArtworkKey.set(artworkKey, place);
    });
    const matchLivePlace = (value: any) => {
      const id = String(value?.id || value?.placeId || value?.targetPlaceId || '').trim();
      const artworkKey = String(value?.artworkFeatureKey || '').trim();
      const officialNumber = Number(value?.officialNumber);
      return (id && byId.get(id))
        || (artworkKey && byArtworkKey.get(artworkKey))
        || (Number.isInteger(officialNumber) && officialNumber > 0 && byOfficialNumber.get(officialNumber))
        || null;
    };
    const sanitizeMedia = (value: any, livePlace: any) => {
      const allowedIds = new Set((livePlace?.media || []).map((item: any) => String(item.id)));
      const allowedUrls = new Set((livePlace?.media || []).map((item: any) => String(item.url)));
      const media = (Array.isArray(value?.media) ? value.media : [])
        .filter((item: any) => allowedIds.has(String(item?.id || '')) || allowedUrls.has(String(item?.url || '')));
      const publicPhotos = (Array.isArray(value?.publicPhotos) ? value.publicPhotos : [])
        .map(String)
        .filter((url: string) => allowedUrls.has(url));
      const coverPhotoUrl = allowedUrls.has(String(value?.coverPhotoUrl || ''))
        ? String(value.coverPhotoUrl)
        : '';
      return { ...value, media, publicPhotos, coverPhotoUrl };
    };
    const publicPlaces = (Array.isArray(config.publicPlaces) ? config.publicPlaces : [])
      .map((place: any) => {
        const livePlace = matchLivePlace(place);
        return livePlace ? sanitizeMedia(place, livePlace) : null;
      })
      .filter(Boolean);
    const layers = (Array.isArray(config.layers) ? config.layers : []).map((layer: any) => {
      const inlineData = this.asRecord(layer?.inlineData || layer?.data);
      if (!inlineData || !Array.isArray(inlineData.features)) return layer;
      const features = inlineData.features
        .map((feature: any) => {
          const properties = this.asRecord(feature?.properties) || {};
          const stablePlaceFeature = Number.isInteger(Number(properties.officialNumber))
            && Number(properties.officialNumber) > 0;
          if (!stablePlaceFeature) return feature;
          const livePlace = matchLivePlace(properties);
          if (!livePlace) return null;
          return { ...feature, properties: sanitizeMedia(properties, livePlace) };
        })
        .filter(Boolean);
      return {
        ...layer,
        inlineData: { ...inlineData, features },
        featureCount: features.length,
      };
    });
    return { ...config, layers, publicPlaces };
  }

  private async buildPublishedPlaceCatalog(tx: any, regionId: string) {
    const places = await tx.campusMapProject.findMany({
      where: { regionId, publishStatus: 'published', visibilityScope: 'phase1_active' },
      include: {
        media: {
          where: { isPublic: true, reviewStatus: 'approved' },
          orderBy: { sortOrder: 'asc' },
        },
        entrances: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
      },
      orderBy: [{ sortOrder: 'asc' }, { officialNumber: 'asc' }],
    });
    places.forEach((place: any) => this.assertStablePlaceAvailability(place, true));
    const invalidNavigablePlace = places.find((place: any) => place.navigable === true
      && (place.coordinateStatus !== 'verified'
        || !this.isValidPublicCoordinate(place.longitude, place.latitude)));
    if (invalidNavigablePlace) {
      throw new BadRequestException(`地点“${invalidNavigablePlace.displayName || invalidNavigablePlace.officialName}”已开启导航，但尚无已核验的有效 GCJ-02 坐标`);
    }
    return places.map((place: any) => ({
      id: place.id,
      officialNumber: place.officialNumber,
      officialName: place.officialName,
      title: place.displayName || place.officialName,
      semanticType: place.semanticType,
      constructionStatus: place.constructionStatus,
      serviceStatus: place.serviceStatus,
      unavailableMessage: place.serviceStatus === 'open' ? '' : String(place.unavailableMessage || '').trim().slice(0, 120),
      publishStatus: place.publishStatus,
      visibilityScope: place.visibilityScope,
      searchable: place.searchable,
      navigable: place.navigable,
      geometryStatus: place.geometryStatus,
      artworkFeatureKey: place.artworkFeatureKey,
      artworkAnchorX: place.artworkAnchorX,
      artworkAnchorY: place.artworkAnchorY,
      longitude: place.coordinateStatus === 'verified' ? place.longitude : null,
      latitude: place.coordinateStatus === 'verified' ? place.latitude : null,
      coordinateStatus: place.coordinateStatus,
      address: place.addressDescription,
      formattedAddress: place.addressDescription,
      description: place.description,
      coverPhotoUrl: place.coverUrl || place.media.find((item: any) => item.mediaType === 'cover')?.url || null,
      publicPhotos: place.media.map((item: any) => item.url),
      media: place.media.map((item: any) => ({
        id: item.id,
        mediaType: item.mediaType,
        kind: item.mediaType,
        url: item.url,
        mimeType: item.mimeType,
        sortOrder: item.sortOrder,
      })),
      entrances: place.entrances.map((entrance: any) => ({
        id: entrance.id,
        name: entrance.name,
        longitude: entrance.longitude,
        latitude: entrance.latitude,
        coordinateType: 'gcj02',
        serviceStatus: entrance.serviceStatus,
        isPrimary: entrance.isPrimary,
        address: entrance.addressDescription,
      })),
    }));
  }

  private async reconcileApprovedRouteFeatures(
    tx: any,
    regionId: string,
    manifest: Record<string, any>,
  ) {
    const routeLayer = (Array.isArray(manifest.layers) ? manifest.layers : [])
      .find((layer: any) => String(layer?.id || '').toLowerCase() === 'operator_routes');
    const routeData = this.asRecord(routeLayer?.inlineData || routeLayer?.data);
    const routeFeatures = Array.isArray(routeData?.features) ? routeData.features : [];
    if (!routeFeatures.length) return;

    const sourceIdFor = (properties: Record<string, any>) => {
      const explicit = String(properties.sourceObjectId || '').trim();
      if (explicit) return explicit;
      const featureId = String(properties.id || '').trim();
      return featureId.startsWith('collection-route-')
        ? featureId.slice('collection-route-'.length)
        : '';
    };
    const routeRows = routeFeatures.map((feature: any) => {
      const properties = this.asRecord(feature?.properties) || {};
      return { feature, properties, sourceObjectId: sourceIdFor(properties) };
    });
    const sourceObjectIds = [...new Set(routeRows.map((item) => item.sourceObjectId).filter(Boolean))];
    const approvedObjects = sourceObjectIds.length > 0
      ? await tx.campusMapCollectionObject.findMany({
          where: {
            id: { in: sourceObjectIds },
            objectType: 'road',
            reviewStatus: 'approved',
            appliedToDraftAt: { not: null },
            session: { task: { regionId, status: { not: 'cancelled' } } },
          },
          select: {
            id: true,
            sessionId: true,
            geometry: true,
            properties: true,
            recordedAt: true,
            reviewedAt: true,
            reviewedBy: true,
            applyResult: true,
            attachments: {
              select: {
                id: true,
                url: true,
                kind: true,
                mimeType: true,
                metadata: true,
              },
            },
          },
        })
      : [];
    const approvedById = new Map(approvedObjects.map((object: any) => [String(object.id), object]));
    const serverControlledKeys = [
      'collectionSource',
      'sourceObjectId',
      'sourceSessionId',
      'sourceGeometryGcj02',
      'quality',
      'evidence',
      'collectedAt',
      'reviewedAt',
      'reviewedBy',
      'verificationStatus',
      'geometryStatus',
      'geometryCoordinateType',
      'coordinateType',
      'accessible',
      'wheelchair',
      'routeEndpointAnchors',
    ];

    routeRows.forEach(({ feature, properties, sourceObjectId }) => {
      const cleanProperties = { ...properties };
      serverControlledKeys.forEach((key) => delete cleanProperties[key]);
      feature.properties = cleanProperties;

      const object: any = approvedById.get(sourceObjectId);
      const geometry = this.asRecord(object?.geometry);
      const applyResult = this.asRecord(object?.applyResult);
      const routeQuality = this.asRecord(applyResult?.routeQuality);
      const rawRouteAnchors = this.asRecord(applyResult?.routeEndpointAnchors);
      const rawCoordinates = geometry?.type === 'LineString' && Array.isArray(geometry.coordinates)
        ? geometry.coordinates
        : [];
      const coordinates = rawCoordinates
        .filter((coordinate: any) => Array.isArray(coordinate)
          && this.isValidPublicCoordinate(coordinate[0], coordinate[1]))
        .map((coordinate: any) => [Number(coordinate[0]), Number(coordinate[1])]);
      const nativeGcj02 = isNativeGcj02Manifest(manifest);
      const displayCoordinates = nativeGcj02
        ? coordinates
        : coordinates.map(([longitude, latitude]) => {
            const projected = projectGpsToManifestPoint(manifest, longitude, latitude);
            return projected ? [projected.x, projected.y] : null;
          });
      if (!object
        || applyResult?.applied !== true
        || routeQuality?.source !== 'server_ack'
        || coordinates.length !== rawCoordinates.length
        || coordinates.length < 2
        || displayCoordinates.some((coordinate) => coordinate === null)) return;

      let routeEndpointAnchors: Record<string, any> | null = null;
      if (rawRouteAnchors) {
        const startAnchor = this.asRecord(rawRouteAnchors.start);
        const endAnchor = this.asRecord(rawRouteAnchors.end);
        const validAnchor = (anchor: Record<string, any> | null) => !!anchor
          && String(anchor.key || '').length === 64
          && this.isValidPublicCoordinate(anchor.longitude, anchor.latitude);
        if (Number(rawRouteAnchors.version) !== 1
          || !validAnchor(startAnchor)
          || !validAnchor(endAnchor)) return;
        const trustedSharedAnchor = (
          anchor: Record<string, any> | null,
          routeEndpoint: 'start' | 'end',
        ) => {
          const sharedFromObjectId = String(anchor?.sharedFromObjectId || '').trim();
          if (!sharedFromObjectId) return { valid: true, sharedFromObjectId: '', sharedFromEndpoint: '' };
          // 旧版只有起点的 sharedFromObjectId，语义固定为“上一段终点”。
          const sharedFromEndpoint = String(anchor?.sharedFromEndpoint || (routeEndpoint === 'start' ? 'end' : '')).trim();
          if (!['start', 'end'].includes(sharedFromEndpoint)) {
            return { valid: false, sharedFromObjectId, sharedFromEndpoint };
          }
          const sourceObject: any = approvedById.get(sharedFromObjectId);
          const sourceApplyResult = this.asRecord(sourceObject?.applyResult);
          const sourceAnchors = this.asRecord(sourceApplyResult?.routeEndpointAnchors);
          const sourceAnchor = this.asRecord(sourceAnchors?.[sharedFromEndpoint]);
          return {
            valid: !!sourceObject
              && Number(sourceAnchors?.version) === 1
              && String(sourceAnchor?.key || '') === String(anchor?.key || ''),
            sharedFromObjectId,
            sharedFromEndpoint,
          };
        };
        const startShared = trustedSharedAnchor(startAnchor, 'start');
        const endShared = trustedSharedAnchor(endAnchor, 'end');
        if (!startShared.valid || !endShared.valid) return;
        routeEndpointAnchors = {
          version: 1,
          start: {
            key: String(startAnchor!.key),
            longitude: Number(startAnchor!.longitude),
            latitude: Number(startAnchor!.latitude),
            ...(startShared.sharedFromObjectId ? {
              sharedFromObjectId: startShared.sharedFromObjectId,
              sharedFromEndpoint: startShared.sharedFromEndpoint,
            } : {}),
          },
          end: {
            key: String(endAnchor!.key),
            longitude: Number(endAnchor!.longitude),
            latitude: Number(endAnchor!.latitude),
            ...(endShared.sharedFromObjectId ? {
              sharedFromObjectId: endShared.sharedFromObjectId,
              sharedFromEndpoint: endShared.sharedFromEndpoint,
            } : {}),
          },
        };
      }

      // 展示线与导航线必须来自同一份服务器 ACK 几何。后台仍可编辑标题、公开性、
      // 路面等展示/业务属性，但不能把蓝色可视路线拖离实际导航路线。
      feature.geometry = {
        type: 'LineString',
        coordinates: displayCoordinates,
      };

      const collectedProperties = this.asRecord(object.properties) || {};
      const evidenceIds = new Set(
        (Array.isArray(applyResult.routeEvidenceAttachmentIds)
          ? applyResult.routeEvidenceAttachmentIds
          : Array.isArray(applyResult.promotedAttachmentIds)
            ? applyResult.promotedAttachmentIds
            : [])
          .map((id: unknown) => String(id)),
      );
      const evidence = (Array.isArray(object.attachments) ? object.attachments : [])
        .filter((attachment: any) => evidenceIds.has(String(attachment.id)))
        .map((attachment: any) => ({
          id: attachment.id,
          url: attachment.url,
          kind: attachment.kind,
          mimeType: attachment.mimeType,
          metadata: attachment.metadata || null,
        }));

      Object.assign(cleanProperties, {
        sourceObjectId: object.id,
        sourceSessionId: object.sessionId,
        sourceGeometryGcj02: { type: 'LineString', coordinates },
        collectionSource: 'rider_app_approved',
        verificationStatus: 'verified',
        geometryStatus: 'verified_line',
        coordinateType: 'gcj02',
        geometryCoordinateType: nativeGcj02
          ? 'gcj02'
          : String(manifest?.coordinateSystem?.type || manifest?.baseSource || 'projected'),
        collectedAt: object.recordedAt instanceof Date
          ? object.recordedAt.toISOString()
          : object.recordedAt,
        reviewedAt: object.reviewedAt instanceof Date
          ? object.reviewedAt.toISOString()
          : object.reviewedAt,
        reviewedBy: object.reviewedBy || null,
        quality: routeQuality,
        evidence,
        accessible: collectedProperties.accessible === true || collectedProperties.wheelchair === true,
        wheelchair: collectedProperties.wheelchair === true || collectedProperties.accessible === true,
        ...(routeEndpointAnchors ? { routeEndpointAnchors } : {}),
      });
    });
  }

  private compilePublishedNavigation(manifest: Record<string, any>, places: any[]) {
    const routeLayer = (Array.isArray(manifest.layers) ? manifest.layers : [])
      .find((layer: any) => String(layer?.id || '').toLowerCase() === 'operator_routes');
    const routeData = this.asRecord(routeLayer?.inlineData || routeLayer?.data);
    const routeFeatures = Array.isArray(routeData?.features) ? routeData.features : [];
    // 路网完全由当前草稿内已审核的骑手路线重新编译；不能沿用旧版本的缓存图。
    if (!routeFeatures.length) return null;

    const nodes: Record<string, any> = {};
    const routeNodeIds: string[] = [];
    const anchorNodeIds = new Map<string, string>();
    const edges: any[] = [];
    const routeEdges: any[] = [];
    const safeId = (prefix: string, value: unknown) => `${prefix}-${createHash('sha256')
      .update(String(value || prefix)).digest('hex').slice(0, 16)}`;
    const nodePoint = (nodeId: string): GcjPoint => ({
      longitude: Number(nodes[nodeId].gcj02[0]),
      latitude: Number(nodes[nodeId].gcj02[1]),
    });
    const findOrCreateRouteNode = (
      point: GcjPoint,
      sourceId: string,
      endpoint: string,
      anchor: { key: string; point: GcjPoint } | null = null,
    ) => {
      if (anchor) {
        const existingAnchorNodeId = anchorNodeIds.get(anchor.key);
        if (existingAnchorNodeId) {
          if (gcjDistanceMeters(nodePoint(existingAnchorNodeId), anchor.point) > 0.5) {
            throw new BadRequestException('同一路口锚点出现不一致坐标，请重新审核关联路线');
          }
          return existingAnchorNodeId;
        }
        const anchoredNodeId = safeId('route-node', `anchor:${anchor.key}`);
        nodes[anchoredNodeId] = {
          gcj02: [anchor.point.longitude, anchor.point.latitude],
          kind: 'route_endpoint',
          anchorKey: anchor.key,
        };
        routeNodeIds.push(anchoredNodeId);
        anchorNodeIds.set(anchor.key, anchoredNodeId);
        return anchoredNodeId;
      }
      const nearbyId = routeNodeIds.find((nodeId) => gcjDistanceMeters(nodePoint(nodeId), point) <= ROUTE_ENDPOINT_MERGE_METERS);
      if (nearbyId) return nearbyId;
      const nodeId = safeId('route-node', `${sourceId}:${endpoint}:${point.longitude.toFixed(7)}:${point.latitude.toFixed(7)}`);
      nodes[nodeId] = { gcj02: [point.longitude, point.latitude], kind: 'route_endpoint' };
      routeNodeIds.push(nodeId);
      return nodeId;
    };
    const asGcjPoints = (value: unknown): GcjPoint[] => dedupeConsecutiveGcj(
      (Array.isArray(value) ? value : [])
        .filter((coordinate: any) => Array.isArray(coordinate)
          && this.isValidPublicCoordinate(coordinate[0], coordinate[1]))
        .map((coordinate: any) => ({ longitude: Number(coordinate[0]), latitude: Number(coordinate[1]) })),
    );
    const pathLength = (coordinates: GcjPoint[]) => coordinates.slice(1)
      .reduce((total, point, index) => total + gcjDistanceMeters(coordinates[index], point), 0);
    const readRouteAnchor = (value: unknown) => {
      const anchor = this.asRecord(value);
      if (!anchor
        || !/^[a-f0-9]{64}$/.test(String(anchor.key || '').toLowerCase())
        || !this.isValidPublicCoordinate(anchor.longitude, anchor.latitude)) return null;
      return {
        key: String(anchor.key).toLowerCase(),
        point: { longitude: Number(anchor.longitude), latitude: Number(anchor.latitude) },
      };
    };
    const preparedRoutes = routeFeatures.flatMap((feature: any, index: number) => {
      const properties = this.asRecord(feature?.properties) || {};
      const riderApproved = String(properties.collectionSource || '') === 'rider_app_approved';
      // 只有经服务端采集对象表重新对账的骑手路线才能进入公开导航图。
      // 单独写 verificationStatus=verified 的导入 JSON 不是可验证证据。
      if (!riderApproved) return [];
      // 发布路网只承载当前允许公众步行的路线。受限、关闭或施工路线即使已经审核，
      // 也不能成为入口“已接入”的假证据，否则小程序路由引擎会在运行时过滤它。
      if (properties.public === false
        || properties.pedestrian === false
        || properties.closed === true
        || properties.construction === true) return [];
      const sourceGeometry = this.asRecord(properties.sourceGeometryGcj02);
      const coordinates = asGcjPoints(
        sourceGeometry?.type === 'LineString'
          ? sourceGeometry.coordinates
          : String(properties.coordinateType || '').toLowerCase() === 'gcj02'
            ? feature?.geometry?.coordinates
            : [],
      );
      if (coordinates.length < 2) return [];
      const sourceId = String(properties.sourceObjectId || properties.id || `route-${index}`);
      const routeAnchors = this.asRecord(properties.routeEndpointAnchors);
      const startAnchor = Number(routeAnchors?.version) === 1 ? readRouteAnchor(routeAnchors?.start) : null;
      const endAnchor = Number(routeAnchors?.version) === 1 ? readRouteAnchor(routeAnchors?.end) : null;
      return [{ properties, coordinates, sourceId, startAnchor, endAnchor }];
    });

    // 先注册全部可信锚点，再吸附没有锚点的历史路线。否则“旧路线在前、新锚点在后”
    // 会产生两个节点，而倒序又会合并，导致同一份数据仅因数组顺序不同而发布出不同路网。
    preparedRoutes.forEach(({ sourceId, startAnchor, endAnchor }) => {
      if (startAnchor) findOrCreateRouteNode(startAnchor.point, sourceId, 'start', startAnchor);
      if (endAnchor) findOrCreateRouteNode(endAnchor.point, sourceId, 'end', endAnchor);
    });

    preparedRoutes.forEach(({ properties, coordinates, sourceId, startAnchor, endAnchor }) => {
      const navigableCoordinates = coordinates.slice();
      if (startAnchor) {
        if (gcjDistanceMeters(startAnchor.point, navigableCoordinates[0]) > 0.3) {
          navigableCoordinates.unshift(startAnchor.point);
        } else {
          navigableCoordinates[0] = startAnchor.point;
        }
      }
      if (endAnchor) {
        const lastIndex = navigableCoordinates.length - 1;
        if (gcjDistanceMeters(endAnchor.point, navigableCoordinates[lastIndex]) > 0.3) {
          navigableCoordinates.push(endAnchor.point);
        } else {
          navigableCoordinates[lastIndex] = endAnchor.point;
        }
      }
      const a = findOrCreateRouteNode(navigableCoordinates[0], sourceId, 'start', startAnchor);
      const b = findOrCreateRouteNode(navigableCoordinates[navigableCoordinates.length - 1], sourceId, 'end', endAnchor);
      if (a === b) return;
      const edge = {
        id: safeId('route-edge', sourceId),
        a,
        b,
        lengthM: pathLength(navigableCoordinates),
        coordinates: navigableCoordinates.map((point) => [point.longitude, point.latitude]),
        verificationStatus: 'verified',
        public: properties.public !== false,
        pedestrian: properties.pedestrian !== false,
        wheelchair: properties.wheelchair === true || properties.accessible === true,
        stairs: properties.stairs === true,
        construction: properties.construction === true,
        source: 'rider_collection_approved',
        sourceObjectId: properties.sourceObjectId || null,
      };
      edges.push(edge);
      routeEdges.push({ ...edge, pointCoordinates: navigableCoordinates });
    });

    if (!routeEdges.length) return null;

    const closestRouteSegment = (point: GcjPoint) => {
      let best: any = null;
      routeEdges.forEach((edge) => {
        edge.pointCoordinates.slice(1).forEach((end: GcjPoint, index: number) => {
          const start = edge.pointCoordinates[index];
          const projection = projectGcjToSegment(point, start, end);
          if (!best || projection.distanceM < best.distanceM) {
            best = { edge, segmentIndex: index, ...projection };
          }
        });
      });
      return best;
    };

    (Array.isArray(places) ? places : []).forEach((place: any) => {
      const entranceNodeIds: string[] = [];
      if (place?.navigable !== true || !['open', 'limited'].includes(String(place.serviceStatus || ''))) {
        place.entranceNodeIds = entranceNodeIds;
        return;
      }
      (Array.isArray(place.entrances) ? place.entrances : []).forEach((entrance: any, entranceIndex: number) => {
        if (!['open', 'limited'].includes(String(entrance?.serviceStatus || ''))
          || !this.isValidPublicCoordinate(entrance?.longitude, entrance?.latitude)) return;
        const point = { longitude: Number(entrance.longitude), latitude: Number(entrance.latitude) };
        const closest = closestRouteSegment(point);
        if (!closest || closest.distanceM > ENTRANCE_ROUTE_CONNECT_METERS) return;
        const entranceId = safeId('entrance-node', entrance.id || `${place.id}:${entranceIndex}`);
        nodes[entranceId] = {
          gcj02: [point.longitude, point.latitude],
          kind: 'entrance',
          placeId: String(place.id || ''),
          entranceId: String(entrance.id || ''),
        };
        entranceNodeIds.push(entranceId);
        entrance.nodeId = entranceId;

        const projection = closest.point as GcjPoint;
        const routeCoordinates = closest.edge.pointCoordinates as GcjPoint[];
        const toA = dedupeConsecutiveGcj([point, projection]
          .concat(routeCoordinates.slice(0, closest.segmentIndex + 1).reverse()));
        const toB = dedupeConsecutiveGcj([point, projection]
          .concat(routeCoordinates.slice(closest.segmentIndex + 1)));
        [
          { destination: closest.edge.a, suffix: 'a', coordinates: toA },
          { destination: closest.edge.b, suffix: 'b', coordinates: toB },
        ].forEach((connector) => {
          if (connector.destination === entranceId || connector.coordinates.length < 2) return;
          edges.push({
            id: safeId('entrance-edge', `${entranceId}:${closest.edge.id}:${connector.suffix}`),
            a: entranceId,
            b: connector.destination,
            lengthM: pathLength(connector.coordinates),
            coordinates: connector.coordinates.map((coordinate) => [coordinate.longitude, coordinate.latitude]),
            verificationStatus: 'verified',
            public: true,
            pedestrian: true,
            wheelchair: closest.edge.wheelchair === true,
            stairs: false,
            construction: false,
            source: 'verified_entrance_connector',
          });
        });
      });
      place.entranceNodeIds = entranceNodeIds;
    });

    return {
      graph: {
        coordinateSystem: 'GCJ-02',
        generatedFrom: 'approved_operator_routes_and_published_entrances',
        generatedAt: new Date().toISOString(),
        nodes,
        edges,
      },
    };
  }

  private assertPublishedNavigationClosure(places: any[], navigation?: any) {
    const navigablePlaces = (Array.isArray(places) ? places : []).filter((place: any) =>
      place?.navigable === true
      && ['open', 'limited'].includes(String(place.serviceStatus || '')));
    const disconnectedPlace = navigablePlaces.find((place: any) =>
      !Array.isArray(place.entranceNodeIds) || place.entranceNodeIds.length === 0);
    if (disconnectedPlace) {
      throw new BadRequestException(
        `地点“${disconnectedPlace.title || disconnectedPlace.officialName || disconnectedPlace.id}”已开启导航，但没有可连接到已审核校园路线的开放入口`,
      );
    }

    const graph = this.asRecord(this.asRecord(navigation)?.graph);
    const nodes = this.asRecord(graph?.nodes) || {};
    const edges = (Array.isArray(graph?.edges) ? graph.edges : []).filter((edge: any) =>
      edge?.public === true
      && edge?.verificationStatus === 'verified'
      && edge?.pedestrian !== false
      && edge?.closed !== true
      && edge?.construction !== true
      && nodes[String(edge?.a || '')]
      && nodes[String(edge?.b || '')]);
    const referencedNodeIds = new Set<string>();
    const adjacency = new Map<string, Set<string>>();
    edges.forEach((edge: any) => {
      const a = String(edge.a);
      const b = String(edge.b);
      referencedNodeIds.add(a);
      referencedNodeIds.add(b);
      if (!adjacency.has(a)) adjacency.set(a, new Set());
      if (!adjacency.has(b)) adjacency.set(b, new Set());
      adjacency.get(a)!.add(b);
      adjacency.get(b)!.add(a);
    });
    const unlinkedEntrancePlace = navigablePlaces.find((place: any) =>
      place.entranceNodeIds.some((nodeId: unknown) => !referencedNodeIds.has(String(nodeId))));
    if (unlinkedEntrancePlace) {
      throw new BadRequestException(
        `地点“${unlinkedEntrancePlace.title || unlinkedEntrancePlace.officialName || unlinkedEntrancePlace.id}”的开放入口不在已审核校园导航图中`,
      );
    }
    if (referencedNodeIds.size <= 1) return;

    const visited = new Set<string>();
    const queue = [referencedNodeIds.values().next().value as string];
    while (queue.length) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      (adjacency.get(nodeId) || new Set()).forEach((neighborId) => {
        if (!visited.has(neighborId)) queue.push(neighborId);
      });
    }
    if (visited.size !== referencedNodeIds.size) {
      throw new BadRequestException('已审核校园路线之间存在断点，请让骑手在路口分段补采并连接后再发布');
    }
  }

  private assertIllustratedNavigationCalibration(places: any[], navigation?: any) {
    const graph = this.asRecord(this.asRecord(navigation)?.graph);
    const hasPublicRoute = (Array.isArray(graph?.edges) ? graph.edges : []).some((edge: any) =>
      edge?.public === true
      && edge?.verificationStatus === 'verified'
      && edge?.pedestrian !== false
      && edge?.closed !== true
      && edge?.construction !== true);
    if (!hasPublicRoute) return;

    const [minX, minY, maxX, maxY] = ILLUSTRATED_ARTWORK_BOUNDS;
    const calibrationPoints = (Array.isArray(places) ? places : [])
      .filter((place: any) => this.isValidPublicCoordinate(place?.longitude, place?.latitude))
      .filter((place: any) => {
        const artworkX = Number(place?.artworkAnchorX);
        const artworkY = Number(place?.artworkAnchorY);
        const hasExplicitArtworkAnchor = Number.isFinite(artworkX)
          && Number.isFinite(artworkY)
          && artworkX > minX && artworkX < maxX
          && artworkY > minY && artworkY < maxY;
        const officialNumber = Number(place?.officialNumber);
        const hasBuiltInArtworkAnchor = Number.isInteger(officialNumber)
          && officialNumber >= ILLUSTRATED_ARTWORK_NUMBER_MIN
          && officialNumber <= ILLUSTRATED_ARTWORK_NUMBER_MAX;
        return hasExplicitArtworkAnchor || hasBuiltInArtworkAnchor;
      })
      .map((place: any) => ({
        longitude: Number(place.longitude),
        latitude: Number(place.latitude),
        // 这里复用完整的非共线判定；求解矩阵由 GCJ-02 坐标决定。
        mapX: Number(place.longitude),
        mapY: Number(place.latitude),
      }));

    if (calibrationPoints.length < 3 || !this.hasNonCollinearCalibration(calibrationPoints)) {
      throw new BadRequestException(
        '发布校园导航前至少需要 3 个分散的已发布地点，同时具备已核验 GCJ-02 坐标和矢量图锚点',
      );
    }
  }

  private publicPlaceSnapshots(value: any) {
    if (!Array.isArray(value)) return [];
    return value
      .filter((place) => place && typeof place === 'object'
        && place.publishStatus === 'published'
        && place.visibilityScope === 'phase1_active')
      .map((place) => ({
        id: String(place.id || ''),
        officialNumber: Number(place.officialNumber),
        officialName: String(place.officialName || place.title || ''),
        title: String(place.title || place.officialName || ''),
        semanticType: String(place.semanticType || 'building'),
        constructionStatus: String(place.constructionStatus || 'built'),
        serviceStatus: String(place.serviceStatus || 'unknown'),
        publishStatus: 'published',
        visibilityScope: String(place.visibilityScope || 'phase1_active'),
        unavailableMessage: String(place.serviceStatus || 'unknown') === 'open'
          ? '' : String(place.unavailableMessage || '').trim().slice(0, 120),
        searchable: place.searchable === true,
        navigable: place.navigable === true,
        entranceNodeIds: Array.isArray(place.entranceNodeIds)
          ? place.entranceNodeIds.map(String).filter(Boolean)
          : [],
        geometryStatus: String(place.geometryStatus || 'unmatched'),
        artworkFeatureKey: place.artworkFeatureKey || null,
        artworkAnchorX: this.optionalSnapshotNumber(place.artworkAnchorX),
        artworkAnchorY: this.optionalSnapshotNumber(place.artworkAnchorY),
        longitude: this.optionalSnapshotNumber(place.longitude),
        latitude: this.optionalSnapshotNumber(place.latitude),
        coordinateStatus: String(place.coordinateStatus || 'uncollected'),
        geoReviewStatus: String(place.coordinateStatus || 'uncollected'),
        address: String(place.address || place.formattedAddress || ''),
        formattedAddress: String(place.formattedAddress || place.address || ''),
        description: String(place.description || ''),
        coverPhotoUrl: String(place.coverPhotoUrl || ''),
        publicPhotos: Array.isArray(place.publicPhotos)
          ? place.publicPhotos.map(String).filter(Boolean)
          : Array.isArray(place.media) ? place.media.map((item: any) => String(item?.url || '')).filter(Boolean) : [],
        media: Array.isArray(place.media) ? place.media.map((item: any) => ({
          id: String(item.id || ''),
          mediaType: String(item.mediaType || 'gallery'),
          kind: String(item.kind || item.mediaType || 'gallery'),
          url: String(item.url || ''),
          mimeType: item.mimeType ? String(item.mimeType) : null,
          sortOrder: Number(item.sortOrder) || 0,
        })).filter((item: any) => item.url) : [],
        entrances: Array.isArray(place.entrances) ? place.entrances
          .map((entrance: any) => ({
            id: String(entrance?.id || ''),
            name: String(entrance?.name || ''),
            longitude: this.optionalSnapshotNumber(entrance?.longitude),
            latitude: this.optionalSnapshotNumber(entrance?.latitude),
            coordinateType: 'gcj02',
            serviceStatus: VALID_SERVICE_STATUS.includes(entrance?.serviceStatus)
              ? entrance.serviceStatus : 'unknown',
            isPrimary: entrance?.isPrimary === true,
            address: String(entrance?.address || entrance?.addressDescription || ''),
            nodeId: entrance?.nodeId ? String(entrance.nodeId) : null,
          }))
          .filter((entrance: any) => entrance.name
            && this.isValidPublicCoordinate(entrance.longitude, entrance.latitude))
          : [],
      }));
  }

  private projectIdentity(dto: Record<string, any>) {
    const officialNumber = Number(dto.officialNumber);
    if (!Number.isInteger(officialNumber) || officialNumber < 1 || officialNumber > 99) {
      throw new BadRequestException('officialNumber 必须是 1-99 的整数');
    }
    const officialName = String(dto.officialName || '').trim();
    if (!officialName) throw new BadRequestException('officialNumber 缺少正式名称');
    return { officialNumber, officialName };
  }

  private projectMutationData(
    dto: Record<string, any>,
    regionId: string,
    mapId: string | null,
    officialNumber: number,
    officialName: string,
    adminId?: string,
  ) {
    const serviceStatus = VALID_SERVICE_STATUS.includes(dto.serviceStatus) ? dto.serviceStatus : 'unknown';
    const unavailableMessage = String(dto.unavailableMessage || '').trim().slice(0, 120) || null;
    const publishStatus = VALID_PUBLISH_STATUS.includes(dto.publishStatus) ? dto.publishStatus : 'draft';
    const navigable = Boolean(dto.navigable);
    this.assertStablePlaceAvailability({
      officialName,
      serviceStatus,
      unavailableMessage,
      navigable,
    }, publishStatus === 'published');
    return {
      regionId,
      mapId,
      officialName,
      displayName: String(dto.displayName || '').trim() || null,
      engineeringAlias: String(dto.engineeringAlias || '').trim(),
      phase: dto.phase === 'future' ? 'future' : 'phase1',
      constructionStatus: VALID_CONSTRUCTION_STATUS.includes(dto.constructionStatus)
        ? dto.constructionStatus : 'built',
      serviceStatus,
      unavailableMessage,
      publishStatus,
      visibilityScope: VALID_VISIBILITY_SCOPE.includes(dto.visibilityScope)
        ? dto.visibilityScope : 'phase1_review',
      semanticType: String(dto.semanticType || 'building').trim(),
      searchable: Boolean(dto.searchable),
      navigable,
      geometryStatus: VALID_GEOMETRY_STATUS.includes(dto.geometryStatus)
        ? dto.geometryStatus : 'unmatched',
      sourceConfidence: VALID_SOURCE_CONFIDENCE.includes(dto.sourceConfidence)
        ? dto.sourceConfidence : 'official_signage_only',
      artworkFeatureKey: String(dto.artworkFeatureKey || '').trim() || null,
      artworkAnchorX: this.optionalFiniteNumber(dto.artworkAnchorX),
      artworkAnchorY: this.optionalFiniteNumber(dto.artworkAnchorY),
      artworkGeometry: this.asRecord(dto.artworkGeometry) || undefined,
      longitude: this.optionalFiniteNumber(dto.longitude),
      latitude: this.optionalFiniteNumber(dto.latitude),
      coordinateType: 'gcj02',
      coordinateStatus: VALID_COORDINATE_STATUS.includes(dto.coordinateStatus) ? dto.coordinateStatus : 'uncollected',
      coordinateSource: String(dto.coordinateSource || '').trim() || null,
      coordinateAccuracy: this.optionalFiniteNumber(dto.coordinateAccuracy),
      coordinateCollectedAt: this.optionalDate(dto.coordinateCollectedAt),
      addressDescription: String(dto.addressDescription || '').trim() || null,
      addressCandidate: String(dto.addressCandidate || '').trim() || null,
      description: String(dto.description || '').trim() || null,
      coverUrl: String(dto.coverUrl || '').trim() || null,
      photos: Array.isArray(dto.photos) ? dto.photos : [],
      notes: dto.notes ? String(dto.notes) : null,
      sortOrder: Number.isInteger(Number(dto.sortOrder)) ? Number(dto.sortOrder) : officialNumber,
      updatedBy: adminId,
    };
  }

  private assertStablePlaceAvailability(place: Record<string, any>, requireUnavailableMessage: boolean) {
    const title = String(place.displayName || place.officialName || '未命名地点').trim();
    const serviceStatus = VALID_SERVICE_STATUS.includes(place.serviceStatus)
      ? String(place.serviceStatus)
      : 'unknown';
    const unavailableMessage = String(place.unavailableMessage || '').trim();
    if (['unopened', 'temporarily_closed', 'closed'].includes(serviceStatus) && place.navigable === true) {
      throw new BadRequestException(`地点“${title}”当前状态不能开启导航`);
    }
    if (requireUnavailableMessage && serviceStatus !== 'open' && !unavailableMessage) {
      throw new BadRequestException(`地点“${title}”不是“已开放”状态时必须填写用户端不可用说明`);
    }
  }

  private async repairRegionCatalogIntegrity(tx: any, regionId: string, mapId: string) {
    const projects = await tx.campusMapProject.findMany({
      where: { regionId },
      select: { id: true, mapId: true, artworkFeatureKey: true },
    });
    const unboundProjects = projects.filter((project: any) => !project.mapId);
    if (unboundProjects.length) {
      const featureKeyCounts = new Map<string, number>();
      const alreadyBoundKeys = new Set<string>();
      for (const project of projects) {
        const key = String(project.artworkFeatureKey || '').trim();
        if (!key) continue;
        featureKeyCounts.set(key, (featureKeyCounts.get(key) || 0) + 1);
        if (project.mapId === mapId) alreadyBoundKeys.add(key);
      }
      const bindableIds = unboundProjects
        .filter((project: any) => {
          const key = String(project.artworkFeatureKey || '').trim();
          return !key || (featureKeyCounts.get(key) === 1 && !alreadyBoundKeys.has(key));
        })
        .map((project: any) => String(project.id));
      if (bindableIds.length) {
        await tx.campusMapProject.updateMany({
          where: { id: { in: bindableIds }, regionId, mapId: null },
          data: { mapId },
        });
        const bindable = new Set(bindableIds);
        for (const project of projects) {
          if (bindable.has(String(project.id))) project.mapId = mapId;
        }
      }
    }

    const taskRepository = tx.campusMapCollectionTask;
    const linkRepository = tx.campusMapCollectionTaskPlace;
    if (!taskRepository?.findMany || !linkRepository?.createMany) return;
    const tasks = await taskRepository.findMany({
      where: { regionId },
      select: {
        id: true,
        targetPlaceIds: true,
        placeLinks: { select: { placeId: true } },
      },
    });
    if (!tasks.length) return;

    const byId = new Map<string, string>(
      projects.map((project: any) => [String(project.id), String(project.id)] as [string, string]),
    );
    const byFeatureKey = new Map<string, string | null>();
    for (const project of projects) {
      const key = String(project.artworkFeatureKey || '').trim();
      if (!key) continue;
      byFeatureKey.set(key, byFeatureKey.has(key) ? null : String(project.id));
    }
    const newLinks: Array<{ taskId: string; placeId: string; sortOrder: number }> = [];
    for (const task of tasks) {
      const existingIds = new Set(
        (Array.isArray(task.placeLinks) ? task.placeLinks : []).map((link: any) => String(link.placeId)),
      );
      const targetIds = Array.isArray(task.targetPlaceIds)
        ? task.targetPlaceIds.map(String).map((value: string) => value.trim()).filter(Boolean)
        : [];
      targetIds.forEach((targetId: string, sortOrder: number) => {
        // 稳定地点 ID 优先；只在 artworkFeatureKey 在该区域内唯一时才回填。
        const placeId: string | null | undefined = byId.get(targetId) || byFeatureKey.get(targetId);
        if (!placeId || existingIds.has(placeId)) return;
        existingIds.add(placeId);
        newLinks.push({ taskId: String(task.id), placeId, sortOrder });
      });
    }
    if (newLinks.length) {
      await linkRepository.createMany({ data: newLinks, skipDuplicates: true });
    }
  }

  private async syncBoundProjectFeatures(
    tx: any,
    regionId: string,
    mapId: string,
    manifest: Record<string, any>,
    adminId?: string,
  ) {
    const repository = tx.campusMapProject;
    if (!repository?.findMany || !repository?.update) return;
    const coordinateType = String(this.asRecord(manifest.coordinateSystem)?.type || '').trim().toLowerCase();
    // artworkAnchor/Geometry 永远是画师 SVG 的像素坐标，不是 GCJ-02 经纬度。
    // 高德清单只同步地点状态和真实地址；绝不能把 [108.x, 30.x] 写进 SVG 锚点。
    const carriesArtworkGeometry = !['amap', 'gcj02', 'wgs84', 'bd09'].includes(coordinateType);
    const bindings = this.inlineFeatures(manifest)
      .map((feature: any) => {
        const properties = this.asRecord(feature?.properties) || {};
        const placeId = String(properties.placeId || '').trim();
        const featureKey = String(properties.artworkFeatureKey || properties.id || feature?.id || '').trim();
        const geometry = this.asRecord(feature?.geometry);
        if (!placeId || !featureKey || !geometry) return null;
        const type = String(geometry.type || '');
        const point = type === 'Point' && Array.isArray(geometry.coordinates)
          ? geometry.coordinates.map(Number)
          : null;
        const ring = type === 'Polygon' && Array.isArray(geometry.coordinates?.[0])
          ? geometry.coordinates[0].map((pair: any) => Array.isArray(pair) ? pair.map(Number) : []).filter((pair: number[]) => pair.length >= 2 && pair.every(Number.isFinite))
          : [];
        const anchor = point && point.length >= 2 && point.every(Number.isFinite)
          ? point.slice(0, 2)
          : ring.length >= 3
            ? ring.slice(0, -1).reduce((sum: number[], pair: number[]) => [sum[0] + pair[0], sum[1] + pair[1]], [0, 0])
              .map((value: number) => value / Math.max(1, ring.length - 1))
            : null;
        if (!anchor) return null;
        return { placeId, featureKey, geometry, type, anchor, properties };
      })
      .filter(Boolean) as Array<Record<string, any>>;
    if (!bindings.length) return;

    const duplicate = bindings.find((binding, index) =>
      bindings.findIndex((candidate) => candidate.placeId === binding.placeId) !== index);
    if (duplicate) {
      throw new BadRequestException(`地点 ${duplicate.placeId} 同时绑定了多个地图图形，请只保留一个`);
    }
    const projects = await repository.findMany({
      where: { regionId, id: { in: bindings.map((binding) => binding.placeId) } },
      select: { id: true, officialNumber: true },
    });
    const byId = new Map<string, any>(projects.map((project: any) => [String(project.id), project]));
    for (const binding of bindings) {
      const project = byId.get(binding.placeId);
      if (!project) throw new BadRequestException(`地图图形绑定的地点档案不存在：${binding.placeId}`);
      const properties = binding.properties;
      const officialNumber = Number(properties.officialNumber);
      if (Number.isInteger(officialNumber) && officialNumber !== Number(project.officialNumber)) {
        throw new BadRequestException(`地点 ${binding.placeId} 的编号与地图图形不一致`);
      }
      const data: Record<string, any> = { mapId, updatedBy: adminId };
      if (carriesArtworkGeometry) {
        Object.assign(data, {
          artworkFeatureKey: binding.featureKey,
          artworkAnchorX: binding.anchor[0],
          artworkAnchorY: binding.anchor[1],
          artworkGeometry: binding.geometry,
          geometryStatus: binding.type === 'Polygon' ? 'verified_polygon' : 'verified_point',
          sourceConfidence: 'official_signage_and_cad',
        });
      }
      if (VALID_CONSTRUCTION_STATUS.includes(properties.constructionStatus)) data.constructionStatus = properties.constructionStatus;
      if (VALID_SERVICE_STATUS.includes(properties.serviceStatus)) data.serviceStatus = properties.serviceStatus;
      if (VALID_PUBLISH_STATUS.includes(properties.publishStatus)) data.publishStatus = properties.publishStatus;
      if (VALID_VISIBILITY_SCOPE.includes(properties.visibilityScope)) data.visibilityScope = properties.visibilityScope;
      if (typeof properties.searchable === 'boolean') data.searchable = properties.searchable;
      if (typeof properties.navigable === 'boolean') data.navigable = properties.navigable;
      if (String(properties.semanticType || '').trim()) data.semanticType = String(properties.semanticType).trim();
      if (properties.unavailableMessage !== undefined) data.unavailableMessage = String(properties.unavailableMessage || '').trim() || null;
      if (properties.addressDescription !== undefined || properties.address !== undefined) {
        data.addressDescription = String(properties.addressDescription || properties.address || '').trim() || null;
      }
      await repository.update({ where: { id: binding.placeId }, data });
    }
  }

  private optionalSnapshotNumber(value: unknown) {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  private isValidPublicCoordinate(longitude: unknown, latitude: unknown) {
    const lng = Number(longitude);
    const lat = Number(latitude);
    return Number.isFinite(lng) && lng >= -180 && lng <= 180
      && Number.isFinite(lat) && lat >= -90 && lat <= 90
      && !(lng === 0 && lat === 0);
  }

  private canonicalize(value: any): any {
    if (Array.isArray(value)) return value.map((item) => this.canonicalize(item));
    const record = this.asRecord(value);
    if (!record) return value;
    return Object.keys(record)
      .sort()
      .reduce((result, key) => {
        result[key] = this.canonicalize(record[key]);
        return result;
      }, {} as Record<string, any>);
  }

  private configKey(regionId: string) {
    return `campus_map_active_${this.normalizeRegionId(regionId)}`;
  }

  private isUniqueConflict(error: any) {
    return error?.code === 'P2002';
  }

  private normalizeRegionId(regionId?: string) {
    const value = String(regionId || '').trim();
    return value || GLOBAL_REGION_ID;
  }

  private requireWriteRegionId(regionId?: unknown) {
    const value = String(regionId || '').trim();
    if (!value) throw new BadRequestException('regionId 必填，禁止将校园地点写入 global');
    return value;
  }

  private optionalFiniteNumber(value: unknown) {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    if (!Number.isFinite(number)) throw new BadRequestException('数值字段格式无效');
    return number;
  }

  private optionalDate(value: unknown) {
    if (value === undefined || value === null || value === '') return null;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new BadRequestException('日期字段格式无效');
    return date;
  }

  private asRecord(value: any): Record<string, any> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value;
  }

  private normalizeLayers(value: any) {
    if (!Array.isArray(value)) return [];
    return value
      .map((layer, index) => {
        const item = this.asRecord(layer);
        if (!item) return null;
        const id = String(item.id || item.layerId || `layer_${index + 1}`).trim();
        const rawInlineData = this.asRecord(item.inlineData || item.data);
        const inlineData = rawInlineData && Array.isArray(rawInlineData.features)
          ? {
              ...rawInlineData,
              features: rawInlineData.features.map((feature: any) => {
                const featureRecord = this.asRecord(feature);
                if (!featureRecord) return feature;
                return {
                  ...featureRecord,
                  properties: normalizeCampusFeatureProperties(featureRecord.properties || {}),
                };
              }),
            }
          : item.inlineData || item.data || null;
        const url = String(item.url || item.href || '').trim();
        const load = String(item.load || (url ? 'url' : inlineData ? 'inline' : 'local')).trim();
        return this.compact({
          id,
          role: String(item.role || id).trim(),
          title: String(item.title || item.name || id).trim(),
          load,
          url,
          inlineData,
          enabled: item.enabled !== false,
          style: this.asRecord(item.style) || {},
          featureCount: Number.isFinite(Number(item.featureCount)) ? Number(item.featureCount) : undefined,
        });
      })
      .filter(Boolean);
  }

  private isAmapPayload(value: Record<string, any>) {
    const coordinateSystem = this.asRecord(value.coordinateSystem) || {};
    const amap = this.asRecord(value.amap || value.amapMeta || value.providerMeta) || {};
    return String(coordinateSystem.type || '').toLowerCase() === 'amap'
      || String(amap.provider || '').toLowerCase() === 'amap';
  }

  private countDrawableFeatures(layers: any[]) {
    return (Array.isArray(layers) ? layers : []).reduce((total, layer) => {
      const data = this.asRecord(layer?.inlineData || layer?.data);
      const features = Array.isArray(data?.features) ? data.features : [];
      return total + features.filter((feature) => this.isDrawableFeature(feature)).length;
    }, 0);
  }

  private isDrawableFeature(feature: any) {
    const geometry = this.asRecord(feature?.geometry);
    if (!geometry) return false;
    if (geometry.type === 'Point') {
      return this.isCoordinatePair(geometry.coordinates);
    }
    if (geometry.type === 'LineString') {
      return Array.isArray(geometry.coordinates)
        && geometry.coordinates.filter((point) => this.isCoordinatePair(point)).length >= 2;
    }
    if (geometry.type === 'Polygon') {
      const ring = Array.isArray(geometry.coordinates?.[0]) ? geometry.coordinates[0] : [];
      return ring.filter((point) => this.isCoordinatePair(point)).length >= 3;
    }
    return false;
  }

  private isCoordinatePair(value: any) {
    return Array.isArray(value)
      && value.length >= 2
      && Number.isFinite(Number(value[0]))
      && Number.isFinite(Number(value[1]));
  }

  private normalizeNumberTuple(value: any) {
    if (!Array.isArray(value) || value.length < 4) return undefined;
    const tuple = value.slice(0, 4).map((item) => Number(item));
    return tuple.every((item) => Number.isFinite(item)) ? tuple : undefined;
  }

  private normalizeCoordinatePair(value: any) {
    if (!Array.isArray(value) || value.length < 2) return undefined;
    const pair = value.slice(0, 2).map((item) => Number(item));
    return pair.every((item) => Number.isFinite(item)) ? pair : undefined;
  }

  private normalizeAmapSource(value: any) {
    const item = this.asRecord(value);
    if (!item) return undefined;
    const zoom = Number(item.zoom);
    return this.compact({
      enabled: item.enabled !== false,
      provider: String(item.provider || 'amap').trim(),
      coordinateType: String(item.coordinateType || item.source || 'gcj02').trim(),
      center: this.normalizeCoordinatePair(item.center),
      zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : undefined,
      city: String(item.city || item.defaultCity || '').trim() || undefined,
      bounds: this.normalizeNumberTuple(item.bounds || item.bbox),
    });
  }

  private normalizeStringArray(value: any) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  private normalizeImageMap(value: any) {
    const item = this.asRecord(value);
    if (!item) return undefined;
    const imageUrl = String(item.imageUrl || item.url || item.src || '').trim();
    if (!imageUrl) return undefined;
    const width = Number(item.width || item.naturalWidth || item.mapWidth || 1000);
    const height = Number(item.height || item.naturalHeight || item.mapHeight || 700);
    const opacity = Number(item.opacity);
    return this.compact({
      imageUrl,
      width: Number.isFinite(width) && width > 0 ? width : 1000,
      height: Number.isFinite(height) && height > 0 ? height : 700,
      opacity: Number.isFinite(opacity) ? opacity : undefined,
    });
  }

  private normalizePositioning(value: any) {
    const item = this.asRecord(value);
    if (!item) return undefined;
    const calibrationPoints: Array<Record<string, any>> = Array.isArray(item.calibrationPoints)
      ? item.calibrationPoints
        .map((point, index) => {
          const raw = this.asRecord(point);
          if (!raw) return null;
          const longitude = Number(raw.longitude || raw.lng);
          const latitude = Number(raw.latitude || raw.lat);
          const mapX = Number(raw.mapX ?? raw.x);
          const mapY = Number(raw.mapY ?? raw.y);
          if (![longitude, latitude, mapX, mapY].every((num) => Number.isFinite(num))) return null;
          return this.compact({
            id: String(raw.id || raw.key || `calibration_${index + 1}`).trim(),
            title: String(raw.title || raw.name || `校准点 ${index + 1}`).trim(),
            longitude,
            latitude,
            mapX,
            mapY,
          });
        })
        .filter((point): point is NonNullable<typeof point> => point !== null)
      : [];
    const projection = String(item.projection || item.mode || '').trim();
    return this.compact({
      enabled: item.enabled === true
        && (projection === 'amap-gcj02'
          || (calibrationPoints.length >= 3 && this.hasNonCollinearCalibration(calibrationPoints))),
      coordinateType: String(item.coordinateType || item.type || 'gcj02').trim(),
      projection: projection || undefined,
      permissionPurpose: String(item.permissionPurpose || item.purpose || '用于在校园地图中显示你所在的位置，并计算到目标地点的距离').trim(),
      accuracyRadius: Number.isFinite(Number(item.accuracyRadius)) ? Number(item.accuracyRadius) : undefined,
      calibrationPoints,
    });
  }

  private hasNonCollinearCalibration(points: Array<Record<string, any>>) {
    const nonCollinear = (xKey: string, yKey: string) => {
      for (let first = 0; first < points.length - 2; first += 1) {
        for (let second = first + 1; second < points.length - 1; second += 1) {
          for (let third = second + 1; third < points.length; third += 1) {
            const a = points[first];
            const b = points[second];
            const c = points[third];
            const twiceArea = (Number(b[xKey]) - Number(a[xKey])) * (Number(c[yKey]) - Number(a[yKey]))
              - (Number(c[xKey]) - Number(a[xKey])) * (Number(b[yKey]) - Number(a[yKey]));
            if (Number.isFinite(twiceArea) && Math.abs(twiceArea) > 1e-10) return true;
          }
        }
      }
      return false;
    };
    return nonCollinear('mapX', 'mapY') && nonCollinear('longitude', 'latitude');
  }

  private compact<T extends Record<string, any>>(value: T): T {
    Object.keys(value).forEach((key) => {
      if (value[key] === undefined) delete value[key];
    });
    return value;
  }
}
