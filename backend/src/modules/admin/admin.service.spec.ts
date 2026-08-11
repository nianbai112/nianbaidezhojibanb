import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { AdminService } from "./admin.service";
import { PrismaService } from "../../common/services/prisma.service";
import { RedisService } from "../../common/services/redis.service";
import { PaymentService } from "../payment/payment.service";
import { MembershipService } from "../membership/membership.service";
import { WsNativeGateway } from "../websocket/ws-native.gateway";
import { UserSessionRevocationService } from "../websocket/user-session-revocation.service";
import { AdminDataScopeService } from "../../common/services/admin-data-scope.service";

const makeTx = () => ({
  withdraw: {
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  wallet: { update: jest.fn().mockResolvedValue({}), upsert: jest.fn() },
  walletTransaction: { create: jest.fn().mockResolvedValue({}) },
  paymentOrder: {
    update: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn(),
  },
  paymentRefund: { update: jest.fn().mockResolvedValue({}) },
  order: { update: jest.fn().mockResolvedValue({}) },
  mallOrder: { update: jest.fn().mockResolvedValue({}) },
  deliveryOrder: { update: jest.fn().mockResolvedValue({}) },
  errandOrder: { update: jest.fn().mockResolvedValue({}) },
  orderLog: { create: jest.fn() },
  recharge: { update: jest.fn(), findUnique: jest.fn() },
  topupOrder: { update: jest.fn(), findUnique: jest.fn() },
  platformLedger: { create: jest.fn() },
});

const createMockPrisma = () => ({
  user: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  },
  userMembership: { count: jest.fn().mockResolvedValue(0) },
  post: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  region: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  merchant: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  mallMerchant: { count: jest.fn().mockResolvedValue(0) },
  mallProduct: { count: jest.fn().mockResolvedValue(0) },
  mallOrder: { count: jest.fn().mockResolvedValue(0) },
  mallRefund: { count: jest.fn().mockResolvedValue(0) },
  orderAppeal: { count: jest.fn().mockResolvedValue(0) },
  product: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  category: { findMany: jest.fn().mockResolvedValue([]) },
  order: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
  },
  orderLog: {},
  comment: {
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  circle: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  report: {
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  refund: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  withdraw: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    count: jest.fn().mockResolvedValue(0),
  },
  wallet: { update: jest.fn(), upsert: jest.fn() },
  walletTransaction: { create: jest.fn() },
  paymentOrder: {
    findMany: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
    count: jest.fn().mockResolvedValue(0),
  },
  paymentRefund: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
  },
  studentVerify: {
    findUnique: jest.fn().mockResolvedValue({ userId: "u1" }),
    update: jest.fn().mockResolvedValue({}),
    upsert: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  auditLog: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  adminAccount: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: "admin-1" }),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  adminRole: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  adminPermission: { findMany: jest.fn().mockResolvedValue([]) },
  adminMenu: { findMany: jest.fn().mockResolvedValue([]) },
  adminAccountRole: {
    create: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  adminOperationLog: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  serverLog: { count: jest.fn().mockResolvedValue(0) },
  coupon: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  activity: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  notification: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  conversation: { findUnique: jest.fn() },
  review: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  },
  promotion: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: "p1" }),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  },
  promotionProduct: { createMany: jest.fn(), deleteMany: jest.fn() },
  freightTemplate: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue({ id: "ft1" }),
    create: jest.fn().mockResolvedValue({ id: "ft1" }),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  reconciliation: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: "r1", reconciliationNo: "REC1" }),
    count: jest.fn().mockResolvedValue(0),
  },
  regionRider: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  errandOrder: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
  },
  errandConfig: { findFirst: jest.fn(), findMany: jest.fn() },
  cityAgentApplication: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  cityAgent: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  cityAgentSettlement: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  merchantSettlement: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  },
  config: { findUnique: jest.fn(), upsert: jest.fn() },
  $transaction: jest.fn((fn) => fn(makeTx())),
});

const createMockRedis = () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn().mockResolvedValue(undefined),
  getLock: jest.fn().mockResolvedValue(true),
  releaseLock: jest.fn().mockResolvedValue(undefined),
  hset: jest.fn(),
});

