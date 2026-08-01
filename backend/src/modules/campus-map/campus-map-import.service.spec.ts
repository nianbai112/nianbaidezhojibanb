import { CampusMapImportService } from './campus-map-import.service';

describe('CampusMapImportService', () => {
  const createPrisma = () => ({
    config: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
  });

  it('converts DXF building outlines and library text into editable semantic drafts', () => {
    const prisma = createPrisma();
    const service = new CampusMapImportService(prisma as any);
    const dxf = [
      '0', 'SECTION',
      '2', 'ENTITIES',
      '0', 'LWPOLYLINE',
      '8', 'A-BUILDING',
      '70', '1',
      '10', '36570000',
      '20', '3427000',
      '10', '36570100',
      '20', '3427000',
      '10', '36570100',
      '20', '3427080',
      '10', '36570000',
      '20', '3427080',
      '0', 'TEXT',
      '8', 'A-TEXT',
      '10', '36570050',
      '20', '3427040',
      '1', '图书馆',
      '0', 'LINE',
      '8', 'A-ROAD',
      '10', '36569900',
      '20', '3426990',
      '11', '36570200',
      '21', '3426990',
      '0', 'ENDSEC',
      '0', 'EOF',
    ].join('\n');

    const result = service.convertDxfTextToDraft(dxf, 'campus.dxf');

    expect(result.draft.baseSource).toBe('cad-vector');
    expect(result.draft.areas).toHaveLength(1);
    expect(result.draft.routes).toHaveLength(1);
    expect(result.draft.pois).toEqual([
      expect.objectContaining({
        title: '图书馆',
        semanticType: 'library',
        icon: 'book',
      }),
    ]);
    expect(result.report.warnings.join(' ')).toContain('分带前缀');
  });

  it('converts GeoJSON polygons into editable campus map areas', () => {
    const prisma = createPrisma();
    const service = new CampusMapImportService(prisma as any);
    const result = service.convertGeoJsonToDraft({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { title: '第一食堂', layer: 'building' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [100, 0], [100, 60], [0, 60], [0, 0]]],
        },
      }],
    }, 'campus.geojson');

    expect(result.draft.areas).toEqual([
      expect.objectContaining({
        title: '第一食堂',
        semanticType: 'canteen',
        color: '#f97316',
      }),
    ]);
    expect(result.draft.mapWidth).toBe(100);
    expect(result.draft.mapHeight).toBe(100);
  });

  it('preserves official project metadata in imported GeoJSON features', () => {
    const service = new CampusMapImportService(createPrisma() as any);
    const result = service.convertGeoJsonToDraft({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          title: '天枢楼',
          layer: 'phase1_buildings',
          officialNumber: 3,
          officialName: '天枢楼',
          phase: 'phase1',
          constructionStatus: 'built',
          visibilityScope: 'phase1_active',
          semanticType: 'building',
          searchable: true,
          navigable: true,
          geometryStatus: 'verified_polygon',
          sourceConfidence: 'official_signage_and_cad',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]],
        },
      }],
    });

    expect(result.draft.areas[0]).toEqual(expect.objectContaining({
      officialNumber: 3,
      officialName: '天枢楼',
      constructionStatus: 'built',
      visibilityScope: 'phase1_active',
      searchable: true,
      navigable: true,
      geometryStatus: 'verified_polygon',
    }));
  });

  it('preserves private review metadata before an official project is assigned', () => {
    const service = new CampusMapImportService(createPrisma() as any);
    const result = service.convertGeoJsonToDraft({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          title: '1号院',
          layer: 'labels',
          constructionStatus: 'built',
          visibilityScope: 'phase1_review',
          geometryStatus: 'unmatched',
          searchable: false,
          navigable: false,
        },
        geometry: { type: 'Point', coordinates: [0, 0] },
      }],
    });

    expect(result.draft.pois[0]).toEqual(expect.objectContaining({
      visibilityScope: 'phase1_review',
      constructionStatus: 'built',
      geometryStatus: 'unmatched',
      searchable: false,
      navigable: false,
    }));
    expect(result.draft.pois[0].officialNumber).toBeUndefined();
  });

  it('stores uploaded import jobs in the campus map import config group', async () => {
    const prisma = createPrisma();
    prisma.config.findUnique.mockResolvedValue(null);
    prisma.config.upsert.mockResolvedValue({ key: 'campus_map_imports_region-1' });
    const service = new CampusMapImportService(prisma as any);
    jest.spyOn<any, any>(service as any, 'projectRoot').mockReturnValue('/tmp');
    jest.spyOn(service, 'processImportJob').mockResolvedValue({} as any);

    const result = await service.createImport('region-1', {
      originalname: 'campus.geojson',
      mimetype: 'application/geo+json',
      size: 68,
      buffer: Buffer.from('{"type":"FeatureCollection","features":[]}'),
    } as any, 'admin-1');

    expect(result.status).toBe('queued');
    expect(result.source.fileName).toBe('campus.geojson');
    expect(prisma.config.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: 'campus_map_imports_region-1' },
      create: expect.objectContaining({
        group: 'campus_map_import',
        createdBy: 'admin-1',
      }),
    }));
  });

  it('reports DWG converter readiness from the server ODA path', async () => {
    const prisma = createPrisma();
    prisma.config.findUnique.mockResolvedValue(null);
    const service = new CampusMapImportService(prisma as any);
    const originalEnv = process.env.ODA_FILE_CONVERTER;
    process.env.ODA_FILE_CONVERTER = '/opt/ODAFileConverter/ODAFileConverter';
    const inspectSpy = jest.spyOn<any, any>(service as any, 'inspectConverterCandidate').mockImplementation((candidate: any) => {
      const ready = String(candidate.path) === '/opt/ODAFileConverter/ODAFileConverter';
      return {
        ...candidate,
        exists: ready,
        executable: ready,
        reason: ready ? '' : 'not_found',
      };
    });

    const status = await service.getConverterStatus();

    expect(status.ready).toBe(true);
    expect(status.path).toBe('/opt/ODAFileConverter/ODAFileConverter');
    expect(status.source).toBe('env');
    expect(status.instructions.join(' ')).toContain('ODA_FILE_CONVERTER');

    inspectSpy.mockRestore();
    if (originalEnv === undefined) {
      delete process.env.ODA_FILE_CONVERTER;
    } else {
      process.env.ODA_FILE_CONVERTER = originalEnv;
    }
  });

  it('saves a server converter path for production diagnostics', async () => {
    const prisma = createPrisma();
    prisma.config.upsert.mockResolvedValue({ key: 'campus_map_cad_converter' });
    const service = new CampusMapImportService(prisma as any);

    const result = await service.saveConverterConfig({
      converterPath: '/opt/ODAFileConverter/ODAFileConverter',
    }, 'admin-1');

    expect(result.converterPath).toBe('/opt/ODAFileConverter/ODAFileConverter');
    expect(prisma.config.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: 'campus_map_cad_converter' },
      create: expect.objectContaining({
        group: 'campus_map_import',
        updatedBy: 'admin-1',
      }),
    }));
  });

  it('requeues a converter-blocked DWG import so operators do not need to upload again', async () => {
    const prisma = createPrisma();
    prisma.config.findUnique.mockResolvedValue({
      value: {
        regionId: 'region-1',
        jobs: [{
          id: 'cad-job-1',
          regionId: 'region-1',
          status: 'needs_converter',
          progress: 30,
          message: '服务器未检测到 ODA File Converter',
          source: {
            fileName: 'campus.dwg',
            fileExt: '.dwg',
            fileSize: 1024,
            mimeType: 'application/acad',
            url: '/uploads/campus.dwg',
            path: '/tmp/campus.dwg',
          },
          report: { summary: [], warnings: ['缺少转换器'], layers: [] },
          draft: null,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
          createdBy: 'admin-0',
        }],
      },
    });
    prisma.config.upsert.mockResolvedValue({ key: 'campus_map_imports_region-1' });
    const service = new CampusMapImportService(prisma as any);

    const result = await service.retryImportJob('region-1', 'cad-job-1', 'admin-1');

    expect(result.status).toBe('queued');
    expect(result.progress).toBe(0);
    expect(result.message).toContain('重新提交');
    expect(prisma.config.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        value: expect.objectContaining({
          jobs: expect.arrayContaining([
            expect.objectContaining({
              id: 'cad-job-1',
              status: 'queued',
              draft: null,
            }),
          ]),
        }),
        updatedBy: 'admin-1',
      }),
    }));
  });

  it('deletes an import job and only removes its own upload directory', async () => {
    const prisma = createPrisma();
    const job = {
      id: 'cad-job-1',
      regionId: 'region-1',
      status: 'processing',
      progress: 20,
      message: '正在转换',
      source: {
        fileName: 'campus.dwg',
        fileExt: '.dwg',
        fileSize: 1024,
        mimeType: 'application/acad',
        url: '/uploads/campus-map-imports/region-1/cad-job-1/campus.dwg',
        path: '/tmp/uploads/campus-map-imports/region-1/cad-job-1/campus.dwg',
      },
      report: { summary: [], warnings: [], layers: [] },
      draft: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      createdBy: 'admin-0',
    };
    prisma.config.findUnique.mockResolvedValue({ value: { regionId: 'region-1', jobs: [job] } });
    prisma.config.upsert.mockResolvedValue({ key: 'campus_map_imports_region-1' });
    const service = new CampusMapImportService(prisma as any);
    jest.spyOn<any, any>(service as any, 'projectRoot').mockReturnValue('/tmp');

    await expect(service.deleteImportJob('region-1', 'cad-job-1', 'admin-1')).resolves.toEqual({
      id: 'cad-job-1',
      deleted: true,
    });
    expect(prisma.config.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        value: expect.objectContaining({ jobs: [] }),
        updatedBy: 'admin-1',
      }),
    }));
  });

  it('marks queued and processing imports as retryable failures after a restart', async () => {
    const prisma = createPrisma();
    const job = (id: string, status: string) => ({
      id,
      regionId: 'region-1',
      status,
      progress: 45,
      message: '处理中',
      source: {
        fileName: `${id}.dwg`,
        fileExt: '.dwg',
        fileSize: 1024,
        mimeType: 'application/acad',
        url: `/uploads/${id}.dwg`,
        path: `/tmp/${id}.dwg`,
      },
      report: { summary: [], warnings: [], layers: [] },
      draft: null,
      createdAt: '2026-07-29T00:00:00.000Z',
      updatedAt: '2026-07-29T00:00:00.000Z',
    });
    prisma.config.findMany.mockResolvedValue([{
      key: 'campus_map_imports_region-1',
      value: {
        regionId: 'region-1',
        jobs: [job('queued-job', 'queued'), job('processing-job', 'processing'), job('ready-job', 'draft_ready')],
      },
    }]);
    prisma.config.upsert.mockResolvedValue({ key: 'campus_map_imports_region-1' });
    const service = new CampusMapImportService(prisma as any);

    await service.onModuleInit();

    const saved = prisma.config.upsert.mock.calls[0][0].update.value.jobs;
    expect(saved).toEqual([
      expect.objectContaining({
        id: 'queued-job',
        status: 'failed',
        progress: 0,
        message: expect.stringContaining('服务重启'),
      }),
      expect.objectContaining({
        id: 'processing-job',
        status: 'failed',
        progress: 0,
        message: expect.stringContaining('服务重启'),
      }),
      expect.objectContaining({ id: 'ready-job', status: 'draft_ready', progress: 45 }),
    ]);
  });

  it('keeps both jobs when two imports update the same region concurrently', async () => {
    const prisma = createPrisma();
    let storedJobs: any[] = [];
    prisma.config.findUnique.mockImplementation(async () => ({
      value: { regionId: 'region-1', jobs: storedJobs.map((item) => ({ ...item })) },
    }));
    prisma.config.upsert.mockImplementation(async ({ create, update }: any) => {
      storedJobs = (update.value?.jobs || create.value.jobs).map((item: any) => ({ ...item }));
      return { key: 'campus_map_imports_region-1' };
    });
    const service = new CampusMapImportService(prisma as any);
    const makeJob = (id: string) => ({
      id,
      regionId: 'region-1',
      status: 'queued',
      progress: 0,
      message: '等待处理',
      source: {
        fileName: `${id}.dxf`,
        fileExt: '.dxf',
        fileSize: 100,
        mimeType: 'application/dxf',
        url: `/uploads/${id}.dxf`,
        path: `/tmp/${id}.dxf`,
      },
      report: { summary: [], warnings: [], layers: [] },
      draft: null,
      createdAt: '2026-07-29T00:00:00.000Z',
      updatedAt: '2026-07-29T00:00:00.000Z',
    });

    await Promise.all([
      (service as any).saveJob(makeJob('job-a')),
      (service as any).saveJob(makeJob('job-b')),
    ]);

    expect(storedJobs.map((item) => item.id).sort()).toEqual(['job-a', 'job-b']);
  });
});
