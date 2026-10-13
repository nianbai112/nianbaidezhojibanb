import { errandPlatformFee, errandRiderIncome, merchantSettlementBase } from './commission';
import { MerchantService } from '../modules/merchant/merchant.service';
import { SystemConfigService } from '../modules/system-config/system-config.service';
import { FinanceAdminService } from '../modules/finance-admin/finance-admin.service';

describe('commission contracts', () => {
  it.each([
    { price: 1.45, rate: 0.1, fee: 0.15 },
    { price: 0.29, rate: 0.5, fee: 0.15 },
    { price: 7.5, rate: 0.07, fee: 0.53 },
  ])('rounds a half-cent fee consistently for $price at $rate', ({ price, rate, fee }) => {
    const order = { price, tip: 0, payAmount: 0 };
    expect(errandPlatformFee(order, { enabled: true, rate })).toBe(fee);
    expect(Math.round((fee + errandRiderIncome({ ...order, platformFee: fee })) * 100)).toBe(Math.round(price * 100));
  });
  it.each([10, 2, 0])('takes 10% of a 10-yuan order regardless of customer payment %s', paid => {
    const order = { price: 10, tip: 0, payAmount: paid, couponDiscount: 10 - paid };
    const fee = errandPlatformFee(order, { enabled: true, rate: 0.1, fixedFee: 0 });
    expect(fee).toBe(1);
    expect(errandRiderIncome({ ...order, platformFee: fee })).toBe(9);
  });

  it('uses the original total including tips and caps fees at that total', () => {
    const order = { price: 10, tip: 2, payAmount: 0 };
    expect(errandPlatformFee(order, { enabled: true, rate: 0.1, fixedFee: 0 })).toBe(1.2);
    expect(errandPlatformFee(order, { enabled: true, rate: 1, fixedFee: 99 })).toBe(12);
    expect(errandPlatformFee(order, { enabled: false, rate: 0.1, fixedFee: 0 })).toBe(0);
  });

  it('includes self-delivery revenue and subsidy, and removes partial refunds', () => {
    const order = { businessType: 'dorm_shop', payAmount: 15, subsidyAmount: 3, freightAmount: 2, originalFreightAmount: 3, refundStatus: 'partial', refundAmount: 4 };
    expect(merchantSettlementBase(order)).toBe(14);
    expect(merchantSettlementBase({ ...order, businessType: 'takeaway', deliveryMode: 'platform_rider' })).toBe(11);
    expect(merchantSettlementBase({ ...order, refundStatus: 'refunded' })).toBe(0);
    expect(merchantSettlementBase({ ...order, refundAmount: 99 })).toBe(0);
  });

  it('shows the effective regional rate instead of the abandoned merchant setting', async () => {
    const prisma: any = { regionMerchantSettings: { findUnique: jest.fn().mockResolvedValue({ commissionRate: 20, region: { name: '校区', commissionRate: 0.05 } }), upsert: jest.fn().mockResolvedValue({}) }, region: { findUnique: jest.fn().mockResolvedValue({ commissionRate: 0.05 }) } };
    const service = new MerchantService(prisma, {} as any);
    expect(await service.getRegionSettings('r')).toMatchObject({ commissionRate: 5 });
    await expect(service.upsertRegionSettings('r', { commissionRate: 20 })).rejects.toThrow('财务中心');
    await service.upsertRegionSettings('r', { commissionRate: 5, isOpen: true });
    expect(prisma.regionMerchantSettings.upsert).toHaveBeenCalledWith({ where: { regionId: 'r' }, create: { regionId: 'r', isOpen: true }, update: { isOpen: true } });
  });

  it('displays zero for a missing errand configuration and keeps a saved five percent', async () => {
    const prisma: any = { bizFeeConfig: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new SystemConfigService(prisma, {} as any);
    expect((await service.getBizFeeConfigs()).data.find(row => row.bizType === 'errand_order')).toMatchObject({ rate: 0, enabled: false });
    prisma.bizFeeConfig.findMany.mockResolvedValue([{ bizType: 'errand_order', rate: 0.05, fixedFee: 0, enabled: true,
      remark: '确认收货时按实付金额计算，扣除抽成后计入骑手收入' }]);
    expect((await service.getBizFeeConfigs()).data.find(row => row.bizType === 'errand_order')).toMatchObject({
      rate: 0.05, enabled: true, remark: '确认收货时按优惠前总金额（配送费＋小费）计算，优惠券不减少抽成基数',
    });
  });

  it.each([{ rate: NaN }, { rate: Infinity }, { rate: -1 }, { rate: 1.2 }, { rate: '0.05' }, { fixedFee: -1 }, { fixedFee: null }, { enabled: 'false' }])('rejects invalid fee settings %j', async dto => {
    const service = new SystemConfigService({} as any, {} as any);
    await expect(service.saveBizFeeConfig('errand_order', dto as any)).rejects.toThrow();
  });

  it('generates manual settlement from the same net amount as receipt credit', async () => {
    const tx: any = { riderSettlement: { create: jest.fn().mockResolvedValue({ id: 's' }) }, riderSettlementItem: { create: jest.fn() }, subsidyLedger: { updateMany: jest.fn() } };
    const prisma: any = {
      errandOrder: { findMany: jest.fn().mockResolvedValue([{ id: 'e', orderNo: 'E', riderId: 'rider', regionId: 'r', price: 10, tip: 2, platformFee: 0.6, completeTime: new Date('2026-09-11T12:00:00Z') }]) },
      order: { findMany: jest.fn().mockResolvedValue([]) },
      riderSettlement: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      riderSettlementItem: { findMany: jest.fn().mockResolvedValue([]) },
      orderAppeal: { findMany: jest.fn().mockResolvedValue([]) },
      deliveryRiskEvent: { findMany: jest.fn().mockResolvedValue([]) },
      errandSettlementHold: { findMany: jest.fn().mockResolvedValue([]) },
      subsidyLedger: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(fn => fn(tx)),
    };
    const scope: any = { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: true }) };
    const service = new FinanceAdminService(prisma, {} as any, scope);
    await service.generateRiderSettlements({ periodStart: '2026-09-11', periodEnd: '2026-09-12', regionId: 'r' });
    expect(tx.riderSettlement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ payableAmount: 11.4 }) }));
    expect(tx.riderSettlementItem.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ deliveryFeeAmount: 10, tipAmount: 2, payableAmount: 11.4 }) }));
  });
});
