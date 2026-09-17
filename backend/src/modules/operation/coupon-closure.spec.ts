import { OperationService } from './operation.service';
import { ErrandService } from '../errand/errand.service';
import { ShopService } from '../shop/shop.service';
import { MarketingAdminService } from '../marketing-admin/marketing-admin.service';
import { CouponAdminService } from '../coupon-admin/coupon-admin.service';
import { assertCouponConfiguration, reserveCouponIssue } from '../../common/coupon-policy';
const coupon = (o: any = {}) => ({ id: 'coupon', name: '测试券', type: 'FULL_REDUCTION', value: 3, minAmount: 0,
  businessScope: 'all', status: 'active', totalCount: 100, receivedCount: 0, usedCount: 0, limitPerUser: 1,
  regionId: null, merchantId: null, startAt: new Date(Date.now() - 86400000), endAt: new Date(Date.now() + 86400000), ...o });
const receipt = (c: any) => ({ id: 'r-' + c.id, couponId: c.id, coupon: c, userId: 'user', status: 'unused', createdAt: new Date() });
function matches(row: any, where: any = {}): boolean {
  return Object.entries(where).every(([key, v]: [string, any]) => {
    if (key === 'OR') return v.some((w: any) => matches(row, w));
    if (key === 'AND') return v.every((w: any) => matches(row, w));
    const a = row?.[key];
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('in' in v) return v.in.includes(a);
      if ('not' in v) return a !== v.not;
      if ('gte' in v) return a >= v.gte;
      if ('gt' in v) return a > v.gt;
      if ('lte' in v) return a <= v.lte;
      if ('lt' in v) return a < v.lt;
      return matches(a, v);
    }
    return a === v;
  });
}
function fixture(coupons: any[] = [coupon()], receives: any[] = [], campaigns: any[] = []) {
  const clone = (v: any) => structuredClone(v);
  const list = (rows: any[], a: any) => clone(rows.filter(r => matches(r, a.where)).slice(a.skip || 0, (a.skip || 0) + (a.take ?? rows.length)));
  const db: any = {
    coupon: {
      findUnique: jest.fn(async ({ where }) => clone(coupons.find(c => matches(c, where)))),
      findMany: jest.fn(async a => list(coupons, a)), count: jest.fn(async ({ where }) => coupons.filter(c => matches(c, where)).length),
      updateMany: jest.fn(async ({ where, data }) => { const rows = coupons.filter(c => matches(c, where)); rows.forEach(c => c.receivedCount += data.receivedCount.increment); return { count: rows.length }; }),
    },
    couponReceive: {
      findMany: jest.fn(async a => list(receives, a)), findFirst: jest.fn(async ({ where }) => clone(receives.find(r => matches(r, where)))),
      count: jest.fn(async ({ where }) => receives.filter(r => matches(r, where)).length), groupBy: jest.fn(async () => []),
      create: jest.fn(async ({ data }) => { const r = { ...receipt(coupons.find(c => c.id === data.couponId)), ...data }; receives.push(r); return clone(r); }),
    },
    config: { findUnique: jest.fn(async () => ({ value: { list: campaigns } })) },
    order: { count: jest.fn(async () => 0) }, errandOrder: { count: jest.fn(async () => 0) },
    user: { findUnique: jest.fn(async () => ({ createdAt: new Date() })) },
    subsidyLedger: { aggregate: jest.fn(async () => ({ _sum: { amount: 0 }, _count: 0 })) },
  };
  // This fixture exercises async interleaving, not real transaction rollback/isolation.
  db.$transaction = async (fn: any) => fn(db);
  const member: any = { getUserBenefits: jest.fn(async () => ({ list: [] })) };
  const operation: any = new OperationService(db, {} as any, {} as any, member, {} as any, { assertStudentProtectedAction: async () => {} } as any);
  const rawQuote: any = { baseFee: 10, sizeFee: 0, distanceFee: 0, weightFee: 0, timeFee: 0, riderSurcharge: 0, tip: 2, pricingSnapshot: { regionId: 'region' } };
  const errand: any = new ErrandService(db, {} as any, {} as any, member, {} as any, {} as any, {} as any, { quote: async () => rawQuote } as any);
  const shop: any = new ShopService(db, {} as any, member);
  return { db, operation, errand, shop, member, rawQuote, coupons, receives };
}
describe('coupon issuance, eligibility and accounting closure', () => {
  it('lists active started coupons and aligns the legacy claim flag with the user limit', async () => {
    const f = fixture([coupon(), coupon({ id: 'paused', status: 'inactive' }), coupon({ id: 'future', startAt: new Date(Date.now() + 60000) })]);
    expect((await f.operation.getAvailableCoupons('user', { region_id: 'region' })).list.map((c: any) => c.id)).toEqual(['coupon']);
    expect(f.operation.formatAvailableCoupon(coupon({ limitPerUser: 2 }), 1)).toMatchObject({ is_claimed: false, has_claimed: true, can_claim: true });
    expect(f.operation.formatAvailableCoupon(coupon({ limitPerUser: 2 }), 2)).toMatchObject({ is_claimed: true, can_claim: false });
    expect(f.operation.formatUserCoupon(coupon({ businessScope: 'errand' }))).toMatchObject({ is_universal: false, applicable_to_module: true });
    expect(f.operation.formatUserCoupon(coupon())).toMatchObject({ is_universal: true, applicable_to_module: false });
  });
  it('returns all receipts and derives expiry without mutating records', async () => {
    const c = coupon(), expired = coupon({ id: 'expired', endAt: new Date(Date.now() - 1000) }); const f = fixture([c, expired], [receipt(c), receipt(expired)]);
    const all = await f.operation.getMyCoupons('user', { status: 'all' }); expect(all.total).toBe(2);
    expect(all.list.find((r: any) => r.coupon_id === 'expired').status).toBe('expired');
    expect((await f.operation.getMyCoupons('user', { status: 'expired' })).total).toBe(1);
    expect((await f.operation.getMyCoupons('user', { status: 'unused' })).total).toBe(1);
    expect(f.receives[1].status).toBe('unused');
  });
  it.each([{ totalCount: 1, limitPerUser: 10 }, { totalCount: 10, limitPerUser: 1 }])('prevents concurrent duplicate claims with %j', async limits => {
    const f = fixture([coupon(limits)]);
    const attempts = await Promise.allSettled(Array.from({ length: 6 }, () => f.operation.claimCoupon('coupon', 'user', {})));
    expect(attempts.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(f.receives).toHaveLength(1); expect(f.coupons[0].receivedCount).toBe(1);
  });
  it('allows an operator to override the user limit but never stock', async () => {
    const f = fixture([coupon({ totalCount: 2 })]);
    await expect(reserveCouponIssue(f.db, 'coupon', 'user', 2)).rejects.toThrow('领取上限');
    await reserveCouponIssue(f.db, 'coupon', 'user', 2, { ignoreUserLimit: true });
    expect(f.coupons[0].receivedCount).toBe(2);
    await expect(reserveCouponIssue(f.db, 'coupon', 'user', 1, { ignoreUserLimit: true })).rejects.toThrow('库存');
  });
  it('checks redeem count atomically before creating a receipt or record', async () => {
    const f = fixture(); f.db.couponRedeemCode = {
      findUnique: jest.fn(async () => ({ id: 'code', coupon: coupon(), status: 'active', usedCount: 0, totalLimit: 1, perUserLimit: 1 })),
      updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValue({ count: 0 }),
    };
    f.db.couponRedeemRecord = { count: jest.fn(async () => 0), create: jest.fn() };
    await expect(f.operation.redeemCoupon('user', { code: 'CODE' })).rejects.toThrow('兑换码状态已变化');
    expect(f.db.couponRedeemCode.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ usedCount: 0, totalLimit: { gt: 0 } }) }));
    expect(f.db.couponReceive.create).not.toHaveBeenCalled(); expect(f.db.couponRedeemRecord.create).not.toHaveBeenCalled();
  });
  it('filters shop region/merchant and goods threshold before pagination', async () => {
    const cs = [coupon({ id: 'other-shop', merchantId: 'other' }), coupon({ id: 'other-region', regionId: 'other' }), coupon({ id: 'threshold', minAmount: 20 }), coupon({ id: 'inactive', status: 'inactive' }), coupon()];
    const f = fixture(cs, cs.map(receipt));
    const r = await f.operation.getMyCoupons('user', { module: 'takeout', merchant_id: 'shop', region_id: 'region', goods_amount: 18, limit: 1 });
    expect(r.list.map((x: any) => x.coupon_id)).toEqual(['coupon']); expect(r.total).toBe(1);
  });
  it('finds an errand coupon after 30 coupons for other modules', async () => {
    const cs = [...Array.from({ length: 30 }, (_, i) => coupon({ id: 'mall-' + i, businessScope: 'mall' })), coupon()]; const f = fixture(cs, cs.map(receipt));
    const r = await f.errand.getAvailableCoupons('user', { amount: 10, region_id: 'region', limit: 30 });
    expect(r.data.list.map((x: any) => x.coupon_id)).toEqual(['coupon']); expect(r.data.usable_count).toBe(1);
  });
  it.each(['inactive', 'future', 'firstOrder', 'newUser', 'totalBudget', 'dailyBudget', 'perUserBudget', 'userLimit'])('shares %s campaign rejection between selection and checkout', async rule => {
    const campaign: any = { id: 'campaign', couponId: 'coupon', status: 'active' }; const c = coupon(); const f = fixture([c], [receipt(c)], [campaign]);
    if (rule === 'inactive') campaign.status = 'inactive';
    if (rule === 'future') campaign.startAt = new Date(Date.now() + 60000).toISOString();
    if (rule === 'firstOrder') { campaign.firstOrderOnly = true; f.db.errandOrder.count.mockResolvedValue(1); f.db.order.count.mockResolvedValue(1); }
    if (rule === 'newUser') { campaign.newUserOnly = true; f.db.user.findUnique.mockResolvedValue({ createdAt: new Date(0) }); }
    if (['totalBudget', 'dailyBudget', 'perUserBudget'].includes(rule)) campaign[rule] = 2;
    if (rule === 'userLimit') { campaign.userLimit = 1; f.db.subsidyLedger.aggregate.mockResolvedValue({ _sum: { amount: 0 }, _count: 1 }); }
    expect((await f.errand.getAvailableCoupons('user', { amount: 10, region_id: 'region' })).data.list).toHaveLength(0);
    await expect(f.errand.resolveErrandUserCoupon(f.db, 'user', 'r-coupon', 10, 'region')).rejects.toThrow();
    expect((await f.operation.getMyCoupons('user', { module: 'takeout', amount: 10 })).list).toHaveLength(0);
    await expect(f.shop.resolveShopUserCoupon(f.db, 'user', 'r-coupon', 10, {})).rejects.toThrow();
  });
  it.each([{ value: 10, type: 'FULL_REDUCTION', member: 0, pay: 2 }, { value: 7, type: 'FULL_REDUCTION', member: 3, pay: 2 }, { value: 8, type: 'DISCOUNT', member: 5, pay: 5 }])('caps actual discounts and preserves tips for %j', async scenario => {
    const c = coupon(scenario); const f = fixture([c], [receipt(c)]);
    f.member.getUserBenefits.mockResolvedValue({ list: [{ benefitKey: 'errand_service_discount', discountRate: 5 }] });
    const r = await f.errand.buildOrderQuote('user', { coupon_id: 'r-coupon' });
    expect(r.quote.payAmount).toBe(scenario.pay); expect(r.memberDiscount.amount).toBe(scenario.member);
    expect(r.quote.couponDiscount + r.memberDiscount.amount).toBeLessThanOrEqual(10);
    expect(r.quote.payAmount + r.quote.couponDiscount + r.memberDiscount.amount).toBe(12);
  });
  it.each([0, -1, 0.001, 10, 12, NaN, Infinity])('rejects invalid discount value %s in both admin APIs', value => {
    const p = coupon({ type: 'DISCOUNT', value });
    expect(() => (Object.create(MarketingAdminService.prototype) as any).normalizeCouponPayload(p)).toThrow();
    expect(() => (Object.create(CouponAdminService.prototype) as any).normalizeCouponPayload(p)).toThrow();
  });
  it('accepts eight-fold coupons but rejects invalid quantities, dates, threshold and stock reduction', () => {
    expect(() => assertCouponConfiguration(coupon({ type: 'DISCOUNT', value: 8 }))).not.toThrow();
    for (const o of [{ totalCount: 0 }, { totalCount: 2.1 }, { limitPerUser: 0 }, { minAmount: -1 }, { startAt: 'bad' }, { totalCount: 1, receivedCount: 2 }]) expect(() => assertCouponConfiguration(coupon(o))).toThrow();
  });
  it('returns a real shop cart coupon count using goods amount and campaign eligibility', async () => {
    const cs = [coupon(), coupon({ id: 'threshold', minAmount: 20 }), coupon({ id: 'paused-campaign' }), coupon({ id: 'other-shop', merchantId: 'other' })];
    const f = fixture(cs, cs.map(receipt), [{ id: 'campaign', couponId: 'paused-campaign', status: 'inactive' }]);
    f.db.merchant = { findUnique: async () => ({ id: 'shop', regionId: 'region', businessType: 'dorm_shop', deliveryFee: 2, packagingFee: 0 }) };
    f.db.cart = { findMany: async () => [{ id: 'cart', productId: 'product', quantity: 1, modifierSelections: [], product: { id: 'product', name: '商品', status: 'on_sale', stock: 8, price: 18, images: [] } }] };
    f.db.address = { findFirst: async () => null };
    const cart = await f.shop.getCart('shop', 'user');
    expect(cart.goods_amount).toBe('18.00');
    expect(cart.available_coupons_count).toBe(1);
  });
});
