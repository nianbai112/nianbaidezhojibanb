import * as transactions from './purchase.transactions';
import { PurchaseService } from './purchase.service';
import { CHANGE_BIZ, PURCHASE_BIZ } from './purchase.policy';

const past = new Date(Date.now() - 86400000);
const future = new Date(Date.now() + 86400000);
const coupon = (patch: Record<string, any> = {}) => ({
  id: 'c1', name: '跑腿立减', type: 'FULL_REDUCTION', value: 2, minAmount: 0, status: 'active',
  businessScope: 'errand', merchantId: null, regionId: null, startAt: past, endAt: future, ...patch,
});

// Default policy: service ¥3 + delivery ¥4 = 700 cents; one ¥5.90 item = 590 cents of goods.
function setup(couponPatch: Record<string, any> = {}, receivePatch: Record<string, any> = {}) {
  const address = { id: 'address', userId: 'user', regionId: 'school', name: '同学', phone: '13800000000', fullAddress: '东区公寓', dormitoryNumber: '3栋-402', latitude: 30, longitude: 106 };
  const shop = { id: 'shop', regionId: 'school', name: '茶店', address: '校内茶店', phone: '', latitude: 30, longitude: 106, enabled: true, opensAt: '00:00', closesAt: '00:00', version: 1 };
  const receive = { id: 'r1', userId: 'user', couponId: 'c1', status: 'unused', coupon: coupon(couponPatch), ...receivePatch };
  const db: any = {
    config: { findUnique: jest.fn().mockResolvedValue({ value: { enabled: true } }) },
    region: { findUnique: jest.fn().mockResolvedValue({ isOpen: true }) },
    address: { findFirst: jest.fn().mockResolvedValue(address) },
    purchaseSku: { findMany: jest.fn().mockResolvedValue([{ id: 'sku', name: '霸王桶', priceCents: 590, weightGrams: 500, product: { id: 'product', name: '柠檬茶', shopId: 'shop', enabled: true, shop } }]) },
    purchaseModifierGroup: { findMany: jest.fn().mockResolvedValue([]) },
    purchaseCombination: { findMany: jest.fn().mockResolvedValue([]) },
    couponReceive: {
      findFirst: jest.fn().mockResolvedValue(receive),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    coupon: { update: jest.fn() },
    subsidyLedger: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 }, _count: 0 }),
    },
    errandPurchase: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
    errandOrder: { create: jest.fn().mockResolvedValue({ id: 'order1' }), update: jest.fn(), findUnique: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    purchaseEvent: { create: jest.fn() },
    purchaseChange: { updateMany: jest.fn() },
    purchaseRefund: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    order: { count: jest.fn().mockResolvedValue(0) },
    regionRider: { updateMany: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue({ openid: 'o-miniapp' }) },
  };
  db.$transaction = (run: any) => run(db);
  const access: any = { assertStudentProtectedAction: jest.fn() };
  const payment: any = { wxUnifiedOrder: jest.fn().mockResolvedValue({}), refund: jest.fn().mockResolvedValue({ status: 'success' }) };
  const service = new PurchaseService(db, access, {} as any, payment, {} as any, {} as any);
  const body = { regionId: 'school', addressId: 'address', items: [{ skuId: 'sku', quantity: 1 }] };
  return { db, service, payment, body };
}

