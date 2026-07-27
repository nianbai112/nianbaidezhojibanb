import { Test } from '@nestjs/testing';
import { RequestMethod } from '@nestjs/common';
import { MallAdminController } from './mall-admin.controller';
import { MallAdminService } from './mall-admin.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';

// AUD-P1-183 回归（商城后台路由层）：
// 1) 之前重复暴露、允许“客户端传什么状态就写什么”的单独 PATCH 旁路路由
//    patchOrderStatus 已删除，控制器上不再存在；
// 2) 仅保留一套 PUT+PATCH 的 updateOrderStatus，且必须绑定 mall:edit 权限；
// 3) 控制器正确把请求转发给 MallAdminService.updateOrderStatus（由服务层落实资金终态防护）。

const mockJwtGuard = { canActivate: jest.fn().mockResolvedValue(true) };
const mockAdminGuard = { canActivate: jest.fn().mockResolvedValue(true) };
const mockAdminPermissionGuard = { canActivate: jest.fn().mockResolvedValue(true) };
const mockService: any = {
  updateOrderStatus: jest.fn(),
  deliverOrder: jest.fn(),
};

function hasMethod(methods: any, m: RequestMethod): boolean {
  if (typeof methods === 'number') return (methods & m) === m;
  return Array.isArray(methods) && methods.includes(m);
}

describe('MallAdminController - AUD-P1-183 通用状态路由防护', () => {
  let controller: MallAdminController;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockJwtGuard.canActivate.mockResolvedValue(true);
    mockAdminGuard.canActivate.mockResolvedValue(true);
    mockAdminPermissionGuard.canActivate.mockResolvedValue(true);

    const module = await Test.createTestingModule({
      controllers: [MallAdminController],
      providers: [{ provide: MallAdminService, useValue: mockService }],
    })
      .overrideGuard(JwtGuard)
      .useValue(mockJwtGuard)
      .overrideGuard(AdminGuard)
      .useValue(mockAdminGuard)
      .overrideGuard(AdminPermissionGuard)
      .useValue(mockAdminPermissionGuard)
      .compile();

    controller = module.get<MallAdminController>(MallAdminController);
  });

  // ===== 核心：重复的 PATCH 旁路已移除 =====
  it('控制器原型上不存在重复的 patchOrderStatus 方法（防“传什么写什么”旁路复活）', () => {
    expect((MallAdminController.prototype as any).patchOrderStatus).toBeUndefined();
  });

  // ===== 仅保留一套受 mall:edit 保护的 updateOrderStatus 路由 =====
  it('updateOrderStatus 路由存在，路径为 orders/admin/:id/status，且要求 mall:edit', () => {
    const proto = MallAdminController.prototype as any;
    expect(proto.updateOrderStatus).toBeDefined();
    expect(Reflect.getMetadata('path', proto.updateOrderStatus)).toBe('orders/admin/:id/status');

    // 注：Nest 对同一方法的多个 HTTP 方法装饰器采用“最后生效”语义，
    // 本仓库实际注册的是 PUT（管理后台前端 MallOrdersPage.vue 正是用 request.put 调用），
    // 故断言 PUT 已注册即可；PATCH 不构成实际路由（此前由已删除的脆弱 patchOrderStatus 承担，现已移除）。
    const methods = Reflect.getMetadata('method', proto.updateOrderStatus);
    expect(hasMethod(methods, RequestMethod.PUT)).toBe(true);

    const perms = Reflect.getMetadata('admin_permissions', proto.updateOrderStatus);
    expect(perms).toContain('mall:edit');
  });

  // ===== 控制器转发契约：请求正确落到服务层，由服务层落实资金终态防护 =====
  it('调用 updateOrderStatus 会把 {id, dto, operatorId, ip} 转发给 MallAdminService', async () => {
    mockService.updateOrderStatus.mockResolvedValue({ success: true, data: {} });

    await controller.updateOrderStatus(
      'order1',
      { status: 'cancelled', reason: '用户申请' },
      'op1',
      { ip: '1.2.3.4' } as any,
    );

    expect(mockService.updateOrderStatus).toHaveBeenCalledWith(
      'order1',
      { status: 'cancelled', reason: '用户申请' },
      'op1',
      '1.2.3.4',
    );
  });

  // ===== 发货专用接口保留且同样受 mall:edit 保护（验证未误删合法能力）=====
  it('deliverOrder（发货）路由保留且受 mall:edit 保护', () => {
    const proto = MallAdminController.prototype as any;
    expect(proto.deliverOrder).toBeDefined();
    const perms = Reflect.getMetadata('admin_permissions', proto.deliverOrder);
    expect(perms).toContain('mall:edit');
  });
});
