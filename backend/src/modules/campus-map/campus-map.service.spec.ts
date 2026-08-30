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
      findMany: jest.fn(),
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
    campusMapProject: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      delete: jest.fn(),
    },
    campusMapPlaceEntrance: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
    },
    campusMapPlaceMedia: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    campusMapCollectionTask: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    campusMapCollectionTaskPlace: {
      createMany: jest.fn(),
    },
    campusMapCollectionObject: {
      findMany: jest.fn().mockResolvedValue([]),
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

  it('returns the requested school explanation without global fallback', async () => {
    const prisma = createPrisma();
    prisma.campusMap.findUnique.mockImplementation(({ where }: any) => where.regionId === 'school-1'
      ? Promise.resolve({
          enabled: true,
          regionId: 'school-1',
          activeVersion: {
            id: 'school-version-3',
            version: 3,
            manifest: {
              enabled: true,
              title: '测试大学',
              availability: {
                status: 'unopened',
                unavailableMessage: '地图资料校准中',
              },
              layers: [{
                id: 'buildings',
                inlineData: { type: 'FeatureCollection', features: [] },
              }],
            },
          },
        })
      : Promise.resolve({
          enabled: true,
          activeVersion: {
            id: 'global-version-1',
            version: 1,
            manifest: {
              enabled: true,
              title: '全局地图',
              layers: [{
                id: 'global-buildings',
                inlineData: { type: 'FeatureCollection', features: [] },
              }],
            },
          },
        }));

    const service = new CampusMapService(prisma as any);

    await expect(service.getActiveMap('school-1')).resolves.toEqual(expect.objectContaining({
      enabled: false,
      reason: 'school_unopened',
      sourceRegionId: 'school-1',
      title: '测试大学',
      availability: {
        status: 'unopened',
        unavailableMessage: '地图资料校准中',
      },
      layers: [],
    }));
    expect(prisma.campusMap.findUnique).toHaveBeenCalledTimes(1);
  });

  it('lists scoped published and draft availability statuses', async () => {
    const prisma = createPrisma();
    const where = { regionId: { in: ['school-1'] } };
    prisma.campusMap.findMany.mockResolvedValue([{
      regionId: 'school-1',
      enabled: true,
      activeVersion: {
        version: 3,
        manifest: {
          availability: {
            status: 'unopened',
            unavailableMessage: '地图资料校准中',
          },
        },
      },
      draft: {
        revision: 4,
        manifest: {
          availability: { status: 'open' },
        },
      },
    }]);

    const service = new CampusMapService(prisma as any);

    await expect(service.listAvailabilityStatuses(where)).resolves.toEqual([{
      regionId: 'school-1',
      configured: true,
      publishedStatus: 'unopened',
      draftStatus: 'open',
      unavailableMessage: '地图资料校准中',
      draftRevision: 4,
      activeVersion: 3,
    }]);
    expect(prisma.campusMap.findMany).toHaveBeenCalledWith({
      where,
      include: { activeVersion: true, draft: true },
      orderBy: { regionId: 'asc' },
    });
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

  it('reconciles route provenance again when publishing an existing draft', async () => {
    const prisma = makeTransactional();
    prisma.campusMap.findUnique.mockResolvedValue({ id: 'map-1', regionId: 'region-1', versionCounter: 0 });
    prisma.campusMapDraft.findUnique.mockResolvedValue({
      id: 'draft-1', mapId: 'map-1', revision: 2,
      manifest: {
        enabled: true,
        mapId: 'campus-map',
        coordinateSystem: { type: 'amap', source: 'gcj02', unit: 'degree' },
        layers: [{
          id: 'operator_routes',
          inlineData: {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: [[106.5, 29.6], [106.5002, 29.6]] },
              properties: {
                id: 'collection-route-spoofed', sourceObjectId: 'spoofed',
                collectionSource: 'rider_app_approved', verificationStatus: 'verified',
                sourceGeometryGcj02: { type: 'LineString', coordinates: [[106.5, 29.6], [106.5002, 29.6]] },
                title: '旧草稿伪造路线',
              },
            }],
          },
        }],
      },
    });
    prisma.campusMapCollectionObject.findMany.mockResolvedValue([]);
    prisma.campusMap.update
      .mockResolvedValueOnce({ id: 'map-1', versionCounter: 1 })
      .mockResolvedValueOnce({ id: 'map-1', enabled: true, activeVersionId: 'version-1' });
    prisma.campusMapVersion.create.mockResolvedValue({ id: 'version-1', version: 1 });
    prisma.campusMapDraft.updateMany.mockResolvedValue({ count: 1 });
    const service = new CampusMapService(prisma as any);

    await service.publishDraft('region-1', 'admin-1', 2);

    const published = prisma.campusMapVersion.create.mock.calls[0][0].data.manifest;
    expect(published.layers[0].inlineData.features[0].properties).toEqual({
      id: 'collection-route-spoofed', title: '旧草稿伪造路线',
    });
    expect(published.navigation).toBeNull();
  });

  it('rejects invalid availability before creating a published version', async () => {
    const prisma = makeTransactional();
    prisma.campusMap.findUnique.mockResolvedValue({
      id: 'map-1',
      regionId: 'region-1',
      versionCounter: 0,
    });
    prisma.campusMapDraft.findUnique.mockResolvedValue({
      id: 'draft-1',
      mapId: 'map-1',
      revision: 1,
      manifest: {
        enabled: true,
        mapId: 'campus-map',
        availability: { status: 'unopened', unavailableMessage: '' },
        layers: [{
          id: 'buildings',
          inlineData: {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              properties: {
                officialNumber: 3,
                officialName: '天枢楼',
                constructionStatus: 'built',
                visibilityScope: 'phase1_active',
                geometryStatus: 'verified_polygon',
                serviceStatus: 'unopened',
                unavailableMessage: '',
                navigable: true,
              },
              geometry: { type: 'Polygon', coordinates: [] },
            }],
          },
        }],
      },
    });
    const service = new CampusMapService(prisma as any);

    await expect(service.publishDraft('region-1')).rejects.toThrow('学校未开通时必须填写说明');
    expect(prisma.campusMap.update).not.toHaveBeenCalled();
    expect(prisma.campusMapVersion.create).not.toHaveBeenCalled();
  });

  it('normalizes school and building availability when saving a draft', async () => {
    const prisma = makeTransactional();
    prisma.campusMap.upsert.mockResolvedValue({ id: 'map-1', regionId: 'region-1' });
    prisma.campusMapDraft.findUnique.mockResolvedValue(null);
    prisma.campusMapDraft.create.mockResolvedValue({
      id: 'draft-1',
      mapId: 'map-1',
      revision: 1,
    });
    const service = new CampusMapService(prisma as any);

    await service.saveDraft('region-1', {
      enabled: true,
      mapId: 'campus-map',
      availability: { status: 'unopened', unavailableMessage: '  待学校确认  ' },
      layers: [{
        id: 'buildings',
        inlineData: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: {
              constructionStatus: 'built',
              visibilityScope: 'phase1_active',
              serviceStatus: 'unopened',
              unavailableMessage: '  暂未开放  ',
              searchable: false,
              navigable: true,
            },
            geometry: { type: 'Point', coordinates: [106, 29] },
          }],
        },
      }],
    }, 'admin-1', 0);

    expect(prisma.campusMapDraft.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        manifest: expect.objectContaining({
          availability: { status: 'unopened', unavailableMessage: '待学校确认' },
          layers: [expect.objectContaining({
            inlineData: expect.objectContaining({
              features: [expect.objectContaining({
                properties: expect.objectContaining({
                  serviceStatus: 'unopened',
                  unavailableMessage: '暂未开放',
                  searchable: true,
                  navigable: false,
                }),
              })],
            }),
          })],
        }),
      }),
    });
  });

  it('rejects publishing a future searchable feature', async () => {
    const prisma = makeTransactional();
    prisma.campusMap.findUnique.mockResolvedValue({ id: 'map-1', regionId: 'region-1', versionCounter: 0 });
    prisma.campusMapDraft.findUnique.mockResolvedValue({
      id: 'draft-1',
      mapId: 'map-1',
      revision: 1,
      manifest: {
        enabled: true,
        mapId: 'campus-map',
        layers: [{
          id: 'buildings',
          inlineData: {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              properties: {
                officialNumber: 15,
                officialName: '学生餐厅',
                constructionStatus: 'under_construction',
                visibilityScope: 'future_reference',
                searchable: true,
                navigable: false,
                geometryStatus: 'verified_polygon',
              },
              geometry: { type: 'Polygon', coordinates: [] },
            }],
          },
        }],
      },
    });
    const service = new CampusMapService(prisma as any);

    await expect(service.publishDraft('region-1')).rejects.toThrow('在建项目 15 不能开启搜索');
    expect(prisma.campusMap.update).not.toHaveBeenCalled();
    expect(prisma.campusMapVersion.create).not.toHaveBeenCalled();
  });

  it('removes review and future features from the active response', async () => {
    const prisma = createPrisma();
    prisma.campusMapProject.findMany.mockResolvedValue([
      { id: 'place-3', officialNumber: 3, artworkFeatureKey: null, media: [] },
      { id: 'place-16', officialNumber: 16, artworkFeatureKey: null, media: [] },
    ]);
    const projectFeature = (officialNumber: number, properties: Record<string, any>) => ({
      type: 'Feature',
      properties: { officialNumber, officialName: `项目 ${officialNumber}`, ...properties },
      geometry: { type: 'Point', coordinates: [106, 29] },
    });
    prisma.campusMap.findUnique.mockResolvedValue({
      id: 'map-1',
      regionId: 'region-1',
      enabled: true,
      activeVersionId: 'version-1',
      activeVersion: {
        id: 'version-1',
        version: 1,
        manifest: {
          enabled: true,
          mapId: 'campus-map',
          layers: [{
            id: 'buildings',
            featureCount: 5,
            inlineData: {
              type: 'FeatureCollection',
              features: [
                projectFeature(3, { constructionStatus: 'built', visibilityScope: 'phase1_active', geometryStatus: 'verified_polygon' }),
                projectFeature(4, { constructionStatus: 'built', visibilityScope: 'phase1_review', geometryStatus: 'unmatched' }),
                projectFeature(15, { constructionStatus: 'under_construction', visibilityScope: 'future_reference', geometryStatus: 'unmatched' }),
                projectFeature(16, {
                  constructionStatus: 'under_construction', visibilityScope: 'phase1_active',
                  geometryStatus: 'verified_polygon', publishStatus: 'published',
                }),
                projectFeature(17, {
                  constructionStatus: 'built', visibilityScope: 'phase1_active',
                  geometryStatus: 'verified_polygon', publishStatus: 'draft',
                }),
              ],
            },
          }],
        },
      },
    });
    const service = new CampusMapService(prisma as any);

    const result = await service.getActiveMap('region-1');
    const features = result.layers.flatMap((layer: any) => layer.inlineData?.features || []);

    expect(features.map((feature: any) => feature.properties.officialNumber)).toEqual([3, 16]);
    expect(result.layers[0].featureCount).toBe(2);
  });

  it('returns public artwork place metadata even when a place has no GCJ-02 geometry', async () => {
    const prisma = createPrisma();
    prisma.campusMapProject.findMany.mockResolvedValue([{
      id: 'place-2', officialNumber: 2, artworkFeatureKey: null, media: [],
    }]);
    prisma.campusMap.findUnique.mockResolvedValue({
      id: 'map-1',
      regionId: 'region-1',
      enabled: true,
      activeVersionId: 'version-1',
      activeVersion: {
        id: 'version-1',
        version: 1,
        manifest: {
          enabled: true,
          mapId: 'campus-map',
          placeCatalog: [{
            id: 'place-2', officialNumber: 2, officialName: '停车场', title: '停车场',
      constructionStatus: 'built', serviceStatus: 'open', publishStatus: 'published',
            visibilityScope: 'phase1_active', semanticType: 'parking', searchable: true,
            navigable: false, geometryStatus: 'point_only', coordinateStatus: 'uncollected',
            longitude: null, latitude: null, media: [],
          }, {
            id: 'place-future', officialNumber: 20, officialName: '运动场',
            constructionStatus: 'under_construction', serviceStatus: 'unopened', publishStatus: 'published',
            visibilityScope: 'future_reference', semanticType: 'sports', searchable: false,
            navigable: false, geometryStatus: 'verified_polygon', coordinateStatus: 'uncollected', media: [],
          }],
          layers: [{
            id: 'operator_pois',
            inlineData: { type: 'FeatureCollection', features: [] },
          }],
        },
      },
    });
    const service = new CampusMapService(prisma as any);

    const result: any = await service.getActiveMap('region-1');

    expect(result.publicPlaces).toEqual([expect.objectContaining({
      officialNumber: 2,
      officialName: '停车场',
      constructionStatus: 'built',
      visibilityScope: 'phase1_active',
    })]);
    expect(result.publicPlaces[0]).toMatchObject({ longitude: null, latitude: null });
    expect(result.publicPlaces[0]).not.toHaveProperty('engineeringAlias');
    expect(result.publicPlaces[0]).not.toHaveProperty('sourceConfidence');
    expect(prisma.campusMapProject.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ regionId: 'region-1', publishStatus: 'published' }),
    }));
  });

  it('revokes stale places, inline POIs and media from an old active snapshot', async () => {
    const prisma = createPrisma();
    prisma.campusMapProject.findMany.mockResolvedValue([{
      id: 'place-live', officialNumber: 7, artworkFeatureKey: 'feature-7',
      media: [{ id: 'media-approved', url: 'https://cdn.example/approved.jpg' }],
    }]);
    prisma.campusMap.findUnique.mockResolvedValue({
      id: 'map-1', regionId: 'region-1', enabled: true, activeVersionId: 'version-1',
      activeVersion: {
        id: 'version-1', version: 1,
        manifest: {
          enabled: true, mapId: 'campus-map',
          placeCatalog: [{
            id: 'place-live', officialNumber: 7, officialName: '人和楼', publishStatus: 'published',
            visibilityScope: 'phase1_active', constructionStatus: 'built', serviceStatus: 'open',
            media: [
              { id: 'media-approved', url: 'https://cdn.example/approved.jpg' },
              { id: 'media-revoked', url: 'https://cdn.example/revoked.jpg' },
            ],
            publicPhotos: ['https://cdn.example/approved.jpg', 'https://cdn.example/revoked.jpg'],
            coverPhotoUrl: 'https://cdn.example/revoked.jpg',
          }, {
            id: 'place-revoked', officialNumber: 8, officialName: '旧地点', publishStatus: 'published',
            visibilityScope: 'phase1_active', constructionStatus: 'built', serviceStatus: 'open', media: [],
          }],
          layers: [{
            id: 'operator_pois',
            inlineData: { type: 'FeatureCollection', features: [{
              type: 'Feature', geometry: { type: 'Point', coordinates: [100, 100] },
              properties: {
                id: 'place-live', officialNumber: 7, publishStatus: 'published',
                visibilityScope: 'phase1_active', geometryStatus: 'verified_point',
              },
            }, {
              type: 'Feature', geometry: { type: 'Point', coordinates: [200, 200] },
              properties: { id: 'place-revoked', officialNumber: 8, publishStatus: 'published' },
            }] },
          }],
        },
      },
    });
    const service = new CampusMapService(prisma as any);

    const result: any = await service.getActiveMap('region-1');

    expect(result.publicPlaces.map((place: any) => place.id)).toEqual(['place-live']);
    expect(result.publicPlaces[0].media.map((item: any) => item.id)).toEqual(['media-approved']);
    expect(result.publicPlaces[0].publicPhotos).toEqual(['https://cdn.example/approved.jpg']);
    expect(result.publicPlaces[0].coverPhotoUrl).toBe('');
    expect(result.layers[0].inlineData.features.map((feature: any) => feature.properties.officialNumber)).toEqual([7]);
  });

  it('keeps review and future features visible to authorized admin editing', async () => {
    const prisma = createPrisma();
    prisma.campusMap.findUnique.mockResolvedValue({
      id: 'map-1',
      regionId: 'region-1',
      enabled: true,
      draft: {
        revision: 2,
        manifest: {
          enabled: true,
          mapId: 'campus-map',
          layers: [{
            id: 'review',
            inlineData: {
              type: 'FeatureCollection',
              features: [{
                type: 'Feature',
                properties: { visibilityScope: 'phase1_review', geometryStatus: 'unmatched' },
                geometry: { type: 'Point', coordinates: [106, 29] },
              }],
            },
          }],
        },
      },
      activeVersion: null,
    });
    const service = new CampusMapService(prisma as any);

    const result = await service.getRegionMap('region-1');

    expect(result.layers[0].inlineData.features).toHaveLength(1);
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

  it('rolls back the historical snapshot after reapplying current publication rules', async () => {
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

    const republishedManifest = { ...targetManifest, navigation: null };
    const canonicalTarget = JSON.stringify({
      enabled: true,
      layers: [{ id: 'pois', url: 'https://cdn.example.com/pois.geojson' }],
      mapId: 'campus-map',
      navigation: null,
      regionId: 'region-1',
      updatedAt: '2026-07-01T00:00:00.000Z',
    });
    expect(prisma.campusMapVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        manifest: republishedManifest,
        checksum: createHash('sha256').update(canonicalTarget).digest('hex'),
      }),
    }));
  });

  it('does not reactivate a historical route whose approved source no longer exists', async () => {
    const prisma = makeTransactional();
    const targetManifest = {
      enabled: true,
      regionId: 'region-1',
      mapId: 'campus-map',
      coordinateSystem: { type: 'amap', source: 'gcj02', unit: 'degree' },
      layers: [{
        id: 'operator_routes',
        inlineData: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[106.5, 29.6], [106.5002, 29.6]] },
            properties: {
              id: 'collection-route-retired', sourceObjectId: 'retired',
              collectionSource: 'rider_app_approved', verificationStatus: 'verified',
              sourceGeometryGcj02: { type: 'LineString', coordinates: [[106.5, 29.6], [106.5002, 29.6]] },
            },
          }],
        },
      }],
      navigation: { graph: { nodes: { fake: { gcj02: [106.5, 29.6] } }, edges: [] } },
    };
    prisma.campusMap.findUnique.mockResolvedValue({ id: 'map-1', regionId: 'region-1', versionCounter: 1 });
    prisma.campusMapVersion.findFirst.mockResolvedValue({ id: 'version-1', mapId: 'map-1', manifest: targetManifest });
    prisma.campusMapCollectionObject.findMany.mockResolvedValue([]);
    prisma.campusMap.update
      .mockResolvedValueOnce({ id: 'map-1', versionCounter: 2 })
      .mockResolvedValueOnce({ id: 'map-1', enabled: true, activeVersionId: 'version-2' });
    prisma.campusMapVersion.create.mockResolvedValue({ id: 'version-2', version: 2 });
    prisma.campusMapDraft.findUnique.mockResolvedValue(null);
    prisma.campusMapDraft.create.mockResolvedValue({ id: 'draft-2', revision: 1 });
    const service = new CampusMapService(prisma as any);

    await service.rollbackVersion('region-1', 'version-1', 'admin-1');

    const republished = prisma.campusMapVersion.create.mock.calls[0][0].data.manifest;
    expect(republished.layers[0].inlineData.features[0].properties).toEqual({
      id: 'collection-route-retired',
    });
    expect(republished.navigation).toBeNull();
  });

  it.each([
    [
      'the historical project collection violates current catalog rules',
      {
        enabled: true,
        mapId: 'campus-map',
        layers: [{
          id: 'operator_pois',
          inlineData: {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              properties: { officialNumber: 7, officialName: '人和楼' },
              geometry: { type: 'Point', coordinates: [106.5, 29.6] },
            }, {
              type: 'Feature',
              properties: { officialNumber: 7, officialName: '人和楼重复项' },
              geometry: { type: 'Point', coordinates: [106.5001, 29.6001] },
            }],
          },
        }],
      },
      '重复官方编号 7',
    ],
    [
      'the historical school availability violates current publication rules',
      {
        enabled: true,
        mapId: 'campus-map',
        availability: { status: 'unopened', unavailableMessage: '' },
        layers: [],
      },
      '学校未开通时必须填写说明',
    ],
    [
      'a navigable historical place is not connected to the verified navigation graph',
      {
        enabled: true,
        mapId: 'campus-map',
        layers: [],
        placeCatalog: [{
          id: 'place-7',
          officialNumber: 7,
          officialName: '人和楼',
          title: '人和楼',
          constructionStatus: 'built',
          serviceStatus: 'open',
          publishStatus: 'published',
          visibilityScope: 'phase1_active',
          geometryStatus: 'verified_polygon',
          coordinateStatus: 'verified',
          searchable: true,
          navigable: true,
          entranceNodeIds: ['entrance-orphan'],
        }],
        navigation: null,
      },
      '开放入口不在已审核校园导航图中',
    ],
  ])('rejects rollback before activation when %s', async (_label, manifest, expectedMessage) => {
    const prisma = makeTransactional();
    prisma.campusMap.findUnique.mockResolvedValue({ id: 'map-1', regionId: 'region-1', versionCounter: 1 });
    prisma.campusMapVersion.findFirst.mockResolvedValue({
      id: 'version-unsafe', mapId: 'map-1', version: 1, manifest,
    });
    const service = new CampusMapService(prisma as any);

    await expect(service.rollbackVersion('region-1', 'version-unsafe', 'admin-1'))
      .rejects.toThrow(expectedMessage);

    expect(prisma.campusMap.update).not.toHaveBeenCalled();
    expect(prisma.campusMapVersion.create).not.toHaveBeenCalled();
    expect(prisma.campusMapDraft.updateMany).not.toHaveBeenCalled();
    expect(prisma.campusMapDraft.create).not.toHaveBeenCalled();
  });

  it('keeps the legacy PUT compatible while saving only a draft', async () => {
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
    expect(prisma.campusMapVersion.create).not.toHaveBeenCalled();
    expect(prisma.campusMap.update).not.toHaveBeenCalled();
    expect(prisma.config.upsert).not.toHaveBeenCalled();
    expect(result.enabled).toBe(true);
    expect(result.regionId).toBe('region-1');
    expect(result.layers).toHaveLength(1);
    expect(result.workflow).toMatchObject({ mapId: 'map-1', draftRevision: 1 });
  });

  it('never exposes a legacy Config map before immutable publication', async () => {
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

    expect(result).toMatchObject({
      enabled: false,
      reason: 'not_configured',
      regionId: 'region-2',
      layers: [],
    });
    expect(prisma.config.findUnique).not.toHaveBeenCalled();
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
          {
            id: 'gate-north',
            title: '北门',
            longitude: 106.532222,
            latitude: 29.628555,
            mapX: 420,
            mapY: 80,
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
        expect.objectContaining({ id: 'gate-north', mapX: 420, mapY: 80 }),
      ],
    });
  });

  it('rejects enabled image/CAD positioning when three calibration points are collinear', async () => {
    const service = new CampusMapService(createPrisma() as any);
    await expect(service.saveDraft('region-1', {
      enabled: true,
      mapId: 'collinear-map',
      imageMap: { imageUrl: 'https://cdn.example.com/campus.png' },
      positioning: {
        enabled: true,
        coordinateType: 'gcj02',
        calibrationPoints: [
          { longitude: 106.5, latitude: 29.6, mapX: 0, mapY: 0 },
          { longitude: 106.51, latitude: 29.61, mapX: 100, mapY: 100 },
          { longitude: 106.52, latitude: 29.62, mapX: 200, mapY: 200 },
        ],
      },
      layers: [],
    })).rejects.toThrow('图片/CAD 底图开启定位时必须配置至少 3 个非共线校准点');
  });

  it('rejects publishing a navigable place without verified valid GCJ-02 coordinates', async () => {
    const prisma = makeTransactional();
    prisma.campusMap.findUnique.mockResolvedValue({ id: 'map-1', regionId: 'region-1', versionCounter: 0 });
    prisma.campusMapDraft.findUnique.mockResolvedValue({
      id: 'draft-1',
      mapId: 'map-1',
      revision: 1,
      manifest: { enabled: true, mapId: 'campus-map', layers: [] },
    });
    prisma.campusMapProject.findMany.mockResolvedValue([{
      id: 'place-1',
      officialName: '图书馆',
      displayName: null,
      publishStatus: 'published',
      visibilityScope: 'phase1_active',
      serviceStatus: 'open',
      navigable: true,
      coordinateStatus: 'uncollected',
      longitude: null,
      latitude: null,
      media: [],
      entrances: [],
    }]);
    const service = new CampusMapService(prisma as any);

    await expect(service.publishDraft('region-1'))
      .rejects.toThrow('地点“图书馆”已开启导航，但尚无已核验的有效 GCJ-02 坐标');
    expect(prisma.campusMap.update).not.toHaveBeenCalled();
    expect(prisma.campusMapVersion.create).not.toHaveBeenCalled();
  });

  it('rejects publishing a non-open stable place without a user-facing explanation', async () => {
    const prisma = makeTransactional();
    prisma.campusMap.findUnique.mockResolvedValue({ id: 'map-1', regionId: 'region-1', versionCounter: 0 });
    prisma.campusMapDraft.findUnique.mockResolvedValue({
      id: 'draft-1', mapId: 'map-1', revision: 1,
      manifest: { enabled: true, mapId: 'campus-map', layers: [] },
    });
    prisma.campusMapProject.findMany.mockResolvedValue([{
      id: 'place-1', officialName: '图书馆', publishStatus: 'published', visibilityScope: 'phase1_active',
      serviceStatus: 'limited', unavailableMessage: '', navigable: false, media: [], entrances: [],
    }]);
    const service = new CampusMapService(prisma as any);

    await expect(service.publishDraft('region-1'))
      .rejects.toThrow('地点“图书馆”不是“已开放”状态时必须填写用户端不可用说明');
    expect(prisma.campusMap.update).not.toHaveBeenCalled();
    expect(prisma.campusMapVersion.create).not.toHaveBeenCalled();
  });

  it('rejects saving a closed stable place with navigation enabled', async () => {
    const prisma: any = makeTransactional();
    prisma.campusMap.findUnique.mockResolvedValue({ id: 'map-1' });
    const service = new CampusMapService(prisma);

    await expect(service.upsertProject({
      regionId: 'region-1', officialNumber: 7, officialName: '人和楼',
      publishStatus: 'draft', serviceStatus: 'closed', unavailableMessage: '已关闭', navigable: true,
    }, 'admin-1')).rejects.toThrow('地点“人和楼”当前状态不能开启导航');
    expect(prisma.campusMapProject.upsert).not.toHaveBeenCalled();
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

  it('seeds fresh stable places with explicit publish status instead of an empty public catalog', async () => {
    const prisma: any = createPrisma();
    prisma.campusMapProject.count = jest.fn().mockResolvedValue(0);
    prisma.campusMapProject.createMany = jest.fn().mockResolvedValue({ count: 38 });
    prisma.campusMap.findUnique.mockResolvedValue({ id: 'map-1' });
    const service = new CampusMapService(prisma);
    await expect(service.seedProjectsFromCatalog('admin-1', 'region-1'))
      .resolves.toEqual({ seeded: true, count: 38 });
    const rows = prisma.campusMapProject.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(38);
    expect(rows.every((row: any) => row.artworkFeatureKey && Number.isFinite(row.artworkAnchorX) && Number.isFinite(row.artworkAnchorY))).toBe(true);
    expect(rows.filter((row: any) => row.visibilityScope === 'phase1_active'))
      .toEqual(expect.arrayContaining([expect.objectContaining({
        publishStatus: 'review', serviceStatus: 'open', unavailableMessage: null,
      })]));
    expect(rows.find((row: any) => row.officialNumber === 14)).toMatchObject({
      constructionStatus: 'under_construction',
      serviceStatus: 'unopened',
      unavailableMessage: '项目尚未开放',
      visibilityScope: 'future_reference',
      publishStatus: 'draft',
    });
  });

  it('returns 409 instead of a database foreign-key error when a task references a place', async () => {
    const prisma: any = createPrisma();
    prisma.campusMapProject.findUnique = jest.fn().mockResolvedValue({
      id: 'place-7',
      taskLinks: [{ taskId: 'task-1' }],
    });
    prisma.campusMapProject.delete = jest.fn();
    const service = new CampusMapService(prisma);
    await expect(service.deleteProject(7, 'region-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.campusMapProject.delete).not.toHaveBeenCalled();
  });

  it('checks an official-number conflict before mutating either place', async () => {
    const prisma: any = makeTransactional();
    prisma.campusMapProject.findFirst.mockResolvedValue({
      id: 'place-7',
      regionId: 'region-1',
      mapId: 'map-1',
      officialNumber: 7,
      officialName: '人和楼',
    });
    prisma.campusMapProject.findUnique.mockResolvedValue({ id: 'place-8' });
    const service = new CampusMapService(prisma);

    await expect(service.updatePlace('region-1', 'place-7', {
      officialNumber: 8,
      officialName: '人和楼',
      entrances: [{ name: '东门', longitude: 106.5, latitude: 29.6 }],
    }, 'admin-1')).rejects.toThrow('编号 8 已被其他地点使用');

    expect(prisma.campusMapProject.update).not.toHaveBeenCalled();
    expect(prisma.campusMapPlaceEntrance.deleteMany).not.toHaveBeenCalled();
    expect(prisma.campusMapPlaceEntrance.update).not.toHaveBeenCalled();
    expect(prisma.campusMapPlaceEntrance.create).not.toHaveBeenCalled();
  });

  it('never lets a legacy catalog write silently fall back to global', async () => {
    const prisma: any = createPrisma();
    const service = new CampusMapService(prisma);

    await expect(service.upsertProject({ officialNumber: 7, officialName: '人和楼' }))
      .rejects.toThrow('regionId 必填');
    expect(prisma.campusMapProject.upsert).not.toHaveBeenCalled();

    await expect(service.resolveCatalogRegionId('region-1', 'campus-map-region-1'))
      .resolves.toBe('region-1');
    expect(prisma.campusMap.findUnique).not.toHaveBeenCalled();

    prisma.campusMap.findUnique.mockResolvedValue({ regionId: 'region-1' });
    await expect(service.resolveCatalogRegionId(undefined, 'map-1')).resolves.toBe('region-1');
    expect(prisma.campusMap.findUnique).toHaveBeenCalledWith({
      where: { id: 'map-1' },
      select: { regionId: true },
    });
  });

  it('updates existing entrance ids, creates new entrances, and deletes only omitted ids atomically', async () => {
    const prisma: any = makeTransactional();
    prisma.campusMap.findUnique.mockResolvedValue({ id: 'map-1' });
    prisma.campusMapProject.upsert.mockResolvedValue({ id: 'place-7' });
    prisma.campusMapPlaceEntrance.findMany.mockResolvedValue([
      { id: 'entrance-1' },
      { id: 'entrance-stale' },
    ]);
    prisma.campusMapProject.findFirst.mockResolvedValue({
      id: 'place-7',
      regionId: 'region-1',
      officialNumber: 7,
      officialName: '人和楼',
      media: [],
      entrances: [{ id: 'entrance-1', name: '东门' }],
      taskLinks: [],
    });
    const service = new CampusMapService(prisma);

    const result: any = await service.upsertProject({
      regionId: 'region-1',
      officialNumber: 7,
      officialName: '人和楼',
      entrances: [
        { id: 'entrance-1', name: '东门', longitude: 106.531, latitude: 29.624, isPrimary: true },
        { name: '西门', longitude: 106.5305, latitude: 29.6235, isPrimary: false },
      ],
    }, 'admin-1');

    expect(prisma.campusMapPlaceEntrance.findMany).toHaveBeenCalledWith({
      where: { placeId: 'place-7' }, select: { id: true },
    });
    expect(prisma.campusMapPlaceEntrance.update).toHaveBeenCalledWith({
      where: { id: 'entrance-1' },
      data: expect.objectContaining({ name: '东门', coordinateType: 'gcj02', isPrimary: true }),
    });
    expect(prisma.campusMapPlaceEntrance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        placeId: 'place-7', name: '西门', coordinateType: 'gcj02', createdBy: 'admin-1',
      }),
    });
    expect(prisma.campusMapPlaceEntrance.deleteMany).toHaveBeenCalledWith({
      where: { placeId: 'place-7', id: { in: ['entrance-stale'] } },
    });
    expect(result.entrances).toEqual([{ id: 'entrance-1', name: '东门' }]);
  });

  it('rejects an entrance id owned by another place before mutating entrances', async () => {
    const prisma: any = makeTransactional();
    prisma.campusMap.findUnique.mockResolvedValue({ id: 'map-1' });
    prisma.campusMapProject.upsert.mockResolvedValue({ id: 'place-7' });
    prisma.campusMapPlaceEntrance.findMany.mockResolvedValue([{ id: 'entrance-1' }]);
    const service = new CampusMapService(prisma);

    await expect(service.upsertProject({
      regionId: 'region-1', officialNumber: 7, officialName: '人和楼',
      entrances: [{ id: 'entrance-other', name: '东门', longitude: 106.531, latitude: 29.624 }],
    }, 'admin-1')).rejects.toThrow('第 1 个入口不属于当前地点');

    expect(prisma.campusMapPlaceEntrance.update).not.toHaveBeenCalled();
    expect(prisma.campusMapPlaceEntrance.create).not.toHaveBeenCalled();
    expect(prisma.campusMapPlaceEntrance.deleteMany).not.toHaveBeenCalled();
  });

  it('preserves only public-safe entrance fields in immutable public snapshots', () => {
    const service = new CampusMapService(createPrisma() as any);
    const snapshots = (service as any).publicPlaceSnapshots([{
      id: 'place-7',
      officialNumber: 7,
      officialName: '人和楼',
      publishStatus: 'published',
      visibilityScope: 'phase1_active',
      entrances: [{
        id: 'entrance-1',
        name: '东门',
        longitude: 106.531,
        latitude: 29.624,
        coordinateType: 'wgs84',
        accuracy: 2.5,
        sourceType: 'rider_collection',
        serviceStatus: 'open',
        isPrimary: true,
        addressDescription: '人和楼东侧',
      }, {
        id: 'invalid', name: '无效入口', longitude: null, latitude: null,
      }],
      unavailableMessage: '  临时施工，请从东门通行  ',
    }]);

    expect(snapshots[0].entrances).toEqual([{
      id: 'entrance-1',
      name: '东门',
      longitude: 106.531,
      latitude: 29.624,
      coordinateType: 'gcj02',
      serviceStatus: 'open',
      isPrimary: true,
      address: '人和楼东侧',
      nodeId: null,
    }]);
    expect(snapshots[0].entrances[0]).not.toHaveProperty('accuracy');
    expect(snapshots[0].entrances[0]).not.toHaveProperty('sourceType');
    expect(snapshots[0].unavailableMessage).toBe('临时施工，请从东门通行');
  });

  it('compiles approved rider routes and published entrances into the immutable navigation graph', () => {
    const service = new CampusMapService(createPrisma() as any);
    const places: any[] = [{
      id: 'place-7', officialName: '人和楼', serviceStatus: 'open', navigable: true,
      entrances: [{
        id: 'entrance-east', name: '东门', longitude: 106.50015, latitude: 29.60002,
        serviceStatus: 'open', isPrimary: true,
      }],
    }];
    const manifest: any = {
      coordinateSystem: { type: 'gcj02', source: 'gcj02', unit: 'degree' },
      layers: [{
        id: 'operator_routes',
        inlineData: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
            properties: {
              id: 'collection-route-object-1', sourceObjectId: 'object-1',
              collectionSource: 'rider_app_approved',
              sourceGeometryGcj02: {
                type: 'LineString',
                coordinates: [[106.5, 29.6], [106.5003, 29.6]],
              },
              pedestrian: true,
            },
          }],
        },
      }],
    };

    const navigation: any = (service as any).compilePublishedNavigation(manifest, places);

    expect(navigation.graph.coordinateSystem).toBe('GCJ-02');
    expect(navigation.graph.generatedFrom).toBe('approved_operator_routes_and_published_entrances');
    expect(Object.keys(navigation.graph.nodes).length).toBeGreaterThanOrEqual(3);
    expect(navigation.graph.edges.some((edge: any) => edge.source === 'rider_collection_approved')).toBe(true);
    expect(navigation.graph.edges.some((edge: any) => edge.source === 'verified_entrance_connector')).toBe(true);
    expect(places[0].entranceNodeIds).toHaveLength(1);
    expect(places[0].entrances[0].nodeId).toBe(places[0].entranceNodeIds[0]);
    expect(() => (service as any).assertPublishedNavigationClosure(places, navigation)).not.toThrow();

    const snapshots = (service as any).publicPlaceSnapshots([{
      ...places[0], officialNumber: 7, publishStatus: 'published', visibilityScope: 'phase1_active',
    }]);
    expect(snapshots[0].entranceNodeIds).toEqual(places[0].entranceNodeIds);
    expect(snapshots[0].entrances[0].nodeId).toBe(places[0].entranceNodeIds[0]);
  });

  it('clears stale navigation when the current draft has no approved rider route', () => {
    const service = new CampusMapService(createPrisma() as any);
    const manifest = {
      layers: [],
      navigation: { graph: { nodes: { stale: { gcj02: [106.5, 29.6] } }, edges: [] } },
    };

    expect((service as any).compilePublishedNavigation(manifest, [])).toBeNull();
  });

  it('does not promote an unreviewed operator sketch into the public navigation graph', () => {
    const service = new CampusMapService(createPrisma() as any);
    const manifest = {
      layers: [{
        id: 'operator_routes',
        inlineData: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[106.5, 29.6], [106.501, 29.601]] },
            properties: { id: 'admin-sketch', coordinateType: 'gcj02' },
          }],
        },
      }],
    };

    expect((service as any).compilePublishedNavigation(manifest, [])).toBeNull();
  });

  it('strips spoofed route approval fields when no approved collection object exists', async () => {
    const prisma = createPrisma();
    const service = new CampusMapService(prisma as any);
    const manifest: any = {
      layers: [{
        id: 'operator_routes',
        inlineData: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[106.5, 29.6], [106.501, 29.601]] },
            properties: {
              id: 'collection-route-fake-object',
              sourceObjectId: 'fake-object',
              collectionSource: 'rider_app_approved',
              verificationStatus: 'verified',
              sourceGeometryGcj02: {
                type: 'LineString',
                coordinates: [[106.5, 29.6], [106.501, 29.601]],
              },
              title: '管理员手绘线',
            },
          }],
        },
      }],
    };

    await (service as any).reconcileApprovedRouteFeatures(prisma, 'region-1', manifest);

    expect(manifest.layers[0].inlineData.features[0].properties).toEqual({
      id: 'collection-route-fake-object',
      title: '管理员手绘线',
    });
    expect((service as any).compilePublishedNavigation(manifest, [])).toBeNull();
  });

  it('rehydrates route evidence from the approved collection object and maps accessibility', async () => {
    const prisma = createPrisma();
    prisma.campusMapCollectionObject.findMany.mockResolvedValue([{
      id: 'road-object-1',
      sessionId: 'session-1',
      geometry: {
        type: 'LineString',
        coordinates: [[106.5, 29.6], [106.5003, 29.6]],
      },
      properties: { accessible: true },
      recordedAt: new Date('2026-08-26T01:00:00.000Z'),
      reviewedAt: new Date('2026-08-26T02:00:00.000Z'),
      reviewedBy: 'admin-1',
      applyResult: {
        applied: true,
        routeQuality: { source: 'server_ack', sampleCount: 6, maximumGapSeconds: 3 },
        routeEvidenceAttachmentIds: ['attachment-1'],
      },
      attachments: [{
        id: 'attachment-1', url: 'https://cdn.example.com/road.jpg', kind: 'photo',
        mimeType: 'image/jpeg', metadata: { accuracy: 4 },
      }],
    }]);
    const service = new CampusMapService(prisma as any);
    const manifest: any = {
      coordinateSystem: { type: 'amap', source: 'gcj02', unit: 'degree' },
      layers: [{
        id: 'operator_routes',
        inlineData: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[10, 10], [20, 20]] },
            properties: {
              id: 'collection-route-road-object-1',
              title: '无障碍通道',
              public: true,
              pedestrian: true,
            },
          }],
        },
      }],
    };

    await (service as any).reconcileApprovedRouteFeatures(prisma, 'region-1', manifest);
    const properties = manifest.layers[0].inlineData.features[0].properties;
    const navigation = (service as any).compilePublishedNavigation(manifest, []);

    expect(prisma.campusMapCollectionObject.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { in: ['road-object-1'] },
        reviewStatus: 'approved',
      }),
    }));
    expect(properties).toMatchObject({
      sourceObjectId: 'road-object-1',
      sourceSessionId: 'session-1',
      collectionSource: 'rider_app_approved',
      verificationStatus: 'verified',
      accessible: true,
      wheelchair: true,
      quality: { source: 'server_ack', sampleCount: 6 },
    });
    expect(properties.evidence).toHaveLength(1);
    expect(manifest.layers[0].inlineData.features[0].geometry).toEqual({
      type: 'LineString',
      coordinates: [[106.5, 29.6], [106.5003, 29.6]],
    });
    expect(navigation.graph.edges[0]).toMatchObject({
      source: 'rider_collection_approved',
      wheelchair: true,
    });
  });

  it('does not compile an approved route that public walking navigation cannot use', () => {
    const service = new CampusMapService(createPrisma() as any);
    const manifest = {
      layers: [{
        id: 'operator_routes',
        inlineData: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[106.5, 29.6], [106.501, 29.601]] },
            properties: {
              id: 'private-road',
              collectionSource: 'rider_app_approved',
              coordinateType: 'gcj02',
              public: false,
            },
          }],
        },
      }],
    };

    expect((service as any).compilePublishedNavigation(manifest, [])).toBeNull();
  });

  it('blocks publication when a navigable place is not connected to an approved rider route', () => {
    const service = new CampusMapService(createPrisma() as any);

    expect(() => (service as any).assertPublishedNavigationClosure([{
      id: 'place-7', officialName: '人和楼', title: '人和楼', serviceStatus: 'open',
      navigable: true, entranceNodeIds: [],
    }])).toThrow('没有可连接到已审核校园路线的开放入口');
  });

  it('blocks publication when approved route components are not mutually reachable', () => {
    const service = new CampusMapService(createPrisma() as any);
    const places: any[] = [{
      id: 'place-a', title: '教学楼', serviceStatus: 'open', navigable: true,
      entranceNodeIds: ['a'],
    }, {
      id: 'place-c', title: '食堂', serviceStatus: 'open', navigable: true,
      entranceNodeIds: ['c'],
    }];
    const navigation = {
      graph: {
        nodes: {
          a: { gcj02: [106.5, 29.6] },
          b: { gcj02: [106.5002, 29.6] },
          c: { gcj02: [106.501, 29.601] },
          d: { gcj02: [106.5012, 29.601] },
        },
        edges: [{
          id: 'road-a', a: 'a', b: 'b', public: true, pedestrian: true,
          verificationStatus: 'verified',
        }, {
          id: 'road-b', a: 'c', b: 'd', public: true, pedestrian: true,
          verificationStatus: 'verified',
        }],
      },
    };

    expect(() => (service as any).assertPublishedNavigationClosure(places, navigation))
      .toThrow('已审核校园路线之间存在断点');
  });

  it('blocks illustrated navigation publication until three mapped GCJ-02 anchors are non-collinear', () => {
    const service = new CampusMapService(createPrisma() as any);
    const navigation = {
      graph: {
        nodes: {
          a: { gcj02: [106.5, 29.6] },
          b: { gcj02: [106.5002, 29.6] },
        },
        edges: [{
          id: 'road-a', a: 'a', b: 'b', public: true, pedestrian: true,
          verificationStatus: 'verified',
        }],
      },
    };
    const onlyTwoAnchors = [{
      id: 'place-1', officialNumber: 1, longitude: 106.5, latitude: 29.6,
    }, {
      id: 'place-2', officialNumber: 2, longitude: 106.5002, latitude: 29.6,
    }];

    expect(() => (service as any).assertIllustratedNavigationCalibration(onlyTwoAnchors, navigation))
      .toThrow('至少需要 3 个分散的已发布地点');
    expect(() => (service as any).assertIllustratedNavigationCalibration([
      ...onlyTwoAnchors,
      { id: 'place-3', officialNumber: 3, longitude: 106.5001, latitude: 29.6002 },
    ], navigation)).not.toThrow();
  });

  it('accepts all 1-38 AI anchors and still requires a manual anchor outside the illustrated catalog', () => {
    const service = new CampusMapService(createPrisma() as any);
    const navigation = {
      graph: {
        nodes: { a: { gcj02: [106.5, 29.6] }, b: { gcj02: [106.5002, 29.6] } },
        edges: [{
          id: 'road-a', a: 'a', b: 'b', public: true, pedestrian: true,
          verificationStatus: 'verified',
        }],
      },
    };
    const places: any[] = [{
      officialNumber: 1, longitude: 106.5, latitude: 29.6,
    }, {
      officialNumber: 2, longitude: 106.5002, latitude: 29.6,
    }, {
      officialNumber: 34, longitude: 106.5001, latitude: 29.6002,
    }];

    expect(() => (service as any).assertIllustratedNavigationCalibration(places, navigation)).not.toThrow();
    places[2].officialNumber = 99;
    expect(() => (service as any).assertIllustratedNavigationCalibration(places, navigation))
      .toThrow('至少需要 3 个分散的已发布地点');
    places[2].artworkAnchorX = 1200;
    places[2].artworkAnchorY = 900;
    expect(() => (service as any).assertIllustratedNavigationCalibration(places, navigation)).not.toThrow();
  });

  it('uses a shared server ACK anchor key to join adjacent rider segments deterministically', () => {
    const service = new CampusMapService(createPrisma() as any);
    const sharedKey = 'a'.repeat(64);
    const manifest = {
      layers: [{
        id: 'operator_routes',
        inlineData: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[106.5, 29.6], [106.5002, 29.6]] },
            properties: {
              id: 'route-a', sourceObjectId: 'road-a', collectionSource: 'rider_app_approved',
              coordinateType: 'gcj02', public: true, pedestrian: true,
              sourceGeometryGcj02: { type: 'LineString', coordinates: [[106.5, 29.6], [106.5002, 29.6]] },
              routeEndpointAnchors: {
                version: 1,
                start: { key: 'b'.repeat(64), longitude: 106.5, latitude: 29.6 },
                end: { key: sharedKey, longitude: 106.5002, latitude: 29.6 },
              },
            },
          }, {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[106.5003, 29.6], [106.5005, 29.6]] },
            properties: {
              id: 'route-b', sourceObjectId: 'road-b', collectionSource: 'rider_app_approved',
              coordinateType: 'gcj02', public: true, pedestrian: true,
              sourceGeometryGcj02: { type: 'LineString', coordinates: [[106.5003, 29.6], [106.5005, 29.6]] },
              routeEndpointAnchors: {
                version: 1,
                start: { key: sharedKey, longitude: 106.5002, latitude: 29.6, sharedFromObjectId: 'road-a' },
                end: { key: 'c'.repeat(64), longitude: 106.5005, latitude: 29.6 },
              },
            },
          }],
        },
      }],
    };

    const navigation = (service as any).compilePublishedNavigation(manifest, []);
    const [first, second] = navigation.graph.edges;

    expect(first.b).toBe(second.a);
    expect(Object.values(navigation.graph.nodes)).toHaveLength(3);
    expect(second.coordinates[0]).toEqual([106.5002, 29.6]);
  });

  it('joins legacy route endpoints to trusted anchors independently of feature order', () => {
    const service = new CampusMapService(createPrisma() as any);
    const anchored = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[106.5002, 29.6], [106.5005, 29.6]] },
      properties: {
        id: 'anchored', sourceObjectId: 'anchored', collectionSource: 'rider_app_approved',
        coordinateType: 'gcj02', public: true, pedestrian: true,
        sourceGeometryGcj02: { type: 'LineString', coordinates: [[106.5002, 29.6], [106.5005, 29.6]] },
        routeEndpointAnchors: {
          version: 1,
          start: { key: '1'.repeat(64), longitude: 106.5002, latitude: 29.6 },
          end: { key: '2'.repeat(64), longitude: 106.5005, latitude: 29.6 },
        },
      },
    };
    const legacy = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[106.5, 29.6], [106.50021, 29.6]] },
      properties: {
        id: 'legacy', sourceObjectId: 'legacy', collectionSource: 'rider_app_approved',
        coordinateType: 'gcj02', public: true, pedestrian: true,
        sourceGeometryGcj02: { type: 'LineString', coordinates: [[106.5, 29.6], [106.50021, 29.6]] },
      },
    };
    const compile = (features: any[]) => (service as any).compilePublishedNavigation({
      layers: [{ id: 'operator_routes', inlineData: { type: 'FeatureCollection', features } }],
    }, []).graph;

    const legacyFirst = compile([legacy, anchored]);
    const anchorFirst = compile([anchored, legacy]);
    const connectedNode = (graph: any) => {
      const legacyEdge = graph.edges.find((edge: any) => edge.sourceObjectId === 'legacy');
      const anchoredEdge = graph.edges.find((edge: any) => edge.sourceObjectId === 'anchored');
      return legacyEdge.b === anchoredEdge.a;
    };
    expect(connectedNode(legacyFirst)).toBe(true);
    expect(connectedNode(anchorFirst)).toBe(true);
    expect(Object.keys(legacyFirst.nodes).sort()).toEqual(Object.keys(anchorFirst.nodes).sort());
  });

  it('rejects conflicting coordinates for the same server ACK anchor key', () => {
    const service = new CampusMapService(createPrisma() as any);
    const sharedKey = 'd'.repeat(64);
    const route = (id: string, coordinates: number[][], anchorPoint: number[]) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: {
        id, sourceObjectId: id, collectionSource: 'rider_app_approved', coordinateType: 'gcj02',
        sourceGeometryGcj02: { type: 'LineString', coordinates },
        routeEndpointAnchors: {
          version: 1,
          start: { key: sharedKey, longitude: anchorPoint[0], latitude: anchorPoint[1] },
          end: { key: `${id === 'road-a' ? 'e' : 'f'}`.repeat(64), longitude: coordinates.at(-1)![0], latitude: coordinates.at(-1)![1] },
        },
      },
    });
    const manifest = { layers: [{
      id: 'operator_routes',
      inlineData: { type: 'FeatureCollection', features: [
        route('road-a', [[106.5, 29.6], [106.5002, 29.6]], [106.5, 29.6]),
        route('road-b', [[106.5003, 29.6], [106.5005, 29.6]], [106.5003, 29.6]),
      ] },
    }] };

    expect(() => (service as any).compilePublishedNavigation(manifest, []))
      .toThrow('同一路口锚点出现不一致坐标');
  });

  it('keeps entrance snapshots when rolling back an immutable map version', async () => {
    const prisma: any = makeTransactional();
    const targetManifest = {
      enabled: true,
      regionId: 'region-1',
      mapId: 'campus-map',
      layers: [{ id: 'pois', url: 'https://cdn.example.com/pois.geojson' }],
      placeCatalog: [{
        id: 'place-7', officialNumber: 7, officialName: '人和楼',
        publishStatus: 'published', visibilityScope: 'phase1_active',
        entrances: [{
          id: 'entrance-1', name: '东门', longitude: 106.531, latitude: 29.624,
          coordinateType: 'gcj02', serviceStatus: 'open', isPrimary: true, address: '人和楼东侧',
        }],
      }],
    };
    prisma.campusMap.findUnique.mockResolvedValue({ id: 'map-1', regionId: 'region-1', versionCounter: 1 });
    prisma.campusMapVersion.findFirst.mockResolvedValue({ id: 'version-1', mapId: 'map-1', manifest: targetManifest });
    prisma.campusMap.update
      .mockResolvedValueOnce({ id: 'map-1', versionCounter: 2 })
      .mockResolvedValueOnce({ id: 'map-1', enabled: true, activeVersionId: 'version-2' });
    prisma.campusMapVersion.create.mockResolvedValue({ id: 'version-2', version: 2 });
    prisma.campusMapDraft.findUnique.mockResolvedValue(null);
    prisma.campusMapDraft.create.mockResolvedValue({ id: 'draft-2', revision: 1 });
    const service = new CampusMapService(prisma);

    const result: any = await service.rollbackVersion('region-1', 'version-1', 'admin-1');

    expect(result.publicPlaces[0].entrances).toEqual([
      expect.objectContaining({ id: 'entrance-1', name: '东门', coordinateType: 'gcj02' }),
    ]);
    expect(prisma.campusMapVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        manifest: { ...targetManifest, navigation: null },
        rollbackOfId: 'version-1',
      }),
    }));
  });

  it('repairs only unambiguous map and historical task links without rewriting targetPlaceIds', async () => {
    const prisma: any = createPrisma();
    prisma.campusMapProject.findMany.mockResolvedValue([
      { id: 'place-1', mapId: null, artworkFeatureKey: 'feature-1' },
      { id: 'place-2', mapId: null, artworkFeatureKey: 'duplicate-feature' },
      { id: 'place-3', mapId: null, artworkFeatureKey: 'duplicate-feature' },
      { id: 'place-4', mapId: null, artworkFeatureKey: null },
    ]);
    prisma.campusMapCollectionTask.findMany.mockResolvedValue([{
      id: 'task-1',
      targetPlaceIds: ['place-1', 'feature-1', 'duplicate-feature', 'missing-feature'],
      placeLinks: [],
    }]);
    prisma.campusMapCollectionTask.update = jest.fn();
    const service = new CampusMapService(prisma);

    await (service as any).repairRegionCatalogIntegrity(prisma, 'region-1', 'map-1');

    expect(prisma.campusMapProject.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['place-1', 'place-4'] }, regionId: 'region-1', mapId: null },
      data: { mapId: 'map-1' },
    });
    expect(prisma.campusMapCollectionTaskPlace.createMany).toHaveBeenCalledWith({
      data: [{ taskId: 'task-1', placeId: 'place-1', sortOrder: 0 }],
      skipDuplicates: true,
    });
    expect(prisma.campusMapCollectionTask.update).not.toHaveBeenCalled();
  });

  it('syncs an explicitly bound map feature into the stable place archive', async () => {
    const prisma: any = createPrisma();
    prisma.campusMapProject.findMany.mockResolvedValue([{ id: 'place-15', officialNumber: 15 }]);
    const service = new CampusMapService(prisma);
    await (service as any).syncBoundProjectFeatures(prisma, 'region-1', 'map-1', {
      layers: [{
        id: 'operator_pois',
        inlineData: { type: 'FeatureCollection', features: [{
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [1150.91, 1041.78] },
          properties: {
            id: 'project-15', placeId: 'place-15', officialNumber: 15,
            publishStatus: 'review', visibilityScope: 'phase1_active',
            constructionStatus: 'built', serviceStatus: 'open',
            searchable: true, navigable: false, semanticType: 'canteen',
          },
        }] },
      }],
    }, 'admin-1');

    expect(prisma.campusMapProject.update).toHaveBeenCalledWith({
      where: { id: 'place-15' },
      data: expect.objectContaining({
        mapId: 'map-1', artworkFeatureKey: 'project-15',
        artworkAnchorX: 1150.91, artworkAnchorY: 1041.78,
        geometryStatus: 'verified_point', publishStatus: 'review',
        visibilityScope: 'phase1_active', searchable: true,
      }),
    });
  });

  it('never stores amap longitude and latitude as commissioned artwork anchors', async () => {
    const prisma: any = createPrisma();
    prisma.campusMapProject.findMany.mockResolvedValue([{ id: 'place-15', officialNumber: 15 }]);
    const service = new CampusMapService(prisma);

    await (service as any).syncBoundProjectFeatures(prisma, 'region-1', 'map-1', {
      coordinateSystem: { type: 'amap', source: 'gcj02' },
      layers: [{
        id: 'operator_pois',
        inlineData: { type: 'FeatureCollection', features: [{
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [108.755214, 30.977782] },
          properties: {
            id: 'project-15', placeId: 'place-15', officialNumber: 15,
            publishStatus: 'review', visibilityScope: 'phase1_active',
            constructionStatus: 'built', serviceStatus: 'open',
          },
        }] },
      }],
    }, 'admin-1');

    expect(prisma.campusMapProject.update).toHaveBeenCalledWith({
      where: { id: 'place-15' },
      data: expect.objectContaining({ mapId: 'map-1', publishStatus: 'review' }),
    });
    const update = prisma.campusMapProject.update.mock.calls[0][0].data;
    expect(update).not.toHaveProperty('artworkAnchorX');
    expect(update).not.toHaveProperty('artworkAnchorY');
    expect(update).not.toHaveProperty('artworkGeometry');
    expect(update).not.toHaveProperty('artworkFeatureKey');
  });

  it('stores an arrived user check-in as private pending place media', async () => {
    const prisma: any = createPrisma();
    prisma.campusMapProject.findFirst.mockResolvedValue({
      id: 'place-7',
      officialName: '人和楼',
      publishStatus: 'published',
      visibilityScope: 'phase1_active',
      serviceStatus: 'open',
      coordinateStatus: 'verified',
      longitude: 106.531,
      latitude: 29.624,
    });
    prisma.campusMapPlaceMedia.findFirst.mockResolvedValue(null);
    prisma.campusMapPlaceMedia.create.mockResolvedValue({ id: 'media-checkin-1' });
    const service = new CampusMapService(prisma);

    await service.submitUserCheckIn('place-7', {
      url: 'https://cdn.example/checkin.jpg',
      storageKey: 'users/user-1/checkin.jpg',
      mimeType: 'image/jpeg',
      byteSize: 2048,
      longitude: 106.53102,
      latitude: 29.62401,
      accuracy: 12,
      capturedAt: new Date().toISOString(),
    }, 'user-1');

    expect(prisma.campusMapPlaceMedia.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        placeId: 'place-7',
        sourceType: 'user_checkin',
        reviewStatus: 'pending',
        isPublic: false,
        createdBy: 'user-1',
        captureAccuracy: 12,
      }),
    });
  });

  it('rejects a user check-in outside the selected campus place', async () => {
    const prisma: any = createPrisma();
    prisma.campusMapProject.findFirst.mockResolvedValue({
      id: 'place-7',
      officialName: '人和楼',
      publishStatus: 'published',
      visibilityScope: 'phase1_active',
      serviceStatus: 'open',
      coordinateStatus: 'verified',
      longitude: 106.531,
      latitude: 29.624,
    });
    const service = new CampusMapService(prisma);

    await expect(service.submitUserCheckIn('place-7', {
      url: 'https://cdn.example/checkin.jpg',
      longitude: 106.541,
      latitude: 29.634,
      accuracy: 12,
    }, 'user-1')).rejects.toThrow('请到达地点附近后再打卡');

    expect(prisma.campusMapPlaceMedia.create).not.toHaveBeenCalled();
  });

  it('publishes only an approved user check-in photo', async () => {
    const prisma: any = createPrisma();
    prisma.campusMapProject.findFirst.mockResolvedValue({ id: 'place-7' });
    prisma.campusMapPlaceMedia.findFirst.mockResolvedValue({
      id: 'media-checkin-1', placeId: 'place-7', reviewStatus: 'pending', isPublic: false,
    });
    const service = new CampusMapService(prisma);

    await service.updatePlaceMedia('region-1', 'place-7', 'media-checkin-1', {
      reviewStatus: 'approved',
    });

    expect(prisma.campusMapPlaceMedia.update).toHaveBeenCalledWith({
      where: { id: 'media-checkin-1' },
      data: expect.objectContaining({ reviewStatus: 'approved', isPublic: true }),
    });
  });
});
