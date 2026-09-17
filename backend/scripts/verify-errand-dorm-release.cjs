/* Run after nest build against an isolated PostgreSQL database created with
 * prisma db push. Writes synthetic fixtures; never point this at application data.
 * AUDIT_DATABASE_URL must name a local errand_dorm_audit database. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { reserveErrandCampaignBudget } = require('../dist/src/modules/errand/errand-transaction-guards');
const { ShopService } = require('../dist/src/modules/shop/shop.service');
const { ErrandService } = require('../dist/src/modules/errand/errand.service');
const { AddressService } = require('../dist/src/modules/address/address.service');
const { MallService } = require('../dist/src/modules/mall/mall.service');

const url = new URL(process.env.AUDIT_DATABASE_URL || 'http://missing');
assert(['127.0.0.1', 'localhost'].includes(url.hostname) && /^\/errand_dorm_audit(?:_|$)/.test(url.pathname), 'Only a dedicated local audit database is allowed');
const db = new PrismaClient({ datasources: { db: { url: url.href } } });
const run = `audit-${randomUUID()}`;
let checks = 0;
async function check(name, task) { await task(); checks++; console.log(`PASS ${name}`); }
const ledgerData = (campaignId, userId, amount, orderType, suffix) => ({
  subsidyNo: `${run}-${suffix}`, sourceType: 'coupon', campaignId,
  orderType, orderId: `${run}-${suffix}`, userId, amount, status: 'pending',
});

async function main() {
  await check('10 rounds of 12 concurrent shop/errand reservations share one budget', async () => {
    for (let trial = 0; trial < 10; trial++) {
    const campaign = { id: `${run}-concurrent-${trial}`, totalBudget: 10 };
    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => db.$transaction(async tx => {
      const now = new Date();
      await reserveErrandCampaignBudget(tx, campaign, `${run}-user-${i}`, 3, now);
      await tx.subsidyLedger.create({ data: { ...ledgerData(campaign.id, `${run}-user-${i}`, 3, i % 2 ? 'order' : 'errand_order', `concurrent-${trial}-${i}`), createdAt: now } });
    }, { isolationLevel: 'ReadCommitted', maxWait: 15000, timeout: 15000 })));
    for (const result of results.filter(r => r.status === 'rejected' && !/预算已不足/.test(r.reason.message))) {
      console.error('Unexpected reservation error', result.reason.code, result.reason.message);
    }
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 3);
    for (const result of results.filter(r => r.status === 'rejected')) assert.match(result.reason.message, /预算已不足/);
    const counter = await db.marketingCampaignBudgetCounter.findUnique({ where: { id: `${campaign.id}:total` } });
    assert.equal(Number(counter.spent), 9);
    assert.equal(counter.uses, 3);
    }
  });
  await check('legacy ledgers and cancelled spending repair stale counters', async () => {
    const campaign = { id: `${run}-legacy`, totalBudget: 10 };
    await db.marketingCampaignBudgetCounter.create({ data: { id: `${campaign.id}:total`, campaignId: campaign.id, scopeKey: 'total', spent: 100, uses: 9 } });
    await db.subsidyLedger.create({ data: ledgerData(campaign.id, `${run}-old`, 2, 'order', 'legacy-used') });
    await db.subsidyLedger.create({ data: { ...ledgerData(campaign.id, `${run}-old`, 98, 'order', 'legacy-cancelled'), status: 'cancelled' } });
    await db.$transaction(async tx => {
      await reserveErrandCampaignBudget(tx, campaign, `${run}-new`, 3);
      await tx.subsidyLedger.create({ data: ledgerData(campaign.id, `${run}-new`, 3, 'errand_order', 'legacy-new') });
    }, { isolationLevel: 'ReadCommitted' });
    const counter = await db.marketingCampaignBudgetCounter.findUnique({ where: { id: `${campaign.id}:total` } });
    assert.equal(Number(counter.spent), 5);
    assert.equal(counter.uses, 2);
  });

  const region = await db.region.create({ data: { name: '本地审计学校', code: run } });
  const user = await db.user.create({ data: { openid: `${run}-buyer` } });
  const stranger = await db.user.create({ data: { openid: `${run}-stranger` } });
  const merchant = await db.merchant.create({ data: { name: '本地审计宿舍小店', regionId: region.id, businessType: 'dorm_shop', deliveryMode: 'self_delivery', status: 'approved', minOrderAmount: 0 } });
  const product = await db.product.create({ data: { merchantId: merchant.id, name: '测试零食', images: [], price: 10, stock: 20 } });
  const address = await db.address.create({ data: { userId: user.id, regionId: region.id, specifiedAddressId: region.id, name: '私密测试姓名', phone: '13800138000', detail: '女生宿舍 308室', fullAddress: '女生宿舍 308室' } });
  const shop = new ShopService(db, { createAndDispatch: async () => ({}) }, { getUserBenefits: async () => ({ list: [] }) });
  const dto = { address_id: address.id };

  await check('private address ID and alias reject other users in PostgreSQL', async () => {
    const service = new AddressService(db);
    await assert.rejects(service.getDetail(address.id, stranger.id), /地址不存在/);
    const owner = await service.getDetail(address.id, user.id);
    assert(JSON.stringify(owner).includes('308'));
    const publicAlias = await service.getDetail(region.id, stranger.id);
    assert(!JSON.stringify(publicAlias).includes('308'));
    assert(!JSON.stringify(publicAlias).includes('13800138000'));
  });
  await check('two concurrent checkout requests consume one cart exactly once', async () => {
    await db.cart.create({ data: { userId: user.id, productId: product.id } });
    const results = await Promise.allSettled([shop.createOrder(merchant.id, user.id, dto), shop.createOrder(merchant.id, user.id, dto)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(await db.order.count({ where: { userId: user.id, merchantId: merchant.id } }), 1);
    assert.equal((await db.product.findUnique({ where: { id: product.id } })).stock, 19);
    assert.equal(await db.cart.count({ where: { userId: user.id } }), 0);
  });
  await check('cart edit between quote and commit preserves the new quantity', async () => {
    const cart = await db.cart.create({ data: { userId: user.id, productId: product.id } });
    const original = shop.resolveShopUserCoupon.bind(shop);
    shop.resolveShopUserCoupon = async (...args) => {
      await db.cart.update({ where: { id: cart.id }, data: { quantity: 2 } });
      return original(...args);
    };
    try { await assert.rejects(shop.createOrder(merchant.id, user.id, dto), /购物车已变化/); }
    finally { shop.resolveShopUserCoupon = original; }
    assert.equal((await db.cart.findUnique({ where: { id: cart.id } })).quantity, 2);
    assert.equal((await db.product.findUnique({ where: { id: product.id } })).stock, 19);
  });
  await check('ledger insert failure rolls back order, stock, cart, coupon and budget together', async () => {
    const coupon = await db.coupon.create({ data: { name: '本地审计券', type: 'FULL_REDUCTION', value: 1, totalCount: 10, startAt: new Date('2020-01-01'), endAt: new Date('2099-01-01') } });
    const receive = await db.couponReceive.create({ data: { userId: user.id, couponId: coupon.id } });
    const campaign = { id: `${run}-rollback`, couponId: coupon.id, status: 'active', totalBudget: 10 };
    await db.config.upsert({ where: { key: 'marketing_campaigns_config' }, create: { key: 'marketing_campaigns_config', value: { list: [campaign] } }, update: { value: { list: [campaign] } } });
    const duplicate = `${run}-duplicate`;
    await db.subsidyLedger.create({ data: { ...ledgerData(null, user.id, 1, 'order', 'existing'), subsidyNo: duplicate } });
    shop.subsidyNo = () => duplicate;
    await assert.rejects(shop.createOrder(merchant.id, user.id, { ...dto, coupon_id: receive.id }), error => error.code === 'P2002');
    assert.equal(await db.order.count({ where: { userId: user.id, merchantId: merchant.id } }), 1);
    assert.equal((await db.product.findUnique({ where: { id: product.id } })).stock, 19);
    assert.equal((await db.cart.findFirst({ where: { userId: user.id } })).quantity, 2);
    assert.equal((await db.couponReceive.findUnique({ where: { id: receive.id } })).status, 'unused');
    assert.equal((await db.coupon.findUnique({ where: { id: coupon.id } })).usedCount, 0);
    assert.equal(await db.marketingCampaignBudgetCounter.count({ where: { campaignId: campaign.id } }), 0);
  });
  await check('unassigned shop pool hides private data and detail rejects the rider', async () => {
    const order = await db.order.findFirst({ where: { userId: user.id, merchantId: merchant.id } });
    await db.order.update({ where: { id: order.id }, data: { status: 'PAID', payTime: new Date(), readyTime: new Date(), deliveryMode: 'platform_rider' } });
    const errands = Object.create(ErrandService.prototype);
    errands.prisma = db;
    errands.getOrderTakingIdentity = async () => ({ role: 'approved_rider', canTakeOrders: true, regionId: region.id });
    errands.getRiderDispatchContext = async () => ({});
    const result = await errands.getDeliveryOrdersList(stranger.id, { type: 'delivery', status: 'awaiting_delivery' });
    assert.equal(result.orders.length, 1);
    for (const secret of ['私密测试姓名', '13800138000', address.id, user.id]) assert(!JSON.stringify(result.orders).includes(secret));
    assert(!String(result.orders[0].delivery_area).includes('308'));
    for (const key of ['delivery_address', 'delivery_phone', 'delivery_contact', 'user', 'details', 'receipt_code']) assert(!Object.hasOwn(result.orders[0], key));
    await assert.rejects(errands.getRiderDeliveryOrderDetail(order.id, stranger.id), /尚未分配/);
  });
  await check('the shared mall coupon entry cannot bypass a budget consumed by shop and errand orders', async () => {
    const coupon = await db.coupon.create({ data: { name: '共用预算测试券', type: 'FULL_REDUCTION', value: 2, totalCount: 10, startAt: new Date('2020-01-01'), endAt: new Date('2099-01-01') } });
    const receive = await db.couponReceive.create({ data: { userId: user.id, couponId: coupon.id } });
    const campaign = { id: `${run}-concurrent-0`, couponId: coupon.id, status: 'active', totalBudget: 10 };
    await db.config.update({ where: { key: 'marketing_campaigns_config' }, data: { value: { list: [campaign] } } });
    const mall = Object.create(MallService.prototype);
    await assert.rejects(db.$transaction(tx => mall.resolveUserCoupon(tx, user.id, receive.id, 10, { regionId: region.id }), { isolationLevel: 'ReadCommitted' }), /预算已不足/);
    assert.equal((await db.couponReceive.findUnique({ where: { id: receive.id } })).status, 'unused');
  });
  console.log(JSON.stringify({ passed: checks, failed: 0, database: 'isolated local PostgreSQL', run }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
