import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, RequestMethod } from '@nestjs/common';
import { CampusMapController } from './campus-map.controller';
import { CampusMapImportService } from './campus-map-import.service';
import { CampusMapService } from './campus-map.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { AdminDataScopeService } from '../../common/services/admin-data-scope.service';

// 校园地图安全回归：`GET campus-map/active` 曾无任何守卫，任何人可用 region_id
// 遍历拉取全部校区地图数据（含 inlineData 全量要素坐标与名称）。
// 小程序不登录 + 未通过学生认证根本进不了首页，匿名访问只对爬虫有价值，
// 因此该路由必须绑定 JwtGuard；但它是 C 端普通用户接口，不得绑定管理端守卫。

const mockJwtGuard = { canActivate: jest.fn().mockResolvedValue(true) };
const mockAdminGuard = { canActivate: jest.fn().mockResolvedValue(true) };
const mockAdminPermissionGuard = { canActivate: jest.fn().mockResolvedValue(true) };
const mockService = {
  getActiveMap: jest.fn(),
  getRegionMap: jest.fn(),
  upsertRegionMap: jest.fn(),
  saveDraft: jest.fn(),
  publishDraft: jest.fn(),
  listVersions: jest.fn(),
  rollbackVersion: jest.fn(),
  disableRegionMap: jest.fn(),
};
const mockImportService = {
  getConverterStatus: jest.fn(),
  createImport: jest.fn(),
  listImports: jest.fn(),
  getImport: jest.fn(),
  retryImportJob: jest.fn(),
  deleteImportJob: jest.fn(),
};
const mockScope = {
  assertRegionAccess: jest.fn().mockResolvedValue(undefined),
};

describe('CampusMapController - 公开接口登录校验回归', () => {
  let controller: CampusMapController;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockJwtGuard.canActivate.mockResolvedValue(true);
    mockAdminGuard.canActivate.mockResolvedValue(true);
    mockAdminPermissionGuard.canActivate.mockResolvedValue(true);
    mockScope.assertRegionAccess.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CampusMapController],
      providers: [
        { provide: CampusMapService, useValue: mockService },
        { provide: CampusMapImportService, useValue: mockImportService },
        { provide: AdminDataScopeService, useValue: mockScope },
      ],
    })
      .overrideGuard(JwtGuard)
      .useValue(mockJwtGuard)
      .overrideGuard(AdminGuard)
      .useValue(mockAdminGuard)
      .overrideGuard(AdminPermissionGuard)
      .useValue(mockAdminPermissionGuard)
      .compile();

    controller = module.get<CampusMapController>(CampusMapController);
  });

  it('getActiveMap 路由元数据为 GET campus-map/active', () => {
    const proto = CampusMapController.prototype as any;
    expect(Reflect.getMetadata('path', proto.getActiveMap)).toBe('campus-map/active');
    expect(Reflect.getMetadata('method', proto.getActiveMap)).toBe(RequestMethod.GET);
  });

  it('getActiveMap 已绑定 JwtGuard（不再允许匿名访问）', () => {
    const proto = CampusMapController.prototype as any;
    const guards = Reflect.getMetadata('__guards__', proto.getActiveMap);
    expect(guards).toBeDefined();
    expect(guards).toContain(JwtGuard);
  });

  it('getActiveMap 不得绑定管理端守卫（普通登录用户必须能访问）', () => {
    const proto = CampusMapController.prototype as any;
    const guards = Reflect.getMetadata('__guards__', proto.getActiveMap) || [];
    expect(guards).not.toContain(AdminGuard);
    expect(guards).not.toContain(AdminPermissionGuard);
  });

  it('登录后仍可按 region_id / regionId 读取活动地图', async () => {
    mockService.getActiveMap.mockResolvedValue({ enabled: true, mapId: 'region-map' });

    await controller.getActiveMap('region-1');
    expect(mockService.getActiveMap).toHaveBeenCalledWith('region-1');

    await controller.getActiveMap(undefined, 'region-2');
    expect(mockService.getActiveMap).toHaveBeenCalledWith('region-2');
  });

  it.each([
    ['读取地图', (req: any) => (controller as any).getAdminRegionMap('region-1', req)],
    ['兼容发布', (req: any) => (controller as any).upsertAdminRegionMap('region-1', { enabled: false }, req)],
    ['保存草稿', (req: any) => (controller as any).saveAdminRegionMapDraft('region-1', { config: { enabled: false } }, req)],
    ['发布草稿', (req: any) => (controller as any).publishAdminRegionMapDraft('region-1', { revision: 1 }, req)],
    ['读取版本', (req: any) => (controller as any).listAdminRegionMapVersions('region-1', '1', '20', req)],
    ['回滚版本', (req: any) => (controller as any).rollbackAdminRegionMapVersion('region-1', 'version-1', req)],
    ['创建导入', (req: any) => (controller as any).createImportJob('region-1', undefined, req)],
    ['读取导入列表', (req: any) => (controller as any).listImportJobs('region-1', req)],
    ['读取导入详情', (req: any) => (controller as any).getImportJob('region-1', 'job-1', req)],
    ['重试导入', (req: any) => (controller as any).retryImportJob('region-1', 'job-1', req)],
    ['删除导入', (req: any) => (controller as any).deleteImportJob('region-1', 'job-1', req)],
    ['停用地图', (req: any) => (controller as any).disableAdminRegionMap('region-1', req)],
  ])('%s 前先校验管理员区域数据范围', async (_label, invoke) => {
    const req = { user: { sub: 'admin-1' } } as any;
    await invoke(req);
    expect(mockScope.assertRegionAccess).toHaveBeenCalledWith('admin-1', 'region-1');
  });

  it('区域权限拒绝后不会读取校园地图业务数据', async () => {
    mockScope.assertRegionAccess.mockRejectedValueOnce(new ForbiddenException('无权访问该区域数据'));

    await expect((controller as any).getAdminRegionMap('region-1', {
      user: { sub: 'admin-1' },
    })).rejects.toThrow('无权访问该区域数据');

    expect(mockService.getRegionMap).not.toHaveBeenCalled();
  });

  it('版本化发布工作流路由使用明确的方法与路径', () => {
    const proto = CampusMapController.prototype as any;
    expect(Reflect.getMetadata('path', proto.saveAdminRegionMapDraft)).toBe('admin/campus-map/:regionId/draft');
    expect(Reflect.getMetadata('method', proto.saveAdminRegionMapDraft)).toBe(RequestMethod.PUT);
    expect(Reflect.getMetadata('path', proto.publishAdminRegionMapDraft)).toBe('admin/campus-map/:regionId/publish');
    expect(Reflect.getMetadata('method', proto.publishAdminRegionMapDraft)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata('path', proto.listAdminRegionMapVersions)).toBe('admin/campus-map/:regionId/versions');
    expect(Reflect.getMetadata('method', proto.listAdminRegionMapVersions)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata('path', proto.rollbackAdminRegionMapVersion)).toBe('admin/campus-map/:regionId/versions/:versionId/rollback');
    expect(Reflect.getMetadata('method', proto.rollbackAdminRegionMapVersion)).toBe(RequestMethod.POST);
  });
});
