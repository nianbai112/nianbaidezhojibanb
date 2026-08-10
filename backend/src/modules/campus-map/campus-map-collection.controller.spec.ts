import { ForbiddenException, RequestMethod } from '@nestjs/common';
import { CampusMapCollectionController } from './campus-map-collection.controller';
import { CampusMapCollectionService } from './campus-map-collection.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';

describe('CampusMapCollectionController', () => {
  const service = {
    createTask: jest.fn(),
    listTasks: jest.fn(),
    getTask: jest.fn(),
    getSession: jest.fn(),
    updateTask: jest.fn(),
    rotateAccessCode: jest.fn(),
    listTemplates: jest.fn(),
    createTemplate: jest.fn(),
    updateTemplate: jest.fn(),
    listRiderTasks: jest.fn(),
    getRiderTask: jest.fn(),
    startRiderSession: jest.fn(),
    resolveCollectorContext: jest.fn(),
    startSession: jest.fn(),
    uploadPointBatch: jest.fn(),
    createMarker: jest.fn(),
    finishSession: jest.fn(),
  };
  const scope = { assertRegionAccess: jest.fn() };
  const upload = { generateQrcode: jest.fn() };
  let controller: CampusMapCollectionController;

  beforeEach(() => {
    jest.clearAllMocks();
    scope.assertRegionAccess.mockResolvedValue(undefined);
    controller = new CampusMapCollectionController(
      service as unknown as CampusMapCollectionService,
      scope as any,
      upload as any,
    );
  });

  it('registers separated admin and collector routes with the expected guards', () => {
    const proto = CampusMapCollectionController.prototype as any;
    expect(Reflect.getMetadata('path', proto.listTasks)).toBe('admin/campus-map/collections/:regionId/tasks');
    expect(Reflect.getMetadata('method', proto.listTasks)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata('admin_permissions', proto.listTasks)).toEqual(['region:view']);
    expect(Reflect.getMetadata('__guards__', proto.listTasks)).toEqual(expect.arrayContaining([
      JwtGuard,
      AdminGuard,
      AdminPermissionGuard,
    ]));

    expect(Reflect.getMetadata('path', proto.resolveCollectorContext)).toBe('campus-map/collection/context');
    expect(Reflect.getMetadata('__guards__', proto.resolveCollectorContext)).toEqual([JwtGuard]);
    expect(Reflect.getMetadata('path', proto.uploadPointBatch)).toBe('campus-map/collection/sessions/:sessionId/batches/:batchNo');
    expect(Reflect.getMetadata('method', proto.uploadPointBatch)).toBe(RequestMethod.PUT);
  });

  it('registers rider task discovery and rider session routes behind JWT auth', () => {
    const proto = CampusMapCollectionController.prototype as any;
    expect(Reflect.getMetadata('path', proto.listRiderTasks)).toBe('rider-app/campus-collection/tasks');
    expect(Reflect.getMetadata('__guards__', proto.listRiderTasks)).toEqual([JwtGuard]);
    expect(Reflect.getMetadata('path', proto.getRiderTask)).toBe('rider-app/campus-collection/tasks/:taskId');
    expect(Reflect.getMetadata('path', proto.startRiderSession)).toBe('rider-app/campus-collection/tasks/:taskId/sessions');
  });

  it('checks admin region scope before reading task data', async () => {
    scope.assertRegionAccess.mockRejectedValue(new ForbiddenException('无权访问该区域数据'));

    await expect(controller.getTask('region-1', 'task-1', { user: { sub: 'admin-1' } } as any))
      .rejects.toThrow('无权访问该区域数据');
    expect(service.getTask).not.toHaveBeenCalled();
  });

  it('passes the scoped admin id into task creation', async () => {
    service.createTask.mockResolvedValue({ id: 'task-1' });
    const dto = { name: '一期道路采集', status: 'draft' };

    await controller.createTask('region-1', dto, { user: { sub: 'admin-1' } } as any);

    expect(scope.assertRegionAccess).toHaveBeenCalledWith('admin-1', 'region-1');
    expect(service.createTask).toHaveBeenCalledWith('region-1', dto, 'admin-1');
  });

  it('returns a real mini-program code for the short-lived collector scene', async () => {
    service.rotateAccessCode.mockResolvedValue({ accessCode: 'scene-code', expiresAt: new Date('2026-08-09T01:30:00Z') });
    upload.generateQrcode.mockResolvedValue({ url: 'https://files/collector-code.jpg' });

    const result = await controller.rotateAccessCode('region-1', 'task-1', { user: { sub: 'admin-1' } } as any);

    expect(upload.generateQrcode).toHaveBeenCalledWith({
      scene: 'scene-code', page: 'campusMap/collector/index', width: 430,
    });
    expect(result).toMatchObject({
      qrcodeUrl: 'https://files/collector-code.jpg',
      collectorPath: '/campusMap/collector/index?code=scene-code',
    });
  });

  it('rejects admin JWTs from collector routes before calling the service', () => {
    expect(() => controller.resolveCollectorContext('code-1', {
      user: { sub: 'admin-1', isAdmin: true },
    } as any)).toThrow('采集端不接受管理员登录态');
    expect(service.resolveCollectorContext).not.toHaveBeenCalled();
  });

  it('passes the ordinary user id through every collector write', async () => {
    const req = { user: { sub: 'user-1', isAdmin: false } } as any;
    await controller.startSession('task-1', { clientSessionId: 'client-1' } as any, req);
    await controller.uploadPointBatch('session-1', '3', { points: [] } as any, req);
    await controller.createMarker('session-1', { clientMarkerId: 'marker-1' } as any, req);
    await controller.finishSession('session-1', { clientPointCount: 0, clientMarkerCount: 0 } as any, req);

    expect(service.startSession).toHaveBeenCalledWith('task-1', 'user-1', expect.any(Object));
    expect(service.uploadPointBatch).toHaveBeenCalledWith('session-1', 'user-1', 3, expect.any(Object));
    expect(service.createMarker).toHaveBeenCalledWith('session-1', 'user-1', expect.any(Object));
    expect(service.finishSession).toHaveBeenCalledWith('session-1', 'user-1', expect.any(Object));
  });

  it('does not expose update or delete handlers for immutable raw points', () => {
    const proto = CampusMapCollectionController.prototype as any;
    expect(proto.updateRawPoint).toBeUndefined();
    expect(proto.deleteRawPoint).toBeUndefined();
  });
});
