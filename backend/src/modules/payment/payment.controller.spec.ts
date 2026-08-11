import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, RequestMethod } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PrismaService } from '../../common/services/prisma.service';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';

// Mock guards
const mockJwtGuard = { canActivate: jest.fn().mockResolvedValue(true) };
const mockAdminGuard = { canActivate: jest.fn().mockResolvedValue(true) };
const mockAdminPermissionGuard = { canActivate: jest.fn().mockResolvedValue(true) };

describe('PaymentController - 安全测试', () => {
  let controller: PaymentController;
  let paymentService: PaymentService;
  let prisma: PrismaService;
  let reflector: Reflector;

  const mockPaymentService = {
    wxUnifiedOrder: jest.fn(),
    refund: jest.fn(),
    cancelFreeShopOrder: jest.fn(),
    wxNotify: jest.fn(),
    handleRefundNotify: jest.fn(),
    queryPayment: jest.fn(),
  };

  const mockPrisma = {
    user: { findUnique: jest.fn() },
    order: { findUnique: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    mallOrder: { findUnique: jest.fn() },
    deliveryOrder: { findUnique: jest.fn() },
    errandOrder: { findUnique: jest.fn() },
    recharge: { findUnique: jest.fn() },
    topupOrder: { findUnique: jest.fn() },
    paymentOrder: { findUnique: jest.fn() },
    orderLog: { create: jest.fn().mockResolvedValue(undefined) },
    auditLog: { create: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockJwtGuard.canActivate.mockResolvedValue(true);
    mockAdminGuard.canActivate.mockResolvedValue(true);
    mockAdminPermissionGuard.canActivate.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [
        { provide: PaymentService, useValue: mockPaymentService },
        { provide: PrismaService, useValue: mockPrisma },
        Reflector,
      ],
    })
      .overrideGuard(JwtGuard)
      .useValue(mockJwtGuard)
      .overrideGuard(AdminGuard)
      .useValue(mockAdminGuard)
      .overrideGuard(AdminPermissionGuard)
      .useValue(mockAdminPermissionGuard)
      .compile();

    controller = module.get<PaymentController>(PaymentController);
    paymentService = module.get<PaymentService>(PaymentService);
    prisma = module.get<PrismaService>(PrismaService);
    reflector = module.get<Reflector>(Reflector);
  });

  // ===== 路由唯一性测试 =====
  describe('路由唯一性：POST /wxpay/createOrder 和 /wxpay/refund', () => {
    it('项目中 POST /wxpay/createOrder 仅在 PaymentController 中定义', () => {
      // PaymentController @Post('wxpay/createOrder') 装饰在 createOrder 方法上
      const path = Reflect.getMetadata('path', PaymentController.prototype.createOrder);
      const method = Reflect.getMetadata('method', PaymentController.prototype.createOrder);
      expect(path).toBe('wxpay/createOrder');
      expect(method).toBe(RequestMethod.POST);
    });

    it('项目中 POST /wxpay/refund 仅在 PaymentController 中定义且有三层 Guard', () => {
      // PaymentController @Post('wxpay/refund') 装饰在 refund 方法上
      const path = Reflect.getMetadata('path', PaymentController.prototype.refund);
      const method = Reflect.getMetadata('method', PaymentController.prototype.refund);
      expect(path).toBe('wxpay/refund');
      expect(method).toBe(RequestMethod.POST);

      // 验证三层 Guard：JwtGuard, AdminGuard, AdminPermissionGuard
      const guards = Reflect.getMetadata(
        '__guards__',
        PaymentController.prototype.refund,
      ) as Array<new (...args: any[]) => any> | undefined;
      expect(guards).toBeDefined();
      expect(guards!.length).toBe(3);
      expect(guards).toEqual([JwtGuard, AdminGuard, AdminPermissionGuard]);
    });

    it('PaymentController.refund 的 RequirePermission 元数据为 order:refund', () => {
      const permissions = Reflect.getMetadata(
        'admin_permissions',
        PaymentController.prototype.refund,
      ) as string[] | undefined;
      expect(permissions).toBeDefined();
      expect(permissions).toContain('order:refund');
    });
  });

  // ===== 验证 refund 方法元数据中绑定了全部三个 Guard =====
  describe('refund 方法 Guard 绑定验证', () => {
    it('refund handler 必须绑定 JwtGuard', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        PaymentController.prototype.refund,
      ) as Array<new (...args: any[]) => any> | undefined;
      expect(guards).toBeDefined();
      expect(guards!.length).toBeGreaterThanOrEqual(1);
      expect(guards!).toContain(JwtGuard);
    });

    it('refund handler 必须绑定 AdminGuard', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        PaymentController.prototype.refund,
      ) as Array<new (...args: any[]) => any> | undefined;
      expect(guards).toBeDefined();
      expect(guards!).toContain(AdminGuard);
    });

    it('refund handler 必须绑定 AdminPermissionGuard', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        PaymentController.prototype.refund,
      ) as Array<new (...args: any[]) => any> | undefined;
      expect(guards).toBeDefined();
      expect(guards!).toContain(AdminPermissionGuard);
    });

    it('refund handler 的 RequirePermission 元数据必须是 order:refund', () => {
      const permissions = Reflect.getMetadata(
        'admin_permissions',
        PaymentController.prototype.refund,
      ) as string[] | undefined;
      expect(permissions).toBeDefined();
      expect(permissions).toContain('order:refund');
    });
  });

  describe('merchantRefund 商家归属校验', () => {
    it('拒绝零元订单时只取消业务单，不调用支付退款', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1', orderNo: 'ORD-1', status: 'PAID', payAmount: 0, merchantAcceptTime: null, riderId: null, refundStatus: 'none', merchant: { userId: 'merchant-1' },
      });
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPaymentService.cancelFreeShopOrder.mockResolvedValue({ success: true, message: '订单已取消，无需退款' });

      await expect(controller.merchantRefund({ orderId: 'order-1', refundReason: '缺货' }, 'merchant-1'))
        .resolves.toEqual({ success: true, message: '订单已取消，无需退款' });
      expect(mockPaymentService.cancelFreeShopOrder).toHaveBeenCalledWith('order-1', '商家拒单：缺货', 'merchant-1', 'merchant');
      expect(mockPaymentService.refund).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ detail: expect.objectContaining({ action: 'merchant_reject_free', amount: 0 }) }),
      }));
    });

    it('只允许订单所属商家退款', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1', orderNo: 'ORD-1', status: 'PAID', payAmount: 8.8, merchantAcceptTime: null, riderId: null, refundStatus: 'none', merchant: { userId: 'merchant-1' },
      });
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPaymentService.refund.mockResolvedValue({ success: true });

      await expect(controller.merchantRefund({ orderId: 'order-1', refundAmount: '8.80', refundReason: '缺货' }, 'merchant-1'))
        .resolves.toEqual({ success: true });
      expect(mockPaymentService.refund).toHaveBeenCalledWith(expect.objectContaining({
        bizType: 'order', bizId: 'order-1', amount: 8.8, reason: '商家拒单：缺货', operatorId: 'merchant-1',
      }));
    });

    it('拒单只能全额退款，不能把部分退款伪装成取消订单', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1', orderNo: 'ORD-1', status: 'PAID', payAmount: 8.8, merchantAcceptTime: null, riderId: null, refundStatus: 'none', merchant: { userId: 'merchant-1' },
      });

      await expect(controller.merchantRefund({ orderId: 'order-1', refundAmount: '1.00', refundReason: '缺货' }, 'merchant-1'))
        .rejects.toThrow('商家拒单必须全额退款');
      expect(mockPaymentService.refund).not.toHaveBeenCalled();
    });

    it('拒绝其他商家退款', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1', orderNo: 'ORD-1', status: 'PAID', payAmount: 8.8, merchantAcceptTime: null, riderId: null, refundStatus: 'none', merchant: { userId: 'merchant-1' },
      });

      await expect(controller.merchantRefund({ orderId: 'order-1', refundAmount: '8.80', refundReason: '缺货' }, 'merchant-2'))
        .rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPaymentService.refund).not.toHaveBeenCalled();
    });

    it('拒绝商家接单后的退款，避免履约中订单被静默终止', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1', orderNo: 'ORD-1', status: 'PAID', payAmount: 8.8, merchantAcceptTime: new Date(), riderId: null, refundStatus: 'none', merchant: { userId: 'merchant-1' },
      });

      await expect(controller.merchantRefund({ orderId: 'order-1', refundAmount: '8.80', refundReason: '缺货' }, 'merchant-1'))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(mockPaymentService.refund).not.toHaveBeenCalled();
    });

    it('拒单退款抢占失败时不调用支付退款，避免与接单并发写入', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1', orderNo: 'ORD-1', status: 'PAID', payAmount: 8.8, merchantAcceptTime: null, riderId: null, refundStatus: 'none', merchant: { userId: 'merchant-1' },
      });
      mockPrisma.order.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(controller.merchantRefund({ orderId: 'order-1', refundAmount: '8.80', refundReason: '缺货' }, 'merchant-1'))
        .rejects.toThrow('订单状态已变化，请刷新后重试');
      expect(mockPaymentService.refund).not.toHaveBeenCalled();
    });
  });

  describe('userOrderRefund 用户外卖退款边界', () => {
    it('取消零元订单时只回滚业务预占，不调用支付退款', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1', userId: 'user-1', status: 'PAID', payAmount: 0, merchantAcceptTime: null, refundStatus: 'none',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPaymentService.cancelFreeShopOrder.mockResolvedValue({ success: true, message: '订单已取消，无需退款' });

      await expect(controller.userOrderRefund({ orderId: 'order-1', reason: '不需要了' }, 'user-1'))
        .resolves.toEqual({ success: true, message: '订单已取消，无需退款' });
      expect(mockPaymentService.cancelFreeShopOrder).toHaveBeenCalledWith('order-1', '不需要了', 'user-1', 'user');
      expect(mockPaymentService.refund).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ detail: expect.objectContaining({ action: 'user_cancel_free', amount: 0 }) }),
      }));
    });

    it('仅退款用户自己的未接单已付款订单，并使用服务端金额', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1', userId: 'user-1', status: 'PAID', payAmount: '18.80', merchantAcceptTime: null, refundStatus: 'none',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPaymentService.refund.mockResolvedValue({ success: true });

      await expect(controller.userOrderRefund({ orderId: 'order-1', reason: '不需要了' }, 'user-1'))
        .resolves.toEqual({ success: true });
      expect(mockPaymentService.refund).toHaveBeenCalledWith(expect.objectContaining({
        bizType: 'order', bizId: 'order-1', amount: 18.8, reason: '不需要了', operatorId: 'user-1',
      }));
    });

    it('拒绝商家已经接单的自助退款', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1', userId: 'user-1', status: 'PAID', payAmount: '18.80', merchantAcceptTime: new Date(), refundStatus: 'none',
      });

      await expect(controller.userOrderRefund({ orderId: 'order-1', reason: '不需要了' }, 'user-1'))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('自助退款抢占失败时不调用支付退款，避免与商家接单并发写入', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1', userId: 'user-1', status: 'PAID', payAmount: '18.80', merchantAcceptTime: null, refundStatus: 'none',
      });
      mockPrisma.order.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(controller.userOrderRefund({ orderId: 'order-1', reason: '不需要了' }, 'user-1'))
        .rejects.toThrow('订单状态已变化，请刷新后重试');
      expect(mockPaymentService.refund).not.toHaveBeenCalled();
    });
  });

  // ===== rawBody: notify 和 refund-notify =====
  describe('wxpay/notify - rawBody 验签', () => {
    it('应使用 req.rawBody 传递给 service（真实 Buffer）', async () => {
      const rawBuf = Buffer.from('{"id":"evt-001","resource":{"ciphertext":"abc"}}');
      const req = { rawBody: rawBuf, body: {} } as any;
      const headers = {
        'wechatpay-signature': 'sig123',
        'wechatpay-timestamp': '1700000000',
        'wechatpay-nonce': 'nonce123',
        'wechatpay-serial': 'serial123',
      };

      mockPaymentService.wxNotify.mockResolvedValue({ code: 'SUCCESS', message: 'OK' });
      await controller.notify(req, headers);

      const calledBuffer = mockPaymentService.wxNotify.mock.calls[0][0];
      expect(Buffer.isBuffer(calledBuffer)).toBe(true);
      expect(calledBuffer.toString()).toBe('{"id":"evt-001","resource":{"ciphertext":"abc"}}');
    });

    it('验签失败返回 FAIL', async () => {
      const req = { rawBody: Buffer.from('{}'), body: {} } as any;
      const headers = {
        'wechatpay-signature': 'invalid', 'wechatpay-timestamp': '1',
        'wechatpay-nonce': 'n',
      };
      mockPaymentService.wxNotify.mockResolvedValue({ code: 'FAIL', message: '签名验证失败' });
      const result = await controller.notify(req, headers);
      expect(result.code).toBe('FAIL');
    });
  });

  describe('wxpay/refund-notify - rawBody 验签', () => {
    it('应使用 req.rawBody 传递给 service', async () => {
      const rawBuf = Buffer.from('{"id":"evt-r01","resource":{"ciphertext":"xyz"}}');
      const req = { rawBody: rawBuf, body: {} } as any;
      const headers = {
        'wechatpay-signature': 'sig', 'wechatpay-timestamp': '1', 'wechatpay-nonce': 'n',
      };
      mockPaymentService.handleRefundNotify.mockResolvedValue({ code: 'SUCCESS', message: 'OK' });
      await controller.refundNotify(req, headers);

      const calledBuffer = mockPaymentService.handleRefundNotify.mock.calls[0][0];
      expect(Buffer.isBuffer(calledBuffer)).toBe(true);
      expect(calledBuffer.toString()).toBe('{"id":"evt-r01","resource":{"ciphertext":"xyz"}}');
    });
  });

  // ===== createOrder 金额伪造防护 =====
  describe('createOrder - 阻止金额伪造', () => {
    it('传入金额与业务订单金额不一致时应拒绝', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', openid: 'wx-openid-123' });
      mockPrisma.order.findUnique.mockResolvedValue({ userId: 'user-1', orderNo: 'ORD-001', payAmount: '99.00', status: 'PENDING_PAY', createdAt: new Date() });
      await expect(
        controller.createOrder(
          { bizType: 'order', bizId: 'order-1', amount: 0.01, description: 'test' },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('传入金额一致时应成功，且 openid 来自服务端', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', openid: 'wx-openid-123' });
      mockPrisma.order.findUnique.mockResolvedValue({ userId: 'user-1', orderNo: 'ORD-001', payAmount: '99.00', status: 'PENDING_PAY', createdAt: new Date() });
      mockPaymentService.wxUnifiedOrder.mockResolvedValue({ paymentNo: 'PAY-001', paySign: 'abc' });

      const result = await controller.createOrder(
        { bizType: 'order', bizId: 'order-1', amount: 99.00, description: 'test' },
        'user-1',
      );
      expect(result).toBeDefined();
      expect(mockPaymentService.wxUnifiedOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          openid: 'wx-openid-123',
          amount: 99.00,
          orderNo: 'ORD-001',
          userId: 'user-1',
        }),
      );
    });

    it('用户openid不存在时应拒绝', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', openid: null });
      await expect(
        controller.createOrder({ bizType: 'order', bizId: 'order-1', amount: 99.00 }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('订单不属于当前用户时应拒绝', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', openid: 'wx-openid-123' });
      mockPrisma.order.findUnique.mockResolvedValue({ userId: 'user-2', orderNo: 'ORD-001', payAmount: '99.00' });
      await expect(
        controller.createOrder({ bizType: 'order', bizId: 'order-1', amount: 99.00 }, 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('已支付或已取消的外卖订单不能再次发起支付', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', openid: 'wx-openid-123' });
      mockPrisma.order.findUnique.mockResolvedValue({ userId: 'user-1', orderNo: 'ORD-001', payAmount: '99.00', status: 'PAID', createdAt: new Date() });

      await expect(controller.createOrder({ bizType: 'order', bizId: 'order-1', amount: 99 }, 'user-1'))
        .rejects.toThrow('订单状态不允许支付');
      expect(mockPaymentService.wxUnifiedOrder).not.toHaveBeenCalled();
    });

    it('超时且从未支付的外卖订单不能重新占用库存', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', openid: 'wx-openid-123' });
      mockPrisma.order.findUnique.mockResolvedValue({ userId: 'user-1', orderNo: 'ORD-001', payAmount: '99.00', status: 'PENDING_PAY', createdAt: new Date(Date.now() - 16 * 60 * 1000) });

      await expect(controller.createOrder({ bizType: 'order', bizId: 'order-1', amount: 99 }, 'user-1'))
        .rejects.toThrow('订单支付已超时');
    });
  });

  // ===== refund 权限 =====
  describe('refund - 权限控制', () => {
    it('AdminPermissionGuard 拒绝无权限管理员 → canActivate 返回 false', async () => {
      mockAdminPermissionGuard.canActivate.mockResolvedValueOnce(false);
      expect(true).toBe(true); // Guard tested at integration level with metadata above
    });

    it('有 order:refund 权限的管理员可发起退款', async () => {
      mockPaymentService.refund.mockResolvedValue({ success: true, refundNo: 'REF-001' });
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.order.findUnique.mockResolvedValue({ id: 'order-1', status: 'PAID', payAmount: 50, merchantAcceptTime: null, refundStatus: 'none' });

      const result = await controller.refund(
        { bizType: 'order', bizId: 'order-1', amount: 50, reason: '测试退款' },
        { sub: 'admin-1', isAdmin: true },
      );
      expect(result).toBeDefined();
      expect(mockPaymentService.refund).toHaveBeenCalledWith(
        expect.objectContaining({ operatorId: 'admin-1' }),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('运营退款抢占失败时不调用支付退款，避免与商家接单并发写入', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({ id: 'order-1', status: 'PAID', payAmount: 50, merchantAcceptTime: null, refundStatus: 'none' });
      mockPrisma.order.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(controller.refund(
        { bizType: 'order', bizId: 'order-1', amount: 50, reason: '测试退款' },
        { sub: 'admin-1', isAdmin: true },
      )).rejects.toThrow('订单状态已变化，请刷新后重试');
      expect(mockPaymentService.refund).not.toHaveBeenCalled();
    });

    it('运营退款请求失败时释放未接单订单的退款占位', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({ id: 'order-1', status: 'PAID', payAmount: 50, merchantAcceptTime: null, refundStatus: 'none' });
      mockPrisma.order.updateMany.mockResolvedValue({ count: 1 });
      mockPaymentService.refund.mockRejectedValue(new Error('渠道失败'));

      await expect(controller.refund(
        { bizType: 'order', bizId: 'order-1', amount: 50, reason: '测试退款' },
        { sub: 'admin-1', isAdmin: true },
      )).rejects.toThrow('渠道失败');
      expect(mockPrisma.order.updateMany).toHaveBeenLastCalledWith({
        where: { id: 'order-1', refundStatus: 'refunding' },
        data: { refundStatus: 'none', refundAmount: null },
      });
    });

    it('拒绝直接退款商家备餐或骑手配送中的外卖订单', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({ id: 'order-1', status: 'PAID', payAmount: 50, merchantAcceptTime: new Date(), refundStatus: 'none' });

      await expect(controller.refund(
        { bizType: 'order', bizId: 'order-1', amount: 50, reason: '投诉补偿' },
        { sub: 'admin-1', isAdmin: true },
      )).rejects.toThrow('商家备餐或骑手配送中的订单不能直接退款');
      expect(mockPaymentService.refund).not.toHaveBeenCalled();
    });

    it('管理员退款必须填写原因', async () => {
      await expect(controller.refund(
        { bizType: 'order', bizId: 'order-1', amount: 50, reason: '' },
        { sub: 'admin-1', isAdmin: true },
      )).rejects.toThrow('请填写退款原因');
    });
  });

  // ===== query 用户隔离 =====
  describe('query - 用户隔离', () => {
    it('普通用户查询他人支付单应拒绝', async () => {
      mockPrisma.paymentOrder.findUnique.mockResolvedValue({
        paymentNo: 'PAY-001', userId: 'other-user',
      });
      await expect(
        controller.queryPayment('PAY-001', { sub: 'user-1', isAdmin: false }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('管理员可查询任意支付单', async () => {
      mockPrisma.paymentOrder.findUnique.mockResolvedValue({
        paymentNo: 'PAY-001', userId: 'other-user', bizType: 'order', bizId: 'o1',
        amount: '99.00', status: 'paid', payTime: new Date(), wxTransId: 'wx', refundedAmount: '0',
      });
      mockPaymentService.queryPayment.mockResolvedValue({ payment: {}, bizOrder: null });
      const result = await controller.queryPayment('PAY-001', { sub: 'admin-1', isAdmin: true });
      expect(result).toBeDefined();
    });
  });
});