const createMockAdminDataScope = () => ({
  assertRegionAccess: jest.fn().mockResolvedValue(undefined),
  regionFieldWhere: jest.fn().mockResolvedValue({}),
  regionModelWhere: jest.fn().mockResolvedValue({}),
  resolveRegionId: jest.fn(
    async (_accountId?: string, regionId?: string | null) =>
      regionId || undefined,
  ),
  getAdminContext: jest.fn().mockResolvedValue({
    isSuperAdmin: true,
    roleIds: [],
    roleCodes: [],
    regionIds: [],
  }),
  canAccessAllRegions: jest.fn().mockResolvedValue(true),
});

describe("AdminService", () => {
  let service: AdminService;
  let prisma: any;
  let adminDataScope: any;
  let redis: any;
  let userSessionRevocation: { revoke: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: createMockPrisma() },
        {
          provide: AdminDataScopeService,
          useValue: createMockAdminDataScope(),
        },
        { provide: RedisService, useValue: createMockRedis() },
        {
          provide: PaymentService,
          useValue: {
            refund: jest.fn().mockResolvedValue({ success: true }),
            rejectRefundById: jest.fn().mockResolvedValue({ success: true }),
          },
        },
        {
          provide: MembershipService,
          useValue: {
            restoreBenefitUsagesForTarget: jest.fn(),
            adminGrantBenefit: jest.fn(),
            adminGrant: jest.fn(),
          },
        },
        {
          provide: WsNativeGateway,
          useValue: { disconnectUser: jest.fn(), broadcast: jest.fn() },
        },
        {
          provide: UserSessionRevocationService,
          useValue: { revoke: jest.fn().mockResolvedValue({}) },
        },
      ],
    }).compile();
    service = module.get<AdminService>(AdminService);
    prisma = module.get(PrismaService);
    adminDataScope = module.get(AdminDataScopeService);
    redis = module.get(RedisService);
    userSessionRevocation = module.get(UserSessionRevocationService);
  });

  describe("userBalanceAdjust", () => {
    it("updates the wallet atomically and writes the resulting balance in the same transaction", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "user-1" });
      prisma.wallet.upsert.mockResolvedValue({ userId: "user-1", balance: 10 });
      const tx = {
        wallet: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({ balance: 15 }),
        },
        walletTransaction: { create: jest.fn().mockResolvedValue({}) },
      };
      prisma.$transaction.mockImplementation((fn: any) => fn(tx));

      await expect(service.userBalanceAdjust({ userId: "user-1", amount: 5, remark: "补偿" }, "admin-1"))
        .resolves.toEqual({ success: true, newBalance: 15 });

      expect(tx.wallet.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        data: { balance: { increment: 5 }, totalIn: { increment: 5 }, totalOut: undefined },
      });
      expect(tx.walletTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ balance: 15 }),
      }));
    });

    it("uses a balance precondition for deductions", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "user-1" });
      prisma.wallet.upsert.mockResolvedValue({ userId: "user-1", balance: 2 });
      const tx = {
        wallet: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), findUnique: jest.fn() },
        walletTransaction: { create: jest.fn() },
      };
      prisma.$transaction.mockImplementation((fn: any) => fn(tx));

      await expect(service.userBalanceAdjust({ userId: "user-1", amount: -5, remark: "扣减" }, "admin-1"))
        .resolves.toEqual({ code: 400, message: "余额不能为负数" });
      expect(tx.wallet.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: "user-1", balance: { gte: 5 } },
      }));
      expect(tx.walletTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe("resetAdminPassword", () => {
    it("rejects weak temporary passwords", async () => {
      prisma.config.findUnique.mockResolvedValue({ value: { passwordMinLength: 8 } });

      await expect(service.resetAdminPassword("admin-2", { password: "admin123" }, "admin-1"))
        .rejects.toThrow("密码");
      expect(prisma.adminAccount.update).not.toHaveBeenCalled();
    });

    it("forces the target admin to change a strong temporary password and revokes refresh sessions", async () => {
      prisma.config.findUnique.mockResolvedValue({ value: { passwordMinLength: 8 } });
      prisma.adminAccount.update.mockResolvedValue({ id: "admin-2" });

      await expect(service.resetAdminPassword("admin-2", { password: "N3w!Secure" }, "admin-1"))
        .resolves.toEqual({ success: true });
      expect(prisma.adminAccount.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: "admin-2" },
        data: expect.objectContaining({ passwordResetRequired: true }),
      }));
      expect(redis.del).toHaveBeenCalledWith("refresh:admin-2");
    });
  });

  describe("dashboard", () => {
    it("should return dashboard stats", async () => {
      const result = await service.dashboard();
      expect(result).toHaveProperty("todayGmv");
      expect(result).toHaveProperty("todayOrders");
      expect(result).toHaveProperty("todayActiveUsers");
      expect(result).toHaveProperty("todayPosts");
      expect(result).toHaveProperty("todayComments");
      expect(result).toHaveProperty("dauEstimate");
      expect(result).toHaveProperty("pendingPosts");
      expect(result).toHaveProperty("pendingWithdraws");
      expect(result).toHaveProperty("pendingReports");
      expect(result).toHaveProperty("pendingMerchants");
      expect(result).toHaveProperty("pendingRefunds");
      expect(result).toHaveProperty("pendingCerts");
      expect(result).toHaveProperty("systemErrorCount");
    });
  });

  describe("dashboard todos", () => {
    it("counts only newly submitted delivery appeals as actionable todos", async () => {
      prisma.orderAppeal.count.mockResolvedValue(3);

      await expect(service.getDashboardTodos()).resolves.toMatchObject({
        pendingOrderAppeals: 3,
      });
      expect(prisma.orderAppeal.count).toHaveBeenCalledWith({
        where: { status: "pending" },
      });
      const fulfillmentAlert = prisma.order.count.mock.calls
        .map(([args]: any[]) => args.where)
        .find(
          (where: any) =>
            where.businessType === "takeaway" &&
            where.merchantAcceptTime === null,
        );
      expect(fulfillmentAlert.OR).toEqual(
        expect.arrayContaining([
          { fulfillmentStartTime: { lte: expect.any(Date) } },
          expect.objectContaining({
            fulfillmentStartTime: null,
            createdAt: { lte: expect.any(Date) },
          }),
        ]),
      );
      expect(
        prisma.order.count.mock.calls.map(([args]: any[]) => args.where),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            status: "SHIPPED",
            riderId: { not: null },
            pickupTime: null,
            acceptTime: { lte: expect.any(Date) },
            refundStatus: { notIn: ["refunding", "refunded"] },
          }),
          expect.objectContaining({
            status: "SHIPPED",
            pickupTime: { not: null, lte: expect.any(Date) },
            deliverTime: null,
            refundStatus: { notIn: ["refunding", "refunded"] },
          }),
          { OR: [{ status: "REFUNDING" }, { refundStatus: "refunding" }] },
        ]),
      );
    });

    it("limits delivery-appeal todos to the current regional operator scope", async () => {
      adminDataScope.getAdminContext.mockResolvedValue({
        isSuperAdmin: false,
        regionIds: ["region-1"],
      });
      prisma.order.findMany.mockResolvedValue([{ id: "shop-order-1" }]);
      prisma.errandOrder.findMany.mockResolvedValue([{ id: "errand-order-1" }]);

      await service.getDashboardTodos("admin-1");

      expect(prisma.orderAppeal.count).toHaveBeenCalledWith({
        where: { status: "pending", regionId: { in: ["region-1"] } },
      });
      expect(
        prisma.order.count.mock.calls.map(([args]: any[]) => args.where),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            merchant: { regionId: { in: ["region-1"] } },
          }),
        ]),
      );
      expect(prisma.paymentRefund.count).toHaveBeenCalledWith({
        where: {
          payment: {
            is: {
              OR: [
                { bizType: "order", bizId: { in: ["shop-order-1"] } },
                { bizType: "errand_order", bizId: { in: ["errand-order-1"] } },
              ],
            },
          },
          status: "pending",
        },
      });
    });
  });

  describe("refunds", () => {
    it("returns payment and external order identifiers for the merchant refund page", async () => {
      prisma.paymentRefund.findMany.mockResolvedValue([
        {
          id: "refund-1",
          refundNo: "REF-1",
          amount: 12.5,
          reason: "缺货",
          status: "processing",
          wxRefundId: null,
          failReason: null,
          refundedAt: null,
          createdAt: new Date(),
          payment: {
            paymentNo: "PAY-1",
            orderNo: "ORD-1",
            bizType: "order",
            bizId: "order-1",
            userId: "user-1",
          },
        },
      ]);
      prisma.paymentRefund.count.mockResolvedValue(1);
      prisma.order.findMany.mockResolvedValue([
        {
          id: "order-1",
          orderNo: "ORD-1",
          user: { id: "user-1", nickname: "小明", phone: "13800000000" },
          merchant: { id: "merchant-1", name: "测试商家" },
        },
      ]);

      await expect(service.refunds({})).resolves.toEqual(
        expect.objectContaining({
          total: 1,
          list: [
            expect.objectContaining({
              refundNo: "REF-1",
              paymentNo: "PAY-1",
              orderNo: "ORD-1",
              userName: "小明",
              merchantName: "测试商家",
            }),
          ],
        }),
      );
    });

    it("filters refund operations by refund or business order number", async () => {
      await service.refunds({ keyword: " ORD-1 ", status: "pending" });

      const expectedWhere = {
        OR: [
          { refundNo: { contains: "ORD-1" } },
          { payment: { is: { orderNo: { contains: "ORD-1" } } } },
        ],
        status: "pending",
      };
      expect(prisma.paymentRefund.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere }),
      );
      expect(prisma.paymentRefund.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
    });

    it("combines a refund search with the operator region scope", async () => {
      adminDataScope.getAdminContext.mockResolvedValue({
        isSuperAdmin: false,
        roleIds: [],
        roleCodes: [],
        regionIds: ["region-1"],
      });
      prisma.order.findMany.mockResolvedValue([{ id: "shop-order-1" }]);
      prisma.errandOrder.findMany.mockResolvedValue([]);

      await service.refunds({ keyword: "REF-1" }, "admin-1");

      const scopedWhere = {
        payment: {
          is: { OR: [{ bizType: "order", bizId: { in: ["shop-order-1"] } }] },
        },
      };
      const searchWhere = {
        OR: [
          { refundNo: { contains: "REF-1" } },
          { payment: { is: { orderNo: { contains: "REF-1" } } } },
        ],
      };
      const where = { AND: [scopedWhere, searchWhere] };
      expect(prisma.paymentRefund.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where }),
      );
      expect(prisma.paymentRefund.count).toHaveBeenCalledWith({ where });
    });

    it("rejects a pending refund once without overwriting a concurrent terminal result", async () => {
      prisma.paymentRefund.findUnique.mockResolvedValue({
        id: "refund-1",
        status: "pending",
        payment: { bizType: "order", bizId: "order-1" },
      });
      const paymentService = (service as any).paymentService;

      await expect(
        service.auditRefund(
          "refund-1",
          { status: "rejected", remark: "凭证不充分" },
          "admin-1",
        ),
      ).resolves.toEqual({ success: true });
      expect(paymentService.rejectRefundById).toHaveBeenCalledWith(
        "refund-1",
        "凭证不充分",
        "admin-1",
      );

      paymentService.rejectRefundById.mockRejectedValueOnce(
        new BadRequestException("退款状态已变化，请刷新后重试"),
      );
      await expect(
        service.auditRefund(
          "refund-1",
          { status: "rejected", remark: "重复操作" },
          "admin-1",
        ),
      ).rejects.toThrow("退款状态已变化，请刷新后重试");
    });
  });

  describe("cancelOrder", () => {
    it("does not let an admin silently cancel a paid or in-progress takeaway order", async () => {
      const tx: any = {
        order: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: "order-1", status: "SHIPPED" }),
        },
      };
      prisma.$transaction.mockImplementation((callback: any) => callback(tx));

      await expect(
        service.cancelOrder("order-1", { reason: "测试" }, "admin-1"),
      ).rejects.toThrow("已支付或履约中的订单不能直接取消，请走退款流程");
      expect(tx.order.updateMany).toBeUndefined();
    });

    it("cancels only a pending payment order and releases its reserved stock", async () => {
      const notifyService = {
        createAndDispatch: jest.fn().mockResolvedValue({}),
      };
      (service as any).notifyService = notifyService;
      const tx: any = {
        order: {
          findUnique: jest.fn().mockResolvedValue({
            id: "order-1",
            userId: "user-1",
            orderNo: "ORD-1",
            status: "PENDING_PAY",
            stockReserved: true,
            items: [
              {
                productId: "product-1",
                skuId: "sku-1",
                quantity: 2,
                modifierSelections: [
                  { optionId: "extra-1", stockManaged: true },
                ],
              },
            ],
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        product: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        sKU: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        productModifierOption: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        couponReceive: { findFirst: jest.fn().mockResolvedValue(null) },
        coupon: { update: jest.fn() },
        subsidyLedger: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      prisma.$transaction.mockImplementation((callback: any) => callback(tx));
      prisma.orderLog.create = jest.fn().mockResolvedValue({});

      await expect(
        service.cancelOrder("order-1", { reason: "后台取消" }, "admin-1"),
      ).resolves.toMatchObject({ success: true });
      expect(tx.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "order-1", status: "PENDING_PAY" },
          data: expect.objectContaining({
            status: "CANCELLED",
            stockReserved: false,
          }),
        }),
      );
      expect(tx.product.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "product-1" },
          data: { stock: { increment: 2 }, saleCount: { decrement: 2 } },
        }),
      );
      expect(tx.sKU.updateMany).toHaveBeenCalledWith({
        where: { id: "sku-1" },
        data: { stock: { increment: 2 } },
      });
      expect(tx.productModifierOption.updateMany).toHaveBeenCalledWith({
        where: { id: "extra-1", stock: { not: null } },
        data: { stock: { increment: 2 } },
      });
      expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          scene: "shop_order_admin_cancelled",
          linkValue: "/pagesA/order/order-detail/order-detail?id=order-1",
        }),
      );
    });
  });

  describe("updateOrderStatus", () => {
    it("does not let an order-view operator bypass payment and fulfillment state transitions", async () => {
      await expect(
        service.updateOrderStatus("order-1", "REFUNDED"),
      ).rejects.toThrow(
        "后台不可直接修改外卖订单状态，请使用取消、退款或商家/骑手履约流程",
      );
    });
  });

  describe("users", () => {
    it("should return paginated user list", async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: "u1",
          nickname: "test",
          avatar: null,
          phone: null,
          status: "ACTIVE",
          profile: {
            gender: "UNKNOWN",
            birthday: null,
            bio: null,
            school: null,
          },
          studentVerify: null,
          wallet: { balance: 0 },
          createdAt: new Date(),
          lastLoginAt: null,
          _count: { posts: 0, follows: 0, followers: 0 },
        },
      ]);
      prisma.user.count.mockResolvedValue(1);
      const result = await service.users({});
      expect(result.list).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it("should throw for non-existent user", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.userDetail("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("banUser", () => {
    it("should ban a user", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "u1" });
      const result = await service.banUser("u1", { banned: true }, "op1");
      expect(result.success).toBe(true);
      expect(userSessionRevocation.revoke).toHaveBeenCalledWith("u1");
    });

    it("should unban a user", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "u1" });
      const result = await service.banUser("u1", { banned: false }, "op1");
      expect(result.success).toBe(true);
    });

    it("should throw for non-existent user", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.banUser("x", { banned: true })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("setUserStatus", () => {
    it("should map disabled to INACTIVE", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "u1" });
      const result = await service.setUserStatus(
        "u1",
        { status: "disabled" },
        "op1",
      );
      expect(result).toMatchObject({ success: true, status: "INACTIVE" });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: { status: "INACTIVE" },
      });
      expect(userSessionRevocation.revoke).toHaveBeenCalledWith("u1");
    });
  });

  describe("batchUsers", () => {
    it("revokes every selected user when batch disabling accounts", async () => {
      prisma.user.updateMany = jest.fn().mockResolvedValue({ count: 2 });

      await service.batchUsers(
        { ids: ["u1", "u2", "u1"], action: "disable" },
        "op1",
      );

      expect(userSessionRevocation.revoke).toHaveBeenCalledTimes(2);
      expect(userSessionRevocation.revoke).toHaveBeenCalledWith("u1");
      expect(userSessionRevocation.revoke).toHaveBeenCalledWith("u2");
    });
  });

  describe("auditCert", () => {
    it("should approve student cert", async () => {
      const result = await service.auditCert("u1", { status: "approved" });
      expect(result.success).toBe(true);
    });

    it("should reject student cert", async () => {
      const result = await service.auditCert("u1", {
        status: "rejected",
        reason: "信息不符",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("regions", () => {
    it("should return paginated regions", async () => {
      const result = await service.regions({});
      expect(result).toHaveProperty("list");
      expect(result).toHaveProperty("total");
    });

    it("should throw for non-existent region", async () => {
      prisma.region.findUnique.mockResolvedValue(null);
      await expect(service.regionDetail("x")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("batchProducts", () => {
    it("should throw if no ids", async () => {
      await expect(
        service.batchProducts({ ids: [], action: "on" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw for invalid action", async () => {
      await expect(
        service.batchProducts({ ids: ["p1"], action: "invalid" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should set products on_sale", async () => {
      const result = await service.batchProducts({
        ids: ["p1", "p2"],
        action: "on",
      });
      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
    });
  });

  describe("batchMerchants", () => {
    it("should throw if no ids", async () => {
      await expect(
        service.batchMerchants({ ids: [], action: "approve" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should approve merchants", async () => {
      const result = await service.batchMerchants({
        ids: ["m1", "m2"],
        action: "approve",
      });
      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
    });
  });

  describe("reviews", () => {
    it("should return paginated reviews", async () => {
      const result = await service.reviews({});
      expect(result).toHaveProperty("list");
      expect(result).toHaveProperty("total");
    });

    it("should delete review", async () => {
      prisma.review.findUnique.mockResolvedValue({ id: "r1" });
      const result = await service.deleteReview("r1");
      expect(result.success).toBe(true);
    });

    it("should throw deleting non-existent review", async () => {
      prisma.review.findUnique.mockResolvedValue(null);
      await expect(service.deleteReview("x")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should reply to review", async () => {
      const notifyService = {
        createAndDispatch: jest.fn().mockResolvedValue({}),
      };
      (service as any).notifyService = notifyService;
      prisma.review.findUnique.mockResolvedValue({
        id: "r1",
        userId: "user-1",
        orderId: "order-1",
        merchantId: "merchant-1",
        status: "active",
      });
      const result = await service.replyReview("r1", " 感谢您的反馈 ");
      expect(result.success).toBe(true);
      expect(prisma.review.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reply: "感谢您的反馈" }),
        }),
      );
      expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          scene: "shop_review_platform_reply",
          linkValue: "/pagesA/order/order-detail/order-detail?id=order-1",
        }),
      );
      await expect(service.replyReview("r1", "  ")).rejects.toThrow(
        "回复内容不能为空",
      );

      prisma.review.findUnique.mockResolvedValue({
        id: "r1",
        status: "hidden",
      });
      await expect(service.replyReview("r1", "不应发送")).rejects.toThrow(
        "该评价已隐藏，无法回复",
      );
    });
  });

  describe("promotions", () => {
    it("should create promotion", async () => {
      const result = await service.createPromotion({
        name: "双11促销",
        type: "full_reduction",
        rules: { full: 100, reduction: 10 },
        startAt: new Date().toISOString(),
        endAt: new Date().toISOString(),
        productIds: [],
      });
      expect(result.success).toBe(true);
      expect(result.id).toBe("p1");
    });

    it("should update promotion", async () => {
      const result = await service.updatePromotion("p1", {
        name: "Updated",
        status: "inactive",
      });
      expect(result.success).toBe(true);
    });

    it("should throw for non-existent promotion", async () => {
      prisma.promotion.findUnique.mockResolvedValue(null);
      await expect(service.promotionDetail("x")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("freightTemplates", () => {
    it("should create freight template", async () => {
      const result = await service.createFreightTemplate({
        merchantId: "m1",
        name: "默认运费",
        rules: {},
      });
      expect(result).toBeDefined();
      expect(result.id).toBe("ft1");
    });

    it("should delete freight template", async () => {
      const result = await service.deleteFreightTemplate("t1");
      expect(result.success).toBe(true);
    });
  });

  describe("withdraw state machine", () => {
    it("should reject pending withdraw and refund balance", async () => {
      prisma.withdraw.findUnique.mockResolvedValue({
        id: "w1",
        userId: "u1",
        amount: 100,
        status: "PENDING",
      });
      const result = await service.auditWithdraw("w1", {
        status: "rejected",
        remark: "不符条件",
      });
      expect(result.success).toBe(true);
    });

    it("should not process already processed withdraw", async () => {
      prisma.withdraw.findUnique.mockResolvedValue({
        id: "w1",
        userId: "u1",
        amount: 100,
        status: "PROCESSING",
      });
      await expect(
        service.auditWithdraw("w1", { status: "approved" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should complete withdraw only from PROCESSING", async () => {
      prisma.withdraw.findUnique.mockResolvedValue({
        id: "w1",
        userId: "u1",
        amount: 100,
        status: "PROCESSING",
      });
      const result = await service.completeWithdraw("w1", {
        transferNo: "TXN123",
      });
      expect(result.success).toBe(true);
    });

    it("should not complete non-processing withdraw", async () => {
      prisma.withdraw.findUnique.mockResolvedValue({
        id: "w1",
        userId: "u1",
        amount: 100,
        status: "PENDING",
      });
      await expect(service.completeWithdraw("w1", {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("createAdmin", () => {
    it("should create admin", async () => {
      prisma.adminRole.findFirst.mockResolvedValue({ id: "r1", code: "admin" });
      const result = await service.createAdmin({
        username: "new_admin",
        password: "Test@123",
        roleCode: "admin",
      });
      expect(result.success).toBe(true);
    });

    it("should throw for duplicate username", async () => {
      prisma.adminAccount.findUnique.mockResolvedValue({ id: "existing" });
      await expect(
        service.createAdmin({ username: "admin", password: "x" }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("reconciliations", () => {
    it("should create reconciliation", async () => {
      const result = await service.createReconciliation({
        type: "income",
        startAt: "2025-01-01",
        endAt: "2025-01-31",
        totalAmount: 10000,
        platformFee: 500,
        orderCount: 100,
      });
      expect(result.success).toBe(true);
      expect(result).toHaveProperty("reconciliationNo");
    });
  });

  describe("merchant settlements", () => {
    it("settles completed merchandise only and applies the region commission", async () => {
      prisma.merchant.findUnique.mockResolvedValue({
        id: "m1",
        region: { commissionRate: 0.05 },
      });
      prisma.order.findMany.mockResolvedValue([
        { totalAmount: 22, originalFreightAmount: 2 },
        { totalAmount: 32, originalFreightAmount: 2 },
      ]);

      const result = await service.generateMerchantSettlement(
        {
          merchantId: "m1",
          startAt: "2026-07-01T00:00:00.000Z",
          endAt: "2026-07-07T23:59:59.999Z",
        },
        "admin-1",
      );

      expect(result.success).toBe(true);
      expect(prisma.merchantSettlement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            merchantId: "m1",
            amount: 50,
            platformFee: 2.5,
            orderCount: 2,
          }),
        }),
      );
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            merchantId: "m1",
            status: "COMPLETED",
            refundStatus: { notIn: ["refunding", "refunded"] },
          }),
        }),
      );
    });

    it("does not generate the same merchant period twice", async () => {
      prisma.merchant.findUnique.mockResolvedValue({
        id: "m1",
        region: { commissionRate: 0 },
      });
      prisma.merchantSettlement.findFirst.mockResolvedValue({
        settlementNo: "MST1",
      });

      await expect(
        service.generateMerchantSettlement({
          merchantId: "m1",
          startAt: "2026-07-01T00:00:00.000Z",
          endAt: "2026-07-07T23:59:59.999Z",
        }),
      ).rejects.toThrow("结算周期与已有结算单重叠：MST1");
      expect(prisma.merchantSettlement.findFirst).toHaveBeenCalledWith({
        where: {
          merchantId: "m1",
          startAt: { lte: new Date("2026-07-07T23:59:59.999Z") },
          endAt: { gte: new Date("2026-07-01T00:00:00.000Z") },
          OR: [
            { periodKey: null },
            { periodKey: { not: { startsWith: "refund-adjustment:" } } },
          ],
        },
        select: { settlementNo: true },
      });
    });

    it("does not generate a partially overlapping merchant settlement period", async () => {
      prisma.merchant.findUnique.mockResolvedValue({
        id: "m1",
        region: { commissionRate: 0 },
      });
      prisma.merchantSettlement.findFirst.mockResolvedValue({
        settlementNo: "MST-EXISTING",
      });

      await expect(
        service.generateMerchantSettlement({
          merchantId: "m1",
          startAt: "2026-07-05T00:00:00.000Z",
          endAt: "2026-07-10T23:59:59.999Z",
        }),
      ).rejects.toThrow("结算周期与已有结算单重叠：MST-EXISTING");
      expect(prisma.order.findMany).not.toHaveBeenCalled();
    });

    it("serializes settlement generation for the same merchant before checking its period", async () => {
      redis.getLock.mockResolvedValue(false);
      prisma.merchant.findUnique.mockResolvedValue({
        id: "m1",
        region: { commissionRate: 0 },
      });

      await expect(
        service.generateMerchantSettlement({
          merchantId: "m1",
          startAt: "2026-07-01T00:00:00.000Z",
          endAt: "2026-07-07T23:59:59.999Z",
        }),
      ).rejects.toThrow("该商家结算正在生成，请稍后重试");
      expect(redis.getLock).toHaveBeenCalledWith("merchant:settlement:m1", 60);
      expect(prisma.merchant.findUnique).toHaveBeenCalledWith({
        where: { id: "m1" },
        include: { region: { select: { commissionRate: true } } },
      });
      expect(prisma.merchantSettlement.create).not.toHaveBeenCalled();
    });

    it("turns a concurrent settlement insert into the same clear period-conflict result", async () => {
      prisma.merchant.findUnique.mockResolvedValue({
        id: "m1",
        region: { commissionRate: 0 },
      });
      prisma.merchantSettlement.create.mockRejectedValueOnce({ code: "P2002" });

      await expect(
        service.generateMerchantSettlement({
          merchantId: "m1",
          startAt: "2026-07-01T00:00:00.000Z",
          endAt: "2026-07-07T23:59:59.999Z",
        }),
      ).rejects.toThrow("该结算周期已生成，请刷新后查看");
    });

    it("hides a removed review instead of erasing the order evaluation evidence", async () => {
      prisma.review.findUnique.mockResolvedValue({
        id: "review-1",
        status: "active",
      });

      await expect(
        service.deleteReview("review-1", "admin-1"),
      ).resolves.toEqual({ success: true });
      expect(prisma.review.update).toHaveBeenCalledWith({
        where: { id: "review-1" },
        data: { status: "hidden" },
      });
      expect(prisma.review.delete).not.toHaveBeenCalled();
    });

    it("deducts a completed order's settled partial refund without charging the merchant more than its goods amount", async () => {
      prisma.merchant.findUnique.mockResolvedValue({
        id: "m1",
        region: { commissionRate: 0 },
      });
      prisma.order.findMany.mockResolvedValue([
        {
          totalAmount: 22,
          originalFreightAmount: 2,
          refundStatus: "partial",
          refundAmount: 5,
        },
      ]);

      await service.generateMerchantSettlement(
        {
          merchantId: "m1",
          startAt: "2026-07-01T00:00:00.000Z",
          endAt: "2026-07-07T23:59:59.999Z",
        },
        "admin-1",
      );

      expect(prisma.merchantSettlement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 15, orderCount: 1 }),
        }),
      );
    });
  });

  describe("merchant business hours", () => {
    it("keeps a compact weekly schedule valid for super-admin actions", () => {
      const weeklySchedule = JSON.stringify([
        [0, "Closed", "Closed"],
        [1, "09:00", "22:00"],
        [2, "09:00", "22:00"],
        [3, "09:00", "22:00"],
        [4, "09:00", "22:00"],
        [5, "09:00", "22:00"],
        [6, "09:00", "22:00"],
      ]);

      expect((service as any).normalizeBusinessHours(weeklySchedule)).toBe(
        weeklySchedule,
      );
      expect(() =>
        (service as any).assertValidBusinessHours(weeklySchedule),
      ).not.toThrow();
    });
  });

  describe("region code normalization", () => {
    it("removes edge separators with bounded operations", () => {
      expect((service as any).normalizeRegionCode("---Campus North___")).toBe("campus-north");
      expect((service as any).generateRegionCode("___South Campus---")).toBe("south-campus");
    });
  });

  describe("refundsFinance", () => {
    it("should return finance refund summary", async () => {
      prisma.paymentRefund.findMany.mockResolvedValue([
        {
          id: "refund-finance-1",
          refundNo: "REF-FIN-1",
          amount: 8.8,
          reason: "超时",
          status: "success",
          createdAt: new Date(),
          payment: {
            paymentNo: "PAY-FIN-1",
            orderNo: "ORD-FIN-1",
            bizType: "order",
            userId: "user-1",
          },
        },
      ]);
      prisma.paymentRefund.count.mockResolvedValue(1);
      prisma.paymentRefund.aggregate.mockResolvedValue({
        _sum: { amount: 8.8 },
      });

      const result = await service.refundsFinance({});
      expect(result).toHaveProperty("list");
      expect(result).toHaveProperty("totalAmount");
      expect(result).toHaveProperty("total");
      expect(result.list[0]).toEqual(
        expect.objectContaining({
          paymentNo: "PAY-FIN-1",
          orderNo: "ORD-FIN-1",
        }),
      );
    });
  });
});
