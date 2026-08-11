import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/services/prisma.service';
import {
  CAMPUS_PROJECT_CATALOG,
  isPublicCampusProject,
  validateCampusProjectCollection,
} from './campus-map-project-catalog';
import {
  normalizeCampusAvailability,
  normalizeCampusFeatureProperties,
  validateCampusAvailabilityManifest,
} from './campus-map-availability';

const GLOBAL_REGION_ID = 'global';
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_LAYERS = 64;
const MAX_INLINE_FEATURES = 20_000;

@Injectable()
export class CampusMapService {
  constructor(private readonly prisma: PrismaService) {}

  getProjectCatalog() {
    return CAMPUS_PROJECT_CATALOG.map((item) => ({ ...item }));
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
      return this.toPublishedMap(regionMap, requestedRegionId, requestedRegionId);
    }

    if (requestedRegionId !== GLOBAL_REGION_ID) {
      const globalMap = await this.findPublishedMap(GLOBAL_REGION_ID);
      if (this.isPublishedMapEnabled(globalMap)) {
        return this.toPublishedMap(globalMap, requestedRegionId, GLOBAL_REGION_ID);
      }
    }

    if (regionMap) return this.disabledConfig(requestedRegionId, 'not_configured');
    return this.getLegacyActiveMap(requestedRegionId);
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
      const draft = await tx.campusMapDraft.findUnique({ where: { mapId: map.id } });
      if (!draft) throw new NotFoundException('校园地图草稿不存在');
      if (expectedRevision !== undefined && draft.revision !== Number(expectedRevision)) {
        throw new ConflictException('草稿已被其他管理员更新，请重新加载');
      }

      const manifest = this.asRecord(draft.manifest);
      if (!manifest) throw new BadRequestException('校园地图草稿内容无效');
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
    const draft = await this.saveDraft(regionId, dto, adminId);
    return this.publishDraft(regionId, adminId, draft.workflow?.draftRevision);
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
      const manifest = this.asRecord(target.manifest);
      if (!manifest) throw new BadRequestException('校园地图版本内容无效');
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
      positioning: this.normalizePositioning(raw.positioning || raw.locationProjection || raw.gpsCalibration),
      coordinateSystem: this.asRecord(raw.coordinateSystem) || {},
      amap: this.normalizeAmapSource(raw.amap || raw.amapMeta || raw.providerMeta),
      bbox,
      renderBBox,
      layers,
      recommendedInitialLayers: this.normalizeStringArray(raw.recommendedInitialLayers),
      recommendedRouteLayers: this.normalizeStringArray(raw.recommendedRouteLayers || raw.routeLayers),
      poiCandidateLayers: this.normalizeStringArray(raw.poiCandidateLayers),
      routeGraphUrl: String(raw.routeGraphUrl || '').trim(),
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
    const calibrationPoints = Array.isArray(item.calibrationPoints)
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
        .filter(Boolean)
      : [];
    const projection = String(item.projection || item.mode || '').trim();
    return this.compact({
      enabled: item.enabled === true && (calibrationPoints.length >= 2 || projection === 'amap-gcj02'),
      coordinateType: String(item.coordinateType || item.type || 'gcj02').trim(),
      projection: projection || undefined,
      permissionPurpose: String(item.permissionPurpose || item.purpose || '用于在校园地图中显示你所在的位置，并计算到目标地点的距离').trim(),
      accuracyRadius: Number.isFinite(Number(item.accuracyRadius)) ? Number(item.accuracyRadius) : undefined,
      calibrationPoints,
    });
  }

  private compact<T extends Record<string, any>>(value: T): T {
    Object.keys(value).forEach((key) => {
      if (value[key] === undefined) delete value[key];
    });
    return value;
  }
}
