import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { PaymentService } from '../payment/payment.service';

const makeTx = () => ({
  withdraw: { update: jest.fn().mockResolvedValue({}) },
  wallet: { update: jest.fn().mockResolvedValue({}), upsert: jest.fn() },
  walletTransaction: { create: jest.fn().mockResolvedValue({}) },
  paymentOrder: { update: jest.fn().mockResolvedValue({}), findUnique: jest.fn() },
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
  post: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  region: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  merchant: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null), update: jest.fn(), updateMany: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  product: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null), update: jest.fn(), updateMany: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  category: { findMany: jest.fn().mockResolvedValue([]) },
  order: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0) },
  orderLog: {},
  comment: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  circle: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  report: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  refund: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  withdraw: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  wallet: { update: jest.fn(), upsert: jest.fn() },
  walletTransaction: { create: jest.fn() },
  paymentOrder: { findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }), count: jest.fn().mockResolvedValue(0) },
  paymentRefund: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null), update: jest.fn(), count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
  studentVerify: { upsert: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  auditLog: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  adminAccount: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'admin-1' }), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  adminRole: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
  adminPermission: { findMany: jest.fn().mockResolvedValue([]) },
  adminMenu: { findMany: jest.fn().mockResolvedValue([]) },
  adminAccountRole: { create: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
  adminOperationLog: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  coupon: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  activity: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  notification: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  conversation: { findUnique: jest.fn() },
  review: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null), delete: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0) },
  promotion: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'p1' }), update: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0) },
  promotionProduct: { createMany: jest.fn(), deleteMany: jest.fn() },
  freightTemplate: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue({ id: 'ft1' }), create: jest.fn().mockResolvedValue({ id: 'ft1' }), update: jest.fn(), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  reconciliation: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: 'r1', reconciliationNo: 'REC1' }), count: jest.fn().mockResolvedValue(0) },
  regionRider: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  errandOrder: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0) },
  errandConfig: { findFirst: jest.fn(), findMany: jest.fn() },
  cityAgentApplication: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  cityAgent: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  cityAgentSettlement: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  config: { findUnique: jest.fn(), upsert: jest.fn() },
  $transaction: jest.fn((fn) => fn(makeTx())),
});

const createMockRedis = () => ({
  get: jest.fn(), set: jest.fn(), getLock: jest.fn(), releaseLock: jest.fn(), hset: jest.fn(),
});

