import { MembershipService } from './membership.service';

describe('AUD-P1-051 MembershipService refund revocation', () => {
  it('adjusts a membership expiry with an auditable before-and-after record', async () => {
    const oldExpiry = new Date('2026-08-01T00:00:00.000Z');
    const tx: any = {
      userMembership: {
        findUnique: jest.fn().mockResolvedValue({ id: 'membership-1', userId: 'user-1', status: 'active', expiredAt: oldExpiry }),
        update: jest.fn().mockResolvedValue({}),
      },
      adminOperationLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new MembershipService({ $transaction: (fn: any) => fn(tx) } as any);

    await expect(service.adminAdjustMembershipExpiry('membership-1', 7, '活动补偿', 'admin-1')).resolves.toEqual(
      expect.objectContaining({ success: true, membershipId: 'membership-1', adjustmentDays: 7 }),
    );
    expect(tx.userMembership.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'membership-1' },
      data: expect.objectContaining({ status: 'active' }),
    }));
    expect(tx.adminOperationLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'ADJUST_MEMBERSHIP_EXPIRY', detail: expect.objectContaining({ beforeExpiredAt: oldExpiry.toISOString(), adjustmentDays: 7 }) }),
    }));
  });
  it('revokes only the membership and unconsumed grants issued by the refunded order', async () => {
    const tx: any = {
      membershipOrder: { findUnique: jest.fn().mockResolvedValue({ id: 'order-1', userId: 'user-1', status: 'paid' }) },
      userMembership: { findFirst: jest.fn().mockResolvedValue({ id: 'membership-1', sourceOrderId: 'order-1', userId: 'user-1' }), update: jest.fn().mockResolvedValue({}) },
      membershipBenefitGrant: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      membershipBenefitUsage: { count: jest.fn().mockResolvedValue(1) },
      couponReceive: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const prisma: any = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const service = new MembershipService(prisma);

    await expect(service.revokeMembershipOrder('order-1', '退款成功', tx)).resolves.toEqual(expect.objectContaining({
      revoked: true,
      membershipId: 'membership-1',
      usedBenefitCount: 1,
    }));

    expect(tx.membershipOrder.findUnique).toHaveBeenCalledWith({ where: { id: 'order-1' } });
    expect(tx.userMembership.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'membership-1' },
      data: expect.objectContaining({ status: 'revoked' }),
    }));
    expect(tx.membershipBenefitGrant.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { membershipId: 'membership-1', status: 'active' },
      data: expect.objectContaining({ status: 'revoked' }),
    }));
    expect(tx.couponReceive.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', sourceMembershipId: 'membership-1', status: 'unused' },
      data: { status: 'expired' },
    });
  });

  it('does not guess which historical membership to revoke when the order has no source link', async () => {
    const tx: any = {
      membershipOrder: { findUnique: jest.fn().mockResolvedValue({ id: 'legacy-order', userId: 'user-1', status: 'paid' }) },
      userMembership: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
    };
    const service = new MembershipService({ $transaction: (fn: any) => fn(tx) } as any);

    await expect(service.revokeMembershipOrder('legacy-order', '退款成功', tx)).resolves.toEqual({
      revoked: false,
      reason: 'membership_source_not_found',
    });
    expect(tx.userMembership.update).not.toHaveBeenCalled();
  });

  it('links a historical paid order only to an explicitly selected membership of the same user and records the operator decision', async () => {
    const tx: any = {
      membershipOrder: { findUnique: jest.fn().mockResolvedValue({ id: 'legacy-order', userId: 'user-1', status: 'paid' }) },
      userMembership: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({ id: 'membership-1', userId: 'user-1', sourceOrderId: null }),
        update: jest.fn().mockResolvedValue({}),
      },
      adminOperationLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new MembershipService({ $transaction: (fn: any) => fn(tx) } as any);

    await expect(service.adminLinkHistoricalOrderMembership('legacy-order', 'membership-1', '核对历史支付凭证后关联', 'admin-1')).resolves.toEqual(
      expect.objectContaining({ success: true, orderId: 'legacy-order', membershipId: 'membership-1' }),
    );
    expect(tx.userMembership.update).toHaveBeenCalledWith({ where: { id: 'membership-1' }, data: { sourceOrderId: 'legacy-order' } });
    expect(tx.adminOperationLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'LINK_HISTORICAL_MEMBERSHIP_ORDER', targetId: 'legacy-order', detail: expect.objectContaining({ membershipId: 'membership-1' }) }),
    }));
  });
});

describe('MembershipService benefit consumption concurrency', () => {
  const grant = {
    id: 'grant-1', userId: 'user-1', benefitKey: 'activity_discount', benefitName: '活动优惠',
    category: 'discount', unlimited: false, usedQuota: 0, totalQuota: 1, status: 'active',
    expiredAt: new Date('2099-01-01T00:00:00.000Z'),
  };

  it('accepts canonical order target types and claims finite quota conditionally', async () => {
    const tx: any = {
      membershipBenefitUsage: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'usage-1', idempotencyKey: 'grant-1:activity_order:order-1' }),
      },
      membershipBenefitGrant: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ ...grant, usedQuota: 1 }),
      },
    };
    const prisma: any = {
      membershipBenefitGrant: { findFirst: jest.fn().mockResolvedValue(grant) },
      membershipBenefitUsage: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    const service = new MembershipService(prisma);

    await expect(service.consumeBenefit('user-1', 'activity_discount', {
      targetType: 'activity_order', targetId: 'order-1', quantity: 1,
    })).resolves.toEqual(expect.objectContaining({ usage: expect.objectContaining({ id: 'usage-1' }) }));

    expect(tx.membershipBenefitGrant.updateMany).toHaveBeenCalledWith({
      where: { id: 'grant-1', status: 'active', usedQuota: { lte: 0 } },
      data: { usedQuota: { increment: 1 } },
    });
    expect(tx.membershipBenefitUsage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ idempotencyKey: 'grant-1:activity_order:order-1' }),
    }));
  });

  it('returns an existing idempotent usage without consuming quota again', async () => {
    const existing = { id: 'usage-existing', grantId: 'grant-1', idempotencyKey: 'grant-1:shop_order:order-1' };
    const prisma: any = {
      membershipBenefitGrant: { findFirst: jest.fn().mockResolvedValue(grant) },
      membershipBenefitUsage: { findUnique: jest.fn().mockResolvedValue(existing) },
      $transaction: jest.fn(),
    };
    const service = new MembershipService(prisma);

    await expect(service.consumeBenefit('user-1', 'activity_discount', {
      targetType: 'shop_order', targetId: 'order-1',
    })).resolves.toEqual(expect.objectContaining({ usage: existing, duplicated: true }));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
