import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CampusMapService } from './campus-map.service';

describe('CampusMapService', () => {
  const createPrisma = () => ({
    config: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    campusMap: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    campusMapDraft: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    campusMapVersion: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  });

  const makeTransactional = () => {
    const prisma = createPrisma();
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
    return prisma;
  };

  const prepareCompatibilityPublish = (manifest: Record<string, any>) => {
    const prisma = makeTransactional();
    prisma.campusMap.upsert.mockResolvedValue({ id: 'map-1', regionId: 'region-1' });
    prisma.campusMapDraft.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'draft-1', mapId: 'map-1', revision: 1, manifest });
    prisma.campusMapDraft.create.mockResolvedValue({ id: 'draft-1', mapId: 'map-1', revision: 1 });
    prisma.campusMap.findUnique.mockResolvedValue({ id: 'map-1', regionId: 'region-1', versionCounter: 0 });
    prisma.campusMap.update
      .mockResolvedValueOnce({ id: 'map-1', versionCounter: 1 })
      .mockResolvedValueOnce({ id: 'map-1', enabled: true, activeVersionId: 'version-1' });
    prisma.campusMapVersion.create.mockResolvedValue({ id: 'version-1', version: 1 });
    prisma.campusMapDraft.update.mockResolvedValue({});
    prisma.campusMapDraft.updateMany.mockResolvedValue({ count: 1 });
    return prisma;
  };

  it('prefers the immutable active version over the legacy Config row', async () => {
    const prisma = createPrisma();
    prisma.campusMap.findUnique.mockResolvedValue({
      id: 'map-1',
      regionId: 'region-1',
      enabled: true,
      activeVersionId: 'version-3',
      activeVersion: {
        id: 'version-3',
        version: 3,
        manifest: {
          enabled: true,
          mapId: 'versioned-campus',
          layers: [{ id: 'pois', inlineData: { type: 'FeatureCollection', features: [] } }],
        },
      },
    });

    const service = new CampusMapService(prisma as any);
    const result = await service.getActiveMap('region-1');

    expect(result).toMatchObject({
      enabled: true,
      mapId: 'versioned-campus',
      workflow: { activeVersion: 3, activeVersionId: 'version-3' },
    });
    expect(prisma.config.findUnique).not.toHaveBeenCalled();
  });

  it('rejects saving a stale draft revision instead of overwriting it', async () => {
    const prisma = makeTransactional();
    prisma.campusMap.upsert.mockResolvedValue({ id: 'map-1', regionId: 'region-1' });
    prisma.campusMapDraft.findUnique.mockResolvedValue({ id: 'draft-1', mapId: 'map-1', revision: 2 });
    prisma.campusMapDraft.updateMany.mockResolvedValue({ count: 0 });
    const service = new CampusMapService(prisma as any);

    expect(typeof (service as any).saveDraft).toBe('function');
    await expect((service as any).saveDraft('region-1', {
      enabled: true,
      mapId: 'campus-map',
      layers: [{ id: 'pois', url: 'https://cdn.example.com/pois.geojson' }],
    }, 'admin-1', 2)).rejects.toThrow('草稿已被其他管理员更新');
  });

  it('translates a concurrent first-draft unique conflict into 409', async () => {
    const prisma = makeTransactional();
    prisma.campusMap.upsert.mockResolvedValue({ id: 'map-1', regionId: 'region-1' });
    prisma.campusMapDraft.findUnique.mockResolvedValue(null);
    prisma.campusMapDraft.create.mockRejectedValue({ code: 'P2002', meta: { target: ['mapId'] } });
    const service = new CampusMapService(prisma as any);

    await expect(service.saveDraft('region-1', {
      enabled: true,
      mapId: 'campus-map',
      layers: [{ id: 'pois', url: 'https://cdn.example.com/pois.geojson' }],
    }, 'admin-1', 0)).rejects.toBeInstanceOf(ConflictException);
  });

  it('publishes a draft as an immutable version in one transaction', async () => {
    const prisma = makeTransactional();
    prisma.campusMap.findUnique.mockResolvedValue({ id: 'map-1', regionId: 'region-1', versionCounter: 0 });
    prisma.campusMapDraft.findUnique.mockResolvedValue({
      id: 'draft-1',
      mapId: 'map-1',
      revision: 3,
      manifest: {
        enabled: true,
        mapId: 'campus-map',
        layers: [{ id: 'pois', url: 'https://cdn.example.com/pois.geojson' }],
      },
    });
    prisma.campusMap.update
      .mockResolvedValueOnce({ id: 'map-1', versionCounter: 1 })
      .mockResolvedValueOnce({ id: 'map-1', enabled: true, activeVersionId: 'version-1' });
    prisma.campusMapVersion.create.mockResolvedValue({ id: 'version-1', version: 1 });
    prisma.campusMapDraft.updateMany.mockResolvedValue({ count: 1 });
    const service = new CampusMapService(prisma as any);

    expect(typeof (service as any).publishDraft).toBe('function');
    const result = await (service as any).publishDraft('region-1', 'admin-1', 3);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.campusMapVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ mapId: 'map-1', version: 1, publishedBy: 'admin-1' }),
    }));
    expect(result).toMatchObject({ enabled: true, workflow: { activeVersion: 1, activeVersionId: 'version-1' } });
  });

  it('aborts publishing when the draft changes after it was read', async () => {
    const prisma = makeTransactional();
    prisma.campusMap.findUnique.mockResolvedValue({ id: 'map-1', regionId: 'region-1', versionCounter: 0 });
    prisma.campusMapDraft.findUnique.mockResolvedValue({
      id: 'draft-1',
      mapId: 'map-1',
      revision: 3,
      manifest: {
        enabled: true,
        mapId: 'campus-map',
        layers: [{ id: 'pois', url: 'https://cdn.example.com/pois.geojson' }],
      },
    });
    prisma.campusMap.update
      .mockResolvedValueOnce({ id: 'map-1', versionCounter: 1 })
      .mockResolvedValueOnce({ id: 'map-1', enabled: true, activeVersionId: 'version-1' });
    prisma.campusMapVersion.create.mockResolvedValue({ id: 'version-1', version: 1 });
    prisma.campusMapDraft.updateMany.mockResolvedValue({ count: 0 });
    const service = new CampusMapService(prisma as any);

    await expect(service.publishDraft('region-1', 'admin-1', 3))
      .rejects.toThrow('草稿已被其他管理员更新');
  });

  it('rolls back by creating a new audited version', async () => {
    const prisma = makeTransactional();
    prisma.campusMap.findUnique.mockResolvedValue({ id: 'map-1', regionId: 'region-1', versionCounter: 1 });
    prisma.campusMapVersion.findFirst.mockResolvedValue({
      id: 'version-1',
      mapId: 'map-1',
      version: 1,
      manifest: {
        enabled: true,
        mapId: 'campus-map',
        layers: [{ id: 'pois', url: 'https://cdn.example.com/pois.geojson' }],
      },
    });
    prisma.campusMap.update
      .mockResolvedValueOnce({ id: 'map-1', versionCounter: 2 })
      .mockResolvedValueOnce({ id: 'map-1', enabled: true, activeVersionId: 'version-2' });
    prisma.campusMapVersion.create.mockResolvedValue({ id: 'version-2', version: 2 });
    prisma.campusMapDraft.findUnique.mockResolvedValue({ id: 'draft-1', revision: 3 });
    prisma.campusMapDraft.updateMany.mockResolvedValue({ count: 1 });
    const service = new CampusMapService(prisma as any);

    expect(typeof (service as any).rollbackVersion).toBe('function');
    const result = await (service as any).rollbackVersion('region-1', 'version-1', 'admin-1');

    expect(prisma.campusMapVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ version: 2, rollbackOfId: 'version-1' }),
    }));
    expect(result).toMatchObject({ workflow: { activeVersion: 2, rollbackOfId: 'version-1' } });
  });

  it('rolls back with the exact immutable target manifest', async () => {
    const prisma = makeTransactional();
    const targetManifest = {
      enabled: true,
      regionId: 'region-1',
      mapId: 'campus-map',
      updatedAt: '2026-07-01T00:00:00.000Z',
      layers: [{ id: 'pois', url: 'https://cdn.example.com/pois.geojson' }],
    };
    prisma.campusMap.findUnique.mockResolvedValue({ id: 'map-1', regionId: 'region-1', versionCounter: 1 });
    prisma.campusMapVersion.findFirst.mockResolvedValue({
      id: 'version-1', mapId: 'map-1', version: 1, manifest: targetManifest,
    });
    prisma.campusMap.update
      .mockResolvedValueOnce({ id: 'map-1', versionCounter: 2 })
      .mockResolvedValueOnce({ id: 'map-1', enabled: true, activeVersionId: 'version-2' });
    prisma.campusMapVersion.create.mockResolvedValue({ id: 'version-2', version: 2 });
    prisma.campusMapDraft.findUnique.mockResolvedValue({ id: 'draft-1', revision: 3 });
    prisma.campusMapDraft.updateMany.mockResolvedValue({ count: 1 });
    const service = new CampusMapService(prisma as any);

    await service.rollbackVersion('region-1', 'version-1', 'admin-1');

    const canonicalTarget = JSON.stringify({
      enabled: true,
      layers: [{ id: 'pois', url: 'https://cdn.example.com/pois.geojson' }],
      mapId: 'campus-map',
      regionId: 'region-1',
      updatedAt: '2026-07-01T00:00:00.000Z',
    });
    expect(prisma.campusMapVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        manifest: targetManifest,
        checksum: createHash('sha256').update(canonicalTarget).digest('hex'),
      }),
    }));
  });

  it('keeps the legacy PUT compatible while publishing an immutable version', async () => {
    const input = {
      enabled: true,
      title: '校园地图',
      mapId: 'demo-campus',
      layers: [{ id: 'boundary', url: 'https://cdn.example.com/boundary.geojson' }],
    };
    const prisma = prepareCompatibilityPublish(input);

    const service = new CampusMapService(prisma as any);
    const result = await service.upsertRegionMap('region-1', input);

    expect(prisma.campusMapDraft.create).toHaveBeenCalledTimes(1);
    expect(prisma.campusMapVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ mapId: 'map-1', version: 1 }),
    }));
    expect(prisma.config.upsert).not.toHaveBeenCalled();
    expect(result.enabled).toBe(true);
    expect(result.regionId).toBe('region-1');
    expect(result.layers).toHaveLength(1);
  });

  it('uses the region map before the global fallback', async () => {
    const prisma = createPrisma();
    prisma.config.findUnique.mockImplementation(({ where }) => {
      if (where.key === 'campus_map_active_region-2') {
        return Promise.resolve({
          value: {
            enabled: true,
            regionId: 'region-2',
            mapId: 'region-map',
            layers: [{ id: 'buildings', inlineData: { type: 'FeatureCollection', features: [] } }],
          },
          isEnabled: true,
          updatedAt: new Date('2026-06-29T00:00:00.000Z'),
        });
      }
      if (where.key === 'campus_map_active_global') {
        return Promise.resolve({
          value: {
            enabled: true,
            regionId: 'global',
            mapId: 'global-map',
            layers: [{ id: 'boundary', inlineData: { type: 'FeatureCollection', features: [] } }],
          },
          isEnabled: true,
          updatedAt: new Date('2026-06-29T00:00:00.000Z'),
        });
      }
      return Promise.resolve(null);
    });

    const service = new CampusMapService(prisma as any);
    const result = await service.getActiveMap('region-2');

    expect(result.enabled).toBe(true);
    expect(result.mapId).toBe('region-map');
    expect(result.sourceRegionId).toBe('region-2');
  });

  it('falls back to the global published map when the region map is disabled', async () => {
    const prisma = createPrisma();
    prisma.campusMap.findUnique.mockImplementation(({ where }) => {
      if (where.regionId === 'region-disabled') {
        return Promise.resolve({
          id: 'map-disabled',
          regionId: 'region-disabled',
          enabled: false,
          activeVersionId: 'version-disabled',
          activeVersion: {
            id: 'version-disabled',
            version: 2,
            publishedAt: new Date('2026-07-28T00:00:00.000Z'),
            manifest: {
              enabled: true,
              mapId: 'old-region-map',
              layers: [{ id: 'operator_pois', inlineData: { type: 'FeatureCollection', features: [] } }],
            },
          },
        });
      }
      if (where.regionId === 'global') {
        return Promise.resolve({
          id: 'map-global',
          regionId: 'global',
          enabled: true,
          activeVersionId: 'version-global',
          activeVersion: {
            id: 'version-global',
            version: 5,
            publishedAt: new Date('2026-07-29T00:00:00.000Z'),
            manifest: {
              enabled: true,
              mapId: 'global-map',
              layers: [{ id: 'operator_pois', inlineData: { type: 'FeatureCollection', features: [] } }],
            },
          },
        });
      }
      return Promise.resolve(null);
    });

    const service = new CampusMapService(prisma as any);
    const result = await service.getActiveMap('region-disabled');

    expect(result).toMatchObject({
      enabled: true,
      mapId: 'global-map',
      regionId: 'region-disabled',
      sourceRegionId: 'global',
      workflow: { activeVersion: 5, activeVersionId: 'version-global' },
    });
  });

  it('returns disabled when no region or global map is configured', async () => {
    const prisma = createPrisma();
    prisma.config.findUnique.mockResolvedValue(null);

    const service = new CampusMapService(prisma as any);
    const result = await service.getActiveMap('missing-region');

    expect(result).toMatchObject({
      enabled: false,
      reason: 'not_configured',
      regionId: 'missing-region',
      layers: [],
    });
  });

  it('rejects enabled maps without drawable layers', async () => {
    const prisma = createPrisma();
    const service = new CampusMapService(prisma as any);

    await expect(service.upsertRegionMap('region-1', {
      enabled: true,
      mapId: 'empty-map',
      layers: [],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps operator-friendly image map metadata in the published manifest', async () => {
    const input = {
      enabled: true,
      title: '校园地图',
      mapId: 'visual-map',
      imageMap: {
        imageUrl: 'https://cdn.example.com/campus.png',
        width: 1200,
        height: 800,
      },
      layers: [{
        id: 'operator_pois',
        role: 'poi',
        inlineData: { type: 'FeatureCollection', features: [] },
      }],
    };
    const prisma = prepareCompatibilityPublish(input);
    const service = new CampusMapService(prisma as any);
    const result = await service.upsertRegionMap('region-1', input);

    expect(result.imageMap).toEqual({
      imageUrl: 'https://cdn.example.com/campus.png',
      width: 1200,
      height: 800,
    });
  });

  it('publishes a pure image map without placeholder vector layers', async () => {
    const input = {
      enabled: true,
      title: '校园图片地图',
      mapId: 'pure-image-map',
      imageMap: {
        imageUrl: 'https://cdn.example.com/campus.png',
        width: 1200,
        height: 800,
      },
      layers: [],
    };
    const prisma = prepareCompatibilityPublish(input);
    const service = new CampusMapService(prisma as any);

    const result = await service.upsertRegionMap('region-1', input);

    expect(result).toMatchObject({
      enabled: true,
      imageMap: { imageUrl: 'https://cdn.example.com/campus.png' },
      layers: [],
    });
  });

  it('publishes positioning authorization and calibration points for user location projection', async () => {
    const input = {
      enabled: true,
      title: '校园地图',
      mapId: 'positioning-map',
      positioning: {
        enabled: true,
        coordinateType: 'gcj02',
        permissionPurpose: '用于在校园地图中显示你所在的位置，并计算到目标地点的距离',
        calibrationPoints: [
          {
            id: 'gate-east',
            title: '东门',
            longitude: 106.531111,
            latitude: 29.624222,
            mapX: 180,
            mapY: 620,
          },
          {
            id: 'library',
            title: '图书馆',
            longitude: 106.534333,
            latitude: 29.626444,
            mapX: 760,
            mapY: 240,
          },
        ],
      },
      layers: [{
        id: 'operator_pois',
        role: 'poi',
        inlineData: { type: 'FeatureCollection', features: [] },
      }],
    };
    const prisma = prepareCompatibilityPublish(input);
    const service = new CampusMapService(prisma as any);
    const result = await service.upsertRegionMap('region-1', input);

    expect(result.positioning).toMatchObject({
      enabled: true,
      coordinateType: 'gcj02',
      permissionPurpose: '用于在校园地图中显示你所在的位置，并计算到目标地点的距离',
      calibrationPoints: [
        expect.objectContaining({ id: 'gate-east', mapX: 180, mapY: 620 }),
        expect.objectContaining({ id: 'library', mapX: 760, mapY: 240 }),
      ],
    });
  });

  it('preserves AMap drawing metadata while publishing neutral GCJ-02 geometry', async () => {
    const input = {
      enabled: true,
      title: '高德校园地图',
      mapId: 'amap-campus',
      coordinateSystem: {
        type: 'amap',
        source: 'gcj02',
        unit: 'degree',
      },
      amap: {
        enabled: true,
        provider: 'amap',
        coordinateType: 'gcj02',
        center: [106.531111, 29.624222],
        zoom: 17,
        city: '重庆',
        bounds: [106.52, 29.62, 106.54, 29.63],
      },
      layers: [{
        id: 'operator_pois',
        role: 'poi',
        inlineData: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: { title: '东门' },
            geometry: { type: 'Point', coordinates: [106.531111, 29.624222] },
          }],
        },
      }],
    };
    const prisma = prepareCompatibilityPublish(input);
    const service = new CampusMapService(prisma as any);
    const result = await service.upsertRegionMap('region-1', input);

    expect(result.coordinateSystem).toMatchObject({
      type: 'amap',
      source: 'gcj02',
      unit: 'degree',
    });
    expect(result.amap).toMatchObject({
      enabled: true,
      provider: 'amap',
      coordinateType: 'gcj02',
      center: [106.531111, 29.624222],
      zoom: 17,
    });
  });

  it('rejects enabled AMap maps without any drawable features', async () => {
    const prisma = createPrisma();
    const service = new CampusMapService(prisma as any);

    await expect(service.upsertRegionMap('region-1', {
      enabled: true,
      title: '空高德校园地图',
      mapId: 'empty-amap-campus',
      coordinateSystem: {
        type: 'amap',
        source: 'gcj02',
        unit: 'degree',
      },
      amap: {
        enabled: true,
        provider: 'amap',
        coordinateType: 'gcj02',
        center: [106.531111, 29.624222],
      },
      layers: [{
        id: 'operator_pois',
        role: 'poi',
        inlineData: { type: 'FeatureCollection', features: [] },
      }],
    })).rejects.toThrow('高德校园地图至少需要绘制 1 个有效点位、区域或路线');
  });
});
