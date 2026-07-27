import { Test, TestingModule } from '@nestjs/testing';
import { RequestMethod } from '@nestjs/common';
import { MembershipController } from './membership.controller';
import { MembershipService } from './membership.service';
import { JwtGuard } from '../../guards/jwt.guard';

// AUD-P1-054 回归：用户端不得再暴露 `POST membership/benefits/use` 直扣路由。
// 付费会员权益（免费置顶/二手刷新/活动券等）只能由后端业务服务内部消费，
// 禁止由任意登录用户绕过业务流程直接消耗。

const mockJwtGuard = { canActivate: jest.fn().mockResolvedValue(true) };
const mockMembershipService = {
  getCenter: jest.fn(),
  createOrder: jest.fn(),
  getUserBenefits: jest.fn(),
  consumeBenefit: jest.fn(),
  consumeBenefitWithDb: jest.fn(),
};

describe('MembershipController - AUD-P1-054 安全回归', () => {
  let controller: MembershipController;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockJwtGuard.canActivate.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MembershipController],
      providers: [{ provide: MembershipService, useValue: mockMembershipService }],
    })
      .overrideGuard(JwtGuard)
      .useValue(mockJwtGuard)
      .compile();

    controller = module.get<MembershipController>(MembershipController);
  });

  // ===== 核心：旁路路由已移除 =====
  describe('AUD-P1-054：用户端直扣路由 benefits/use 已移除', () => {
    it('控制器原型上不存在 useBenefit 方法', () => {
      expect((MembershipController.prototype as any).useBenefit).toBeUndefined();
    });

    it('控制器上不存在任何 POST 路径为 benefits/use 的路由（防止换名重新暴露）', () => {
      const proto = MembershipController.prototype as any;
      const methodNames = Object.getOwnPropertyNames(proto).filter(
        (n) => n !== 'constructor',
      );
      for (const name of methodNames) {
        const path = Reflect.getMetadata('path', proto[name]);
        const method = Reflect.getMetadata('method', proto[name]);
        if (path === 'benefits/use' && method === RequestMethod.POST) {
          throw new Error(
            `检测到 POST membership/benefits/use 路由（方法 ${name}），AUD-P1-054 旁路未修复`,
          );
        }
      }
      expect(true).toBe(true);
    });
  });

  // ===== 合法会员路由不受影响且仍受 JwtGuard 保护 =====
  describe('合法会员路由完整性', () => {
    it('getCenter / createOrder / benefits 路由仍存在', () => {
      expect((MembershipController.prototype as any).getCenter).toBeDefined();
      expect((MembershipController.prototype as any).createOrder).toBeDefined();
      expect((MembershipController.prototype as any).benefits).toBeDefined();
    });

    it('合法路由均绑定 JwtGuard', () => {
      const proto = MembershipController.prototype as any;
      for (const name of ['getCenter', 'createOrder', 'benefits']) {
        const guards = Reflect.getMetadata('__guards__', proto[name]);
        expect(guards).toBeDefined();
        expect(guards).toContain(JwtGuard);
      }
    });

    it('getCenter 路由元数据为 GET center', () => {
      const proto = MembershipController.prototype as any;
      expect(Reflect.getMetadata('path', proto.getCenter)).toBe('center');
      expect(Reflect.getMetadata('method', proto.getCenter)).toBe(RequestMethod.GET);
    });
  });

  // ===== 内部业务扣减入口未被破坏 =====
  describe('内部业务扣减入口保留', () => {
    it('MembershipService.consumeBenefit / consumeBenefitWithDb 仍存在（mall/shop/errand/activity/topup/operation 依赖）', () => {
      expect(typeof (MembershipService.prototype as any).consumeBenefit).toBe('function');
      expect(typeof (MembershipService.prototype as any).consumeBenefitWithDb).toBe(
        'function',
      );
    });

    it('控制器实例可正常构造且依赖注入成功', () => {
      expect(controller).toBeInstanceOf(MembershipController);
    });
  });
});
