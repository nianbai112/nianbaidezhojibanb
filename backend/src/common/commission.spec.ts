import { errandPlatformFee, errandRiderIncome, merchantSettlementBase } from './commission';
import { MerchantService } from '../modules/merchant/merchant.service';
import { SystemConfigService } from '../modules/system-config/system-config.service';
import { FinanceAdminService } from '../modules/finance-admin/finance-admin.service';

describe('commission contracts', () => {
  it('uses the paid errand base without taking away the coupon subsidy', () => {
    const order = { price: 10, tip: 2, payAmount: 8 };
    const fee = errandPlatformFee(order, { enabled: true, rate: 0.05, fixedFee: 0 });
    expect(fee).toBe(0.4);
    expect(errandRiderIncome({ ...order, platformFee: fee })).toBe(11.6);
    expect(errandPlatformFee({ ...order, payAmount: 0 }, { enabled: true, rate: 1, fixedFee: 99 })).toBe(0);
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
    prisma.bizFeeConfig.findMany.mockResolvedValue([{ bizType: 'errand_order', rate: 0.05, fixedFee: 0, enabled: true }]);
    expect((await service.getBizFeeConfigs()).data.find(row => row.bizType === 'errand_order')).toMatchObject({ rate: 0.05, enabled: true });
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
