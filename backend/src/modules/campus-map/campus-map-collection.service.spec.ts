import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CampusMapCollectionService } from './campus-map-collection.service';

describe('CampusMapCollectionService', () => {
  const createPrisma = () => ({
    campusMapCollectionTask: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    campusMapCollectionAssignment: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    campusMapMarkerTemplate: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    campusMapCollectionSession: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    campusMapCollectionPoint: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    campusMapCollectionMarker: {
      findUnique: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  });

  const makeTransactional = () => {
    const prisma = createPrisma();
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
    return prisma;
  };

  it('returns a short-lived access code while persisting only its SHA-256 hash', async () => {
    const prisma = createPrisma();
    prisma.campusMapCollectionTask.findFirst.mockResolvedValue({ id: 'task-1', regionId: 'region-1' });
    prisma.campusMapCollectionTask.update.mockResolvedValue({ id: 'task-1' });
    const service = new CampusMapCollectionService(prisma as any);

    const result = await service.rotateAccessCode('region-1', 'task-1', 'admin-1');

    expect(result.accessCode).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(prisma.campusMapCollectionTask.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: {
        accessCodeHash: createHash('sha256').update(result.accessCode).digest('hex'),
        accessCodeExpiresAt: result.expiresAt,
      },
    });
  });

  it('rejects expired access codes before returning collector context', async () => {
    const prisma = createPrisma();
    prisma.campusMapCollectionTask.findFirst.mockResolvedValue({
      id: 'task-1',
      status: 'ready',
      accessCodeExpiresAt: new Date(Date.now() - 1_000),
      assignments: [{ userId: 'user-1' }],
    });
    const service = new CampusMapCollectionService(prisma as any);

    await expect(service.resolveCollectorContext('expired-code', 'user-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.campusMapMarkerTemplate.findMany).not.toHaveBeenCalled();
  });

  it('rejects an authenticated user who is not assigned to the task', async () => {
    const prisma = createPrisma();
    prisma.campusMapCollectionTask.findFirst.mockResolvedValue({
      id: 'task-1',
      status: 'ready',
      accessCodeExpiresAt: new Date(Date.now() + 60_000),
      assignments: [{ userId: 'another-user' }],
    });
    const service = new CampusMapCollectionService(prisma as any);

    await expect(service.resolveCollectorContext('valid-code', 'user-1'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns only collector-safe task fields in the mobile context', async () => {
    const prisma = createPrisma();
    prisma.campusMapCollectionTask.findFirst.mockResolvedValue({
      id: 'task-1',
      regionId: 'region-1',
      name: '一期道路采集',
      instructions: '沿道路中心线行走',
      status: 'ready',
      createdBy: 'admin-secret-id',
      accessCodeHash: 'private-hash',
      accessCodeExpiresAt: new Date(Date.now() + 60_000),
      assignments: [{ userId: 'user-1', assignedBy: 'admin-secret-id' }],
    });
    prisma.campusMapMarkerTemplate.findMany.mockResolvedValue([{
      id: 'template-1', regionId: 'region-1', label: '教学楼入口', description: null,
      icon: 'gate', color: '#137547', behavior: 'entrance', fieldSchema: [],
      allowedBindings: { targetTypes: ['building'], relationTypes: ['entrance_of'] },
      pinned: true, requirePhoto: false, requireNote: false, requireStationarySample: true,
      enabled: true, sortOrder: 1, createdBy: 'admin-secret-id', updatedBy: 'admin-secret-id',
    }]);
    const service = new CampusMapCollectionService(prisma as any);

    const result = await service.resolveCollectorContext('valid-code', 'user-1');

    expect(result.task).toEqual({
      id: 'task-1',
      regionId: 'region-1',
      name: '一期道路采集',
      instructions: '沿道路中心线行走',
      status: 'ready',
    });
    expect(result.task).not.toHaveProperty('createdBy');
    expect(result.task).not.toHaveProperty('assignments');
    expect(result.task).not.toHaveProperty('accessCodeHash');
    expect(result.templates[0]).not.toHaveProperty('createdBy');
    expect(result.templates[0]).not.toHaveProperty('updatedBy');
  });

  it('returns the existing owned session when a client retries the same session id', async () => {
    const prisma = createPrisma();
    const existing = {
      id: 'session-1',
      taskId: 'task-1',
      collectorUserId: 'user-1',
      clientSessionId: 'client-session-1',
    };
    prisma.campusMapCollectionSession.findUnique.mockResolvedValue(existing);
    const service = new CampusMapCollectionService(prisma as any);

    await expect(service.startSession('task-1', 'user-1', {
      clientSessionId: 'client-session-1',
      coordinateType: 'gcj02',
      startedAt: '2026-08-09T01:00:00.000Z',
      device: { model: 'Xiaomi 17 Pro' },
    })).resolves.toBe(existing);
    expect(prisma.campusMapCollectionSession.create).not.toHaveBeenCalled();
  });

  it('rejects oversized or invalid GCJ-02 point batches before writing', async () => {
    const prisma = makeTransactional();
    const service = new CampusMapCollectionService(prisma as any);
    const point = {
      clientPointId: 'point-1',
      pointSeq: 0,
      recordedAt: '2026-08-09T01:00:01.000Z',
      longitude: 106.5,
      latitude: 29.6,
      accuracy: 6,
    };

    await expect(service.uploadPointBatch('session-1', 'user-1', 0, {
      coordinateType: 'gcj02',
      points: Array.from({ length: 101 }, (_, index) => ({
        ...point,
        clientPointId: `point-${index}`,
        pointSeq: index,
      })),
    })).rejects.toBeInstanceOf(BadRequestException);

    await expect(service.uploadPointBatch('session-1', 'user-1', 0, {
      coordinateType: 'gcj02',
      points: [{ ...point, longitude: 999 }],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('acknowledges the same stored point ids when a batch is retried', async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findFirst.mockResolvedValue({
      id: 'session-1',
      collectorUserId: 'user-1',
      status: 'recording',
      lastBatchNo: -1,
    });
    prisma.campusMapCollectionPoint.createMany
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.campusMapCollectionPoint.findMany.mockResolvedValue([
      { clientPointId: 'point-1' },
      { clientPointId: 'point-2' },
    ]);
    prisma.campusMapCollectionPoint.count.mockResolvedValue(2);
    prisma.campusMapCollectionSession.update.mockResolvedValue({ id: 'session-1' });
    const service = new CampusMapCollectionService(prisma as any);
    const dto = {
      coordinateType: 'gcj02',
      points: [
        {
          clientPointId: 'point-1',
          pointSeq: 0,
          recordedAt: '2026-08-09T01:00:01.000Z',
          longitude: 106.5,
          latitude: 29.6,
          accuracy: 6,
        },
        {
          clientPointId: 'point-2',
          pointSeq: 1,
          recordedAt: '2026-08-09T01:00:02.000Z',
          longitude: 106.5001,
          latitude: 29.6001,
          accuracy: 7,
        },
      ],
    };

    const first = await service.uploadPointBatch('session-1', 'user-1', 0, dto);
    const retry = await service.uploadPointBatch('session-1', 'user-1', 0, dto);

    expect(first).toEqual({
      batchNo: 0,
      acknowledgedPointIds: ['point-1', 'point-2'],
      pointCount: 2,
    });
    expect(retry).toEqual(first);
  });

  it('keeps an incomplete session open when client and server counts differ', async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findFirst.mockResolvedValue({
      id: 'session-1',
      collectorUserId: 'user-1',
      status: 'recording',
      pointCount: 2,
      markerCount: 1,
      uploadComplete: false,
    });
    prisma.campusMapCollectionPoint.count.mockResolvedValue(2);
    prisma.campusMapCollectionMarker.count.mockResolvedValue(1);
    const service = new CampusMapCollectionService(prisma as any);

    await expect(service.finishSession('session-1', 'user-1', {
      clientPointCount: 3,
      clientMarkerCount: 1,
      endedAt: '2026-08-09T02:00:00.000Z',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.campusMapCollectionSession.update).not.toHaveBeenCalled();
  });

  it('finishes a fully uploaded session idempotently', async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findFirst
      .mockResolvedValueOnce({
        id: 'session-1',
        collectorUserId: 'user-1',
        status: 'recording',
        uploadComplete: false,
      })
      .mockResolvedValueOnce({
        id: 'session-1',
        collectorUserId: 'user-1',
        status: 'completed',
        uploadComplete: true,
        pointCount: 2,
        markerCount: 1,
        endedAt: new Date('2026-08-09T02:00:00.000Z'),
      });
    prisma.campusMapCollectionPoint.count.mockResolvedValue(2);
    prisma.campusMapCollectionMarker.count.mockResolvedValue(1);
    prisma.campusMapCollectionSession.update.mockResolvedValue({
      id: 'session-1',
      status: 'completed',
      uploadComplete: true,
      pointCount: 2,
      markerCount: 1,
      endedAt: new Date('2026-08-09T02:00:00.000Z'),
    });
    const service = new CampusMapCollectionService(prisma as any);
    const dto = {
      clientPointCount: 2,
      clientMarkerCount: 1,
      endedAt: '2026-08-09T02:00:00.000Z',
    };

    const first = await service.finishSession('session-1', 'user-1', dto);
    const retry = await service.finishSession('session-1', 'user-1', dto);

    expect(first).toMatchObject({ status: 'completed', uploadComplete: true, pointCount: 2, markerCount: 1 });
    expect(retry).toMatchObject({ status: 'completed', uploadComplete: true, pointCount: 2, markerCount: 1 });
    expect(prisma.campusMapCollectionSession.update).toHaveBeenCalledTimes(1);
  });

  it('stores an immutable template snapshot and multiple allowed bindings', async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findFirst.mockResolvedValue({
      id: 'session-1',
      collectorUserId: 'user-1',
      status: 'recording',
      task: { regionId: 'region-1' },
    });
    prisma.campusMapCollectionMarker.findUnique.mockResolvedValue(null);
    prisma.campusMapMarkerTemplate.findFirst.mockResolvedValue({
      id: 'template-1',
      regionId: 'region-1',
      label: '图书馆东门',
      icon: 'gate',
      color: '#dc2626',
      behavior: 'entrance',
      fieldSchema: [{ key: 'door', type: 'text', label: '门名称' }],
      requirePhoto: false,
      requireNote: false,
      requireStationarySample: false,
      allowedBindings: {
        targetTypes: ['building', 'entrance'],
        relationTypes: ['entrance_of', 'connects'],
      },
    });
    prisma.campusMapCollectionMarker.create.mockImplementation(({ data }: any) => ({ id: 'marker-1', ...data }));
    prisma.campusMapCollectionMarker.count.mockResolvedValue(1);
    prisma.campusMapCollectionSession.update.mockResolvedValue({ id: 'session-1' });
    const service = new CampusMapCollectionService(prisma as any);

    const result = await service.createMarker('session-1', 'user-1', {
      clientMarkerId: 'client-marker-1',
      templateId: 'template-1',
      recordedAt: '2026-08-09T01:10:00.000Z',
      longitude: 106.5,
      latitude: 29.6,
      accuracy: 5,
      fieldValues: { door: 'east' },
      bindings: [
        { targetType: 'building', targetId: 'building-29', relationType: 'entrance_of' },
        { targetType: 'entrance', targetId: 'entrance-east', relationType: 'connects' },
      ],
      attachments: [],
    });

    expect(result).toMatchObject({
      id: 'marker-1',
      templateLabelSnapshot: '图书馆东门',
      behaviorSnapshot: 'entrance',
    });
    expect(prisma.campusMapCollectionMarker.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        templateLabelSnapshot: '图书馆东门',
        templateIconSnapshot: 'gate',
        templateColorSnapshot: '#dc2626',
        behaviorSnapshot: 'entrance',
        bindings: {
          create: [
            { targetType: 'building', targetId: 'building-29', relationType: 'entrance_of' },
            { targetType: 'entrance', targetId: 'entrance-east', relationType: 'connects' },
          ],
        },
      }),
    });
  });

  it('rejects a marker whose required custom field is missing', async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionSession.findFirst.mockResolvedValue({
      id: 'session-1', collectorUserId: 'user-1', status: 'recording', task: { regionId: 'region-1' },
    });
    prisma.campusMapCollectionMarker.findUnique.mockResolvedValue(null);
    prisma.campusMapMarkerTemplate.findFirst.mockResolvedValue({
      id: 'template-1', label: '道路障碍', behavior: 'barrier', fieldSchema: [
        { key: 'passable', type: 'select', label: '是否可通行', required: true, options: ['可以', '不可以'] },
      ],
      requirePhoto: false, requireNote: false, requireStationarySample: false,
      allowedBindings: { targetTypes: [], relationTypes: [] },
    });
    const service = new CampusMapCollectionService(prisma as any);

    await expect(service.createMarker('session-1', 'user-1', {
      clientMarkerId: 'client-marker-1', templateId: 'template-1',
      recordedAt: '2026-08-09T01:10:00.000Z', longitude: 106.5, latitude: 29.6, accuracy: 5,
      fieldValues: {}, bindings: [], attachments: [],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.campusMapCollectionMarker.create).not.toHaveBeenCalled();
  });

  it('creates a scoped task with unique collector assignments', async () => {
    const prisma = makeTransactional();
    prisma.campusMapCollectionTask.create.mockImplementation(({ data }: any) => ({ id: 'task-1', ...data }));
    const service = new CampusMapCollectionService(prisma as any);

    const result = await service.createTask('region-1', {
      name: '一期步行道路采集',
      instructions: '从第三校门走到图书馆',
      status: 'ready',
      collectorUserIds: ['user-1', 'user-1', 'user-2'],
    }, 'admin-1');

    expect(result).toMatchObject({ id: 'task-1', regionId: 'region-1', status: 'ready' });
    expect(prisma.campusMapCollectionTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        regionId: 'region-1',
        name: '一期步行道路采集',
        createdBy: 'admin-1',
        assignments: {
          create: [
            { userId: 'user-1', assignedBy: 'admin-1' },
            { userId: 'user-2', assignedBy: 'admin-1' },
          ],
        },
      }),
      include: expect.any(Object),
    });
  });

  it('validates template behavior before persisting custom fields and bindings', async () => {
    const prisma = createPrisma();
    prisma.campusMapMarkerTemplate.create.mockImplementation(({ data }: any) => ({ id: 'template-1', ...data }));
    const service = new CampusMapCollectionService(prisma as any);
    const dto = {
      label: '雨天积水',
      behavior: 'passability_change',
      fieldSchema: [{ key: 'depth', type: 'number', label: '积水深度' }],
      allowedBindings: {
        targetTypes: ['road'],
        relationTypes: ['affects'],
      },
      color: '#eab308',
    };

    await expect(service.createTemplate('region-1', { ...dto, behavior: 'guess_route' }, 'admin-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createTemplate('region-1', {
      ...dto,
      fieldSchema: [{ key: 'bad key', type: 'magic', label: '' }],
    }, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
    const result = await service.createTemplate('region-1', dto, 'admin-1');

    expect(result).toMatchObject({ id: 'template-1', label: '雨天积水', behavior: 'passability_change' });
    expect(prisma.campusMapMarkerTemplate.create).toHaveBeenCalledTimes(1);
  });
});