describe('代买优惠券报价：只抵扣服务费', () => {
  test('不选券时实付等于货款加服务费', async () => {
    const { service, body } = setup();
    const q = await service.quote('user', body);
    expect(q).toMatchObject({ goodsCents: 590, serviceCents: 700, totalCents: 1290, couponDiscountCents: 0, payCents: 1290, coupon: null });
  });

  test('跑腿券和通用券都可用，抵扣服务费，货款不变', async () => {
    for (const businessScope of ['errand', 'all']) {
      const { service, body } = setup({ businessScope });
      const q = await service.quote('user', { ...body, userCouponId: 'r1' });
      expect(q).toMatchObject({ goodsCents: 590, serviceCents: 700, couponDiscountCents: 200, payCents: 1090 });
      expect(q.coupon).toEqual({ userCouponId: 'r1', couponId: 'c1', name: '跑腿立减', discountCents: 200 });
    }
  });

  test('面额超过服务费时最多抵扣全部服务费，不碰货款', async () => {
    const { service, body } = setup({ value: 20 });
    const q = await service.quote('user', { ...body, userCouponId: 'r1' });
    expect(q.couponDiscountCents).toBe(700);
    expect(q.payCents).toBe(590);
  });

  test('折扣券按服务费打折', async () => {
    const { service, body } = setup({ type: 'DISCOUNT', value: 8 });
    const q = await service.quote('user', { ...body, userCouponId: 'r1' });
    expect(q.couponDiscountCents).toBe(140);
  });

  test('满减门槛只看服务费，货款不计入', async () => {
    const { service, body } = setup({ minAmount: 10 });
    await expect(service.quote('user', { ...body, userCouponId: 'r1' })).rejects.toThrow('满 ¥10.00 可用');
  });

  test('外卖券、商家券、其他校区券和已用券不能用', async () => {
    for (const [patch, receivePatch, message] of [
      [{ businessScope: 'shop' }, {}, '不适用于跑腿'],
      [{ merchantId: 'm1' }, {}, '商家专属券'],
      [{ regionId: 'other' }, {}, '不适用于当前区域'],
      [{}, { status: 'used' }, '已使用或已失效'],
    ] as const) {
      const { service, body } = setup(patch, receivePatch);
      await expect(service.quote('user', { ...body, userCouponId: 'r1' })).rejects.toThrow(message);
    }
  });
});

describe('代买下单核销优惠券', () => {
  test('在下单事务里核销券、按实付建单，并记一笔骑手补贴', async () => {
    const { db, service, body } = setup();
    jest.spyOn(service, 'detail').mockResolvedValue({ id: 'order1' } as any);
    const q = await service.quote('user', { ...body, userCouponId: 'r1' });
    await service.create('user', { ...body, userCouponId: 'r1', quoteHash: q.quoteHash, requestKey: 'k1' });
    const order = db.errandOrder.create.mock.calls[0][0].data;
    expect(order).toMatchObject({ price: 7, couponDiscount: 2, payAmount: 10.9 });
    expect(db.couponReceive.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', userId: 'user', status: 'unused' },
      data: { status: 'used', usedAt: expect.any(Date), orderNo: order.orderNo },
    });
    expect(db.coupon.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { usedCount: { increment: 1 } } });
    expect(db.subsidyLedger.create.mock.calls[0][0].data).toMatchObject({
      sourceType: 'coupon', orderType: 'errand_order', orderId: 'order1', receiverType: 'rider', amount: 2, payerType: 'platform',
    });
  });

  test('券在下单前被别处用掉时整单失败', async () => {
    const { db, service, body } = setup();
    const q = await service.quote('user', { ...body, userCouponId: 'r1' });
    db.couponReceive.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.create('user', { ...body, userCouponId: 'r1', quoteHash: q.quoteHash, requestKey: 'k2' }))
      .rejects.toThrow('优惠券已使用或已失效');
    expect(db.errandOrder.create).not.toHaveBeenCalled();
  });

  test('换券后报价哈希不同，旧报价不能下单', async () => {
    const { service, body } = setup();
    const withoutCoupon = await service.quote('user', body);
    await expect(service.create('user', { ...body, userCouponId: 'r1', quoteHash: withoutCoupon.quoteHash, requestKey: 'k3' }))
      .rejects.toThrow('请重新确认报价');
  });
});

