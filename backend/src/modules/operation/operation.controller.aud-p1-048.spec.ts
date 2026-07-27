import { Test, TestingModule } from '@nestjs/testing';
import { RequestMethod, GoneException } from '@nestjs/common';
import { OperationController } from './operation.controller';
import { OperationService } from './operation.service';
import { JwtGuard } from '../../guards/jwt.guard';

// AUD-P1-048 回归：
// 1) 用户端 `POST circle/user-titles/purchase/:titleId` 直领路由已移除（付费购买 alias 直领 claimTitle）。
// 2) 用户端自助领取 `POST circle/user-titles/claim/:titleId` 已固定拒绝（410），绝不写入 userTitleRecord。
//    产品当前没有 UserTitle.price / 订单 / 支付模型，付费称号支付系统未建设；
//    称号仅允许后台人工发放与现有兑换码发放。结构化获取条件校验为独立更大项。

const mockJwtGuard = { canActivate: jest.fn().mockResolvedValue(true) };
const mockOperationService = {
  claimTitle: jest.fn(),
  wearTitle: jest.fn(),
  unwearTitle: jest.fn(),
  useRedeemCode: jest.fn(),
  getUserTitles: jest.fn(),
  getCommunityDetail: jest.fn(),
};

describe('OperationController - AUD-P1-048 安全回归', () => {
  let controller: OperationController;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockJwtGuard.canActivate.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OperationController],
      providers: [{ provide: OperationService, useValue: mockOperationService }],
    })
      .overrideGuard(JwtGuard)
      .useValue(mockJwtGuard)
      .compile();

    controller = module.get<OperationController>(OperationController);
  });

  // ===== 核心：付费称号直领路由已移除 =====
  describe('AUD-P1-048：用户端付费称号直领路由 purchase/:titleId 已移除', () => {
    it('控制器原型上不存在 purchaseTitle 方法', () => {
      expect((OperationController.prototype as any).purchaseTitle).toBeUndefined();
    });

    it('控制器上不存在任何 POST 路径为 circle/user-titles/purchase/:titleId 的路由（防止换名重新暴露）', () => {
      const proto = OperationController.prototype as any;
      const methodNames = Object.getOwnPropertyNames(proto).filter(
        (n) => n !== 'constructor',
      );
      for (const name of methodNames) {
        const path = Reflect.getMetadata('path', proto[name]);
        const method = Reflect.getMetadata('method', proto[name]);
        if (path === 'circle/user-titles/purchase/:titleId' && method === RequestMethod.POST) {
          throw new Error(
            `检测到 POST circle/user-titles/purchase/:titleId 路由（方法 ${name}），AUD-P1-048 未修复`,
          );
        }
      }
      expect(true).toBe(true);
    });
  });

  // ===== 自助领取入口已固定拒绝（410），绝不写 UserTitleRecord =====
  describe('AUD-P1-048：用户端自助领取 claim/:titleId 已固定拒绝（410）', () => {
    it('claimTitle 路由仍存在且绑定 JwtGuard（入口保留但拒绝）', () => {
      const proto = OperationController.prototype as any;
      expect((OperationController.prototype as any).claimTitle).toBeDefined();
      expect(Reflect.getMetadata('path', proto.claimTitle)).toBe(
        'circle/user-titles/claim/:titleId',
      );
      expect(Reflect.getMetadata('method', proto.claimTitle)).toBe(RequestMethod.POST);
      const guards = Reflect.getMetadata('__guards__', proto.claimTitle);
      expect(guards).toBeDefined();
      expect(guards).toContain(JwtGuard);
    });

    it('普通用户调用 claim 固定返回 410（自助领取已关闭）', async () => {
      let caught: any = null;
      try {
        await controller.claimTitle('title-x', 'user-x');
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(GoneException);
      expect(caught.getStatus()).toBe(410);
    });

    it('claimTitle 不调用 service.claimTitle，绝不写入 UserTitleRecord', async () => {
      try {
        await controller.claimTitle('title-x', 'user-x');
      } catch (e) {
        // 预期抛 GoneException，忽略
      }
      expect(mockOperationService.claimTitle).not.toHaveBeenCalled();
    });
  });

  // ===== 已拥有称号佩戴、兑换码发放不受影响 =====
  describe('AUD-P1-048：佩戴与兑换码链路不受影响', () => {
    it('wearTitle（佩戴）路由存在且受 JwtGuard 保护——已拥有称号仍可佩戴', () => {
      const proto = OperationController.prototype as any;
      expect(Reflect.getMetadata('path', proto.wearTitle)).toBe(
        'circle/user-titles/wear/:titleId',
      );
      expect(Reflect.getMetadata('method', proto.wearTitle)).toBe(RequestMethod.POST);
      const guards = Reflect.getMetadata('__guards__', proto.wearTitle);
      expect(guards).toBeDefined();
      expect(guards).toContain(JwtGuard);
    });

    it('useRedeemCode（兑换码发放）路由存在且受 JwtGuard 保护——兑换码链路不受影响', () => {
      const proto = OperationController.prototype as any;
      expect(Reflect.getMetadata('path', proto.useRedeemCode)).toBe(
        'circle/user-titles/redeem-codes/use',
      );
      expect(Reflect.getMetadata('method', proto.useRedeemCode)).toBe(RequestMethod.POST);
      const guards = Reflect.getMetadata('__guards__', proto.useRedeemCode);
      expect(guards).toBeDefined();
      expect(guards).toContain(JwtGuard);
    });
  });

  it('控制器实例可正常构造且依赖注入成功', () => {
    expect(controller).toBeInstanceOf(OperationController);
  });
});