describe('AdminService', () => {
  let service: AdminService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: createMockPrisma() },
        { provide: RedisService, useValue: createMockRedis() },
        { provide: PaymentService, useValue: { refund: jest.fn().mockResolvedValue({ success: true }) } },
      ],
    }).compile();
    service = module.get<AdminService>(AdminService);
    prisma = module.get(PrismaService);
  });

  describe('dashboard', () => {
    it('should return dashboard stats', async () => {
      const result = await service.dashboard();
      expect(result).toHaveProperty('todayGmv');
      expect(result).toHaveProperty('todayOrders');
      expect(result).toHaveProperty('dauEstimate');
      expect(result).toHaveProperty('pendingPosts');
      expect(result).toHaveProperty('pendingWithdraws');
      expect(result).toHaveProperty('pendingReports');
      expect(result).toHaveProperty('pendingMerchants');
    });
  });

  describe('users', () => {
    it('should return paginated user list', async () => {
      prisma.user.findMany.mockResolvedValue([{
        id: 'u1', nickname: 'test', avatar: null, phone: null, status: 'ACTIVE',
        profile: { gender: 'UNKNOWN', birthday: null, bio: null, school: null },
        studentVerify: null, wallet: { balance: 0 },
        createdAt: new Date(), lastLoginAt: null,
        _count: { posts: 0, follows: 0, followers: 0 },
      }]);
      prisma.user.count.mockResolvedValue(1);
      const result = await service.users({});
      expect(result.list).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should throw for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.userDetail('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('banUser', () => {
    it('should ban a user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      const result = await service.banUser('u1', { banned: true }, 'op1');
      expect(result.success).toBe(true);
    });

    it('should unban a user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      const result = await service.banUser('u1', { banned: false }, 'op1');
      expect(result.success).toBe(true);
    });

    it('should throw for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.banUser('x', { banned: true })).rejects.toThrow(NotFoundException);
    });
  });

  describe('auditCert', () => {
    it('should approve student cert', async () => {
      const result = await service.auditCert('u1', { status: 'approved' });
      expect(result.success).toBe(true);
    });

    it('should reject student cert', async () => {
      const result = await service.auditCert('u1', { status: 'rejected', reason: '信息不符' });
      expect(result.success).toBe(true);
    });
  });

  describe('regions', () => {
    it('should return paginated regions', async () => {
      const result = await service.regions({});
      expect(result).toHaveProperty('list');
      expect(result).toHaveProperty('total');
    });

    it('should throw for non-existent region', async () => {
      prisma.region.findUnique.mockResolvedValue(null);
      await expect(service.regionDetail('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('batchProducts', () => {
    it('should throw if no ids', async () => {
      await expect(service.batchProducts({ ids: [], action: 'on' })).rejects.toThrow(BadRequestException);
    });

    it('should throw for invalid action', async () => {
      await expect(service.batchProducts({ ids: ['p1'], action: 'invalid' })).rejects.toThrow(BadRequestException);
    });

    it('should set products on_sale', async () => {
      const result = await service.batchProducts({ ids: ['p1', 'p2'], action: 'on' });
      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
    });
  });

  describe('batchMerchants', () => {
    it('should throw if no ids', async () => {
      await expect(service.batchMerchants({ ids: [], action: 'approve' })).rejects.toThrow(BadRequestException);
    });

    it('should approve merchants', async () => {
      const result = await service.batchMerchants({ ids: ['m1', 'm2'], action: 'approve' });
      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
    });
  });

  describe('reviews', () => {
    it('should return paginated reviews', async () => {
      const result = await service.reviews({});
      expect(result).toHaveProperty('list');
      expect(result).toHaveProperty('total');
    });

    it('should delete review', async () => {
      prisma.review.findUnique.mockResolvedValue({ id: 'r1' });
      const result = await service.deleteReview('r1');
      expect(result.success).toBe(true);
    });

    it('should throw deleting non-existent review', async () => {
      prisma.review.findUnique.mockResolvedValue(null);
      await expect(service.deleteReview('x')).rejects.toThrow(NotFoundException);
    });

    it('should reply to review', async () => {
      prisma.review.findUnique.mockResolvedValue({ id: 'r1' });
      const result = await service.replyReview('r1', '感谢您的反馈');
      expect(result.success).toBe(true);
    });
  });

  describe('promotions', () => {
    it('should create promotion', async () => {
      const result = await service.createPromotion({
        name: '双11促销', type: 'full_reduction', rules: { full: 100, reduction: 10 },
        startAt: new Date().toISOString(), endAt: new Date().toISOString(),
        productIds: [],
      });
      expect(result.success).toBe(true);
      expect(result.id).toBe('p1');
    });

    it('should update promotion', async () => {
      const result = await service.updatePromotion('p1', { name: 'Updated', status: 'inactive' });
      expect(result.success).toBe(true);
    });

    it('should throw for non-existent promotion', async () => {
      prisma.promotion.findUnique.mockResolvedValue(null);
      await expect(service.promotionDetail('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('freightTemplates', () => {
    it('should create freight template', async () => {
      const result = await service.createFreightTemplate({ merchantId: 'm1', name: '默认运费', rules: {} });
      expect(result).toBeDefined();
      expect(result.id).toBe('ft1');
    });

    it('should delete freight template', async () => {
      const result = await service.deleteFreightTemplate('t1');
      expect(result.success).toBe(true);
    });
  });

  describe('withdraw state machine', () => {
    it('should reject pending withdraw and refund balance', async () => {
      prisma.withdraw.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1', amount: 100, status: 'PENDING' });
      const result = await service.auditWithdraw('w1', { status: 'rejected', remark: '不符条件' });
      expect(result.success).toBe(true);
    });

    it('should not process already processed withdraw', async () => {
      prisma.withdraw.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1', amount: 100, status: 'PROCESSING' });
      await expect(service.auditWithdraw('w1', { status: 'approved' })).rejects.toThrow(BadRequestException);
    });

    it('should complete withdraw only from PROCESSING', async () => {
      prisma.withdraw.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1', amount: 100, status: 'PROCESSING' });
      const result = await service.completeWithdraw('w1', { transferNo: 'TXN123' });
      expect(result.success).toBe(true);
    });

    it('should not complete non-processing withdraw', async () => {
      prisma.withdraw.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1', amount: 100, status: 'PENDING' });
      await expect(service.completeWithdraw('w1', {})).rejects.toThrow(BadRequestException);
    });
  });

  describe('createAdmin', () => {
    it('should create admin', async () => {
      prisma.adminRole.findFirst.mockResolvedValue({ id: 'r1', code: 'admin' });
      const result = await service.createAdmin({ username: 'new_admin', password: 'Test@123', roleCode: 'admin' });
      expect(result.success).toBe(true);
    });

    it('should throw for duplicate username', async () => {
      prisma.adminAccount.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.createAdmin({ username: 'admin', password: 'x' })).rejects.toThrow(ConflictException);
    });
  });

  describe('reconciliations', () => {
    it('should create reconciliation', async () => {
      const result = await service.createReconciliation({
        type: 'income', startAt: '2025-01-01', endAt: '2025-01-31',
        totalAmount: 10000, platformFee: 500, orderCount: 100,
      });
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('reconciliationNo');
    });
  });

  describe('refundsFinance', () => {
    it('should return finance refund summary', async () => {
      const result = await service.refundsFinance({});
      expect(result).toHaveProperty('list');
      expect(result).toHaveProperty('totalAmount');
      expect(result).toHaveProperty('total');
    });
  });
});