describe('代买付款与取消', () => {
  const purchase = (orderPatch: Record<string, any> = {}) => ({
    id: 'order1', userId: 'user', createdAt: new Date(), initialGoodsCents: 590, approvedGoodsCents: 590, serviceCents: 700,
    order: { id: 'order1', userId: 'user', orderNo: 'DM1', status: 'pending_pay', couponDiscount: 2, payTime: null, riderId: null, ...orderPatch },
    stops: [], changes: [], refunds: [],
  });

  test('付款金额扣除优惠券', async () => {
    const { service, payment } = setup();
    jest.spyOn(service, 'detail').mockResolvedValue(purchase() as any);
    await service.pay('order1', 'user');
    expect(payment.wxUnifiedOrder.mock.calls[0][0].amount).toBe(10.9);
  });

  test('支付回调按扣券后的金额核对，金额不符时取消订单并退券', async () => {
    const paidWith = async (amount: number) => {
      const { db } = setup();
      db.errandOrder.findUnique.mockResolvedValue({ id: 'order1', type: 'purchase', riderId: null });
      db.errandPurchase.findUnique.mockResolvedValue(purchase());
      db.couponReceive.findFirst.mockResolvedValue({ id: 'r1', couponId: 'c1', status: 'used' });
      // A rejected payment is refunded in full through the purchase refund outbox.
      Object.assign(db.purchaseRefund, { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn() });
      db.purchaseChange.findMany = jest.fn().mockResolvedValue([]);
      db.paymentOrder = { findMany: jest.fn().mockResolvedValue([{ id: 'p1', amount, bizType: PURCHASE_BIZ, bizId: 'order1' }]) };
      await transactions.applyPurchasePayment(db, { id: 'p1', bizType: PURCHASE_BIZ, bizId: 'order1', userId: 'user', amount });
      const statuses = db.errandOrder.update.mock.calls.map((c: any) => c[0].data.status).filter(Boolean);
      return { statuses, restored: db.couponReceive.updateMany.mock.calls.length };
    };
    expect(await paidWith(10.9)).toEqual({ statuses: ['pending_accept'], restored: 0 });
    expect(await paidWith(12.9)).toEqual({ statuses: ['cancelled'], restored: 1 });
    expect(CHANGE_BIZ).not.toBe(PURCHASE_BIZ);
  });

  test('未付款取消立即退券', async () => {
    const { db, service } = setup();
    jest.spyOn(service, 'detail').mockResolvedValue(purchase() as any);
    jest.spyOn(transactions, 'lockPurchase').mockResolvedValue(purchase() as any);
    db.couponReceive.findFirst.mockResolvedValue({ id: 'r1', couponId: 'c1', status: 'used' });
    await service.cancel('order1', 'user', '不要了');
    expect(db.couponReceive.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', userId: 'user', orderNo: 'DM1', status: 'used' },
      data: { status: 'unused', usedAt: null, orderNo: null },
    });
  });

  test('已付款取消按实付退款，券等退款成功后再退', async () => {
    const { db, service } = setup();
    const paid = purchase({ status: 'pending_accept', payTime: new Date() });
    jest.spyOn(service, 'detail').mockResolvedValue(paid as any);
    jest.spyOn(transactions, 'lockPurchase').mockResolvedValue(paid as any);
    const refund = jest.spyOn(transactions, 'queuePurchaseRefund').mockResolvedValue(undefined as any);
    await service.cancel('order1', 'user', '不要了');
    expect(refund.mock.calls[0][2]).toBe(1090);
    expect(db.couponReceive.updateMany).not.toHaveBeenCalled();

    db.errandOrder.findUnique.mockResolvedValue({ id: 'order1', userId: 'user', orderNo: 'DM1' });
    db.couponReceive.findFirst.mockResolvedValue({ id: 'r1', couponId: 'c1', status: 'used' });
    const job = { id: 'f1', purchaseId: 'order1', kind: 'cancel', reason: '不要了', allocations: [{ bizType: PURCHASE_BIZ, bizId: 'order1', paymentId: 'p1', amountCents: 1090 }] };
    await (service as any).processRefund(job);
    expect(db.couponReceive.updateMany).toHaveBeenCalledTimes(1);

    db.couponReceive.updateMany.mockClear();
    await (service as any).processRefund({ ...job, id: 'f2', kind: 'shortage' });
    expect(db.couponReceive.updateMany).not.toHaveBeenCalled();
  });

  afterEach(() => jest.restoreAllMocks());
});
