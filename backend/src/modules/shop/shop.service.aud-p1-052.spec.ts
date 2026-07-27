import { ShopService } from './shop.service';

describe('AUD-P1-052 ShopService payment expiry', () => {
  it('claims a pending order before restoring its membership reservation', async () => {
    const order: any = { id: 'shop-1', status: 'PENDING_PAY', userId: 'user-1', orderNo: 'SHOP-1' };
    const tx: any = {
      order: { findUnique: jest.fn().mockResolvedValue(order), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      orderLog: { create: jest.fn() },
      subsidyLedger: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma: any = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const membershipService: any = { restoreBenefitUsagesForTarget: jest.fn().mockResolvedValue(undefined) };
    const service = new ShopService(prisma, {} as any, membershipService);
    jest.spyOn(service as any, 'restoreOrderCoupon').mockResolvedValue(undefined);

    await expect(service.expirePendingPayment('shop-1')).resolves.toBe(true);
    expect(tx.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'shop-1', status: 'PENDING_PAY' },
      data: expect.objectContaining({ status: 'CANCELLED', cancelReason: '支付超时自动取消' }),
    }));
    expect(membershipService.restoreBenefitUsagesForTarget).toHaveBeenCalledWith('shop_order', 'shop-1', tx);
    expect(tx.orderLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'CANCELLED', operatorType: 'system', remark: '支付超时自动取消' }),
    }));
  });

  it('does not restore an order that was already paid or cancelled', async () => {
    const tx: any = { order: { findUnique: jest.fn().mockResolvedValue({ id: 'shop-1', status: 'PAID' }) } };
    const service = new ShopService({ $transaction: (fn: any) => fn(tx) } as any, {} as any, {} as any);

    await expect(service.expirePendingPayment('shop-1')).resolves.toBe(false);
  });
});
