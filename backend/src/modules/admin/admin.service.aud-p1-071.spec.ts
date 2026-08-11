import { ForbiddenException } from '@nestjs/common';
import { AdminService } from './admin.service';

describe('AUD-P1-071 AdminService regional scope', () => {
  const createService = () => {
    const prisma: any = {
      post: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), findUnique: jest.fn() },
      comment: { groupBy: jest.fn().mockResolvedValue([]) },
      adminLoginLog: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      studentVerify: { count: jest.fn().mockResolvedValue(0) },
      userMembership: { count: jest.fn().mockResolvedValue(0) },
      merchant: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), findUnique: jest.fn() },
      merchantSettlement: {
        findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(), create: jest.fn(),
      },
      withdraw: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), findUnique: jest.fn() },
      adminOperationLog: { create: jest.fn().mockResolvedValue({}) },
      region: { findMany: jest.fn().mockResolvedValue([]) },
      wallet: { aggregate: jest.fn().mockResolvedValue({ _sum: { balance: 0 } }) },
    };
    const scope: any = {
      regionFieldWhere: jest.fn().mockResolvedValue({ regionId: { in: ['region-a'] } }),
      assertRegionAccess: jest.fn().mockResolvedValue(undefined),
      getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, regionIds: ['region-a'] }),
    };
    const redis = { getLock: jest.fn(), releaseLock: jest.fn() };
    const service = new AdminService(prisma, scope, redis as any, undefined, undefined, undefined);
    return { service, prisma, scope, redis };
  };

  it('enforces the server-side region scope for post lists even without a client region filter', async () => {
    const { service, prisma, scope } = createService();

    await service.posts({}, 'admin-a');

    expect(scope.regionFieldWhere).toHaveBeenCalledWith('regionId', 'admin-a', undefined);
    expect(prisma.post.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ regionId: { in: ['region-a'] } }),
    }));
  });

  it('rejects a cross-region post detail before returning reports or interaction identities', async () => {
    const { service, prisma, scope } = createService();
    prisma.post.findUnique.mockResolvedValue({ id: 'post-b', regionId: 'region-b' });
    scope.assertRegionAccess.mockRejectedValue(new ForbiddenException('无权访问该区域数据'));

    await expect(service.postDetail('post-b', 'admin-a')).rejects.toThrow(ForbiddenException);
    expect(scope.assertRegionAccess).toHaveBeenCalledWith('admin-a', 'region-b');
  });

  it('limits non-super-admin login logs to the current admin account', async () => {
    const { service, prisma } = createService();

    await service.loginLogs({}, 'admin-a');

    expect(prisma.adminLoginLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ accountId: 'admin-a' }),
    }));
  });

  it('adds a region-owned user predicate when a regional admin lists users', async () => {
    const { service, prisma } = createService();
    prisma.user = { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) };

    await service.users({}, 'admin-a');

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: expect.arrayContaining([
        expect.objectContaining({ OR: expect.any(Array) }),
      ]) }),
    }));
  });

  it('filters ordinary orders by the merchant region on the server', async () => {
    const { service, prisma } = createService();
    prisma.order = { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) };

    await service.orders({}, 'admin-a');

    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: expect.arrayContaining([
        { merchant: { regionId: { in: ['region-a'] } } },
      ]) }),
    }));
  });

  it('rejects cross-region order details before exposing user, address, or payment data', async () => {
    const { service, prisma } = createService();
    prisma.order = { findUnique: jest.fn().mockResolvedValue({ id: 'order-b', merchant: { regionId: 'region-b' } }) };

    await expect(service.orderDetail('order-b', 'admin-a')).rejects.toThrow(ForbiddenException);
    expect(prisma.paymentOrder).toBeUndefined();
  });

  it('filters refund lists and rejects a cross-region refund before it can be audited', async () => {
    const { service, prisma } = createService();
    prisma.order = {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ merchant: { regionId: 'region-b' } }),
    };
    prisma.errandOrder = { findMany: jest.fn().mockResolvedValue([]) };
    prisma.paymentRefund = {
      findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue({ id: 'refund-b', status: 'pending', payment: { bizType: 'order', bizId: 'order-b' } }),
      update: jest.fn(),
    };

    await service.refunds({}, 'admin-a');
    expect(prisma.paymentRefund.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [] } } }));
    await expect(service.auditRefund('refund-b', { status: 'rejected', remark: '测试' }, 'admin-a')).rejects.toThrow(ForbiddenException);
    expect(prisma.paymentRefund.update).not.toHaveBeenCalled();
  });

  it('filters merchant reviews and rejects cross-region moderation before any write', async () => {
    const { service, prisma } = createService();
    prisma.merchant = {
      findMany: jest.fn().mockResolvedValue([{ id: 'merchant-a' }]),
      findUnique: jest.fn().mockResolvedValue({ id: 'merchant-b', regionId: 'region-b' }),
    };
    prisma.review = {
      findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue({ id: 'review-b', merchantId: 'merchant-b' }), update: jest.fn(),
    };

    await service.reviews({}, 'admin-a');
    expect(prisma.review.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { merchantId: { in: ['merchant-a'] } },
    }));
    await expect(service.deleteReview('review-b', 'admin-a')).rejects.toThrow(ForbiddenException);
    expect(prisma.review.update).not.toHaveBeenCalled();
  });

  it('adds the server-side region scope to merchant lists and rejects cross-region merchant details', async () => {
    const { service, prisma, scope } = createService();
    prisma.merchant.findUnique.mockResolvedValue({ id: 'merchant-b', regionId: 'region-b' });
    scope.assertRegionAccess.mockRejectedValue(new ForbiddenException('无权访问该区域数据'));

    await service.merchants({}, 'admin-a');
    expect(prisma.merchant.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ regionId: { in: ['region-a'] } }),
    }));

    await expect(service.merchantDetail('merchant-b', 'admin-a')).rejects.toThrow(ForbiddenException);
    expect(scope.assertRegionAccess).toHaveBeenCalledWith('admin-a', 'region-b');
  });

  it('filters merchant settlements by the operator region and blocks cross-region generation before locking', async () => {
    const { service, prisma, scope, redis } = createService();
    prisma.merchant.findUnique.mockResolvedValue({ id: 'merchant-b', regionId: 'region-b', region: { commissionRate: 0 } });

    await service.merchantSettlements({ merchantName: '跨区店' }, 'admin-a');
    expect(prisma.merchantSettlement.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { merchant: { regionId: { in: ['region-a'] }, name: { contains: '跨区店' } } },
    }));

    await expect(service.generateMerchantSettlement({
      merchantId: 'merchant-b', period: '2026-07',
    }, 'admin-a')).rejects.toThrow(ForbiddenException);
    expect(scope.getAdminContext).toHaveBeenCalledWith('admin-a');
    expect(redis.getLock).not.toHaveBeenCalled();
  });

  it('filters withdrawal lists and rejects cross-region withdrawal review before any status write', async () => {
    const { service, prisma } = createService();
    prisma.withdraw.findUnique.mockResolvedValue({ id: 'withdraw-b', userId: 'user-b', status: 'PENDING' });
    prisma.user = { findUnique: jest.fn().mockResolvedValue({
      id: 'user-b',
      profile: { regionId: 'region-b' },
      addresses: [],
      posts: [],
      botAccount: null,
    }) };

    await service.withdraws({}, 'admin-a');
    expect(prisma.withdraw.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ user: expect.objectContaining({ OR: expect.any(Array) }) }),
    }));

    await expect(service.auditWithdraw('withdraw-b', { status: 'approved' }, 'admin-a')).rejects.toThrow(ForbiddenException);
    expect(prisma.withdraw.update).toBeUndefined();
  });

  it('blocks a regional admin from reading or adjusting another region user wallet by user id', async () => {
    const { service, prisma } = createService();
    prisma.user = { findUnique: jest.fn().mockResolvedValue({
      id: 'user-b',
      profile: { regionId: 'region-b' },
      addresses: [],
      posts: [],
      botAccount: null,
    }) };
    prisma.walletTransaction = { findMany: jest.fn(), count: jest.fn(), create: jest.fn() };

    await expect(service.userBalanceLogs('user-b', {}, 'admin-a')).rejects.toThrow(ForbiddenException);
    await expect(service.userBalanceAdjust({ userId: 'user-b', amount: 10, reason: '跨区测试' }, 'admin-a')).rejects.toThrow(ForbiddenException);
    expect(prisma.walletTransaction.findMany).not.toHaveBeenCalled();
  });
});
