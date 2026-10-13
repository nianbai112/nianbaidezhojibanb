/* Run only against a disposable PostgreSQL or MySQL DB; see the payout rollout report. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const url = new URL(process.env.RIDER_AUDIT_DATABASE_URL || 'http://invalid');
assert.ok(['postgresql:', 'mysql:'].includes(url.protocol));
assert.equal(url.hostname, '127.0.0.1');
assert.match(url.pathname, /^\/rider_payout_audit_[a-z0-9_]+$/);
assert.ok(process.env.RIDER_AUDIT_PRISMA_CLIENT, 'Generate an isolated Prisma client for the target database first');
process.env.TS_NODE_PROJECT = path.resolve(__dirname, '../tsconfig.json');
require('ts-node').register({ transpileOnly: true });
const { PrismaClient } = require(path.resolve(process.env.RIDER_AUDIT_PRISMA_CLIENT));
const { creditConfirmedRiderIncome } = require('../src/modules/rider-app/rider-income-credit.ts');
const { RiderPayoutService } = require('../src/modules/rider-payout/rider-payout.service.ts');
const { FinanceAdminService } = require('../src/modules/finance-admin/finance-admin.service.ts');
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const run = randomUUID().slice(0, 8);
const now = new Date();
const cfg = { appid: `wx-audit-${run}`, mchid: `merchant-audit-${run}` };
const redis = { withRenewingLock: async (_key, _ttl, fn) => fn() };

function barrier(count) {
  let arrivals = 0;
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  return async () => { if (++arrivals === count) release(); await ready; };
}

async function user(label) {
  const id = `${run}-${label}`;
  return db.user.create({ data: { id, openid: `open-${id}`, phone: '13800000000' } });
}

function income(rider, orderId) {
  return { orderType: 'errand', orderId, riderId: rider.id, ownerUserId: 'buyer',
    deliveryFeeAmount: 10, platformFeeAmount: 1, now };
}

// Force both real transactions to read the same debt before either writes.
function concurrentDebtClient(meet, modelName = 'riderLiability', operation = 'findMany') {
  return new Proxy(db, { get(target, property) {
    if (property !== '$transaction') return Reflect.get(target, property);
    return fn => db.$transaction(tx => fn(new Proxy(tx, { get(t, prop) {
      if (prop !== modelName) return Reflect.get(t, prop);
      return new Proxy(t[modelName], { get(model, op) {
        if (op !== operation) return Reflect.get(model, op);
        return async args => { const rows = await model[operation](args); await meet(); return rows; };
      } });
    } })), { timeout: 15000 });
  } });
}

async function debtRace(manual) {
  const rider = await user(manual ? 'debt-manual' : 'debt-auto');
  const debt = await db.riderLiability.create({ data: { riderId: rider.id, orderId: `${rider.id}-refund`,
    refundId: `${rider.id}-refund-id`, amount: 4 } });
  const parallel = concurrentDebtClient(barrier(2));
  const first = () => parallel.$transaction(tx => creditConfirmedRiderIncome(tx, income(rider, `${rider.id}-one`)));
  let second, retrySecond;
  if (manual) {
    const settlement = await db.riderSettlement.create({ data: { riderId: rider.id, settlementNo: `${rider.id}-manual`,
      periodStart: now, periodEnd: now, status: 'CONFIRMED', orderCount: 1, payableAmount: 9 } });
    const scope = { getAdminContext: async () => ({ isSuperAdmin: true, regionIds: [] }) };
    second = () => new FinanceAdminService(parallel, {}, scope).payRiderSettlement(settlement.id, {});
    retrySecond = () => new FinanceAdminService(db, {}, scope).payRiderSettlement(settlement.id, {});
  } else {
    second = () => parallel.$transaction(tx => creditConfirmedRiderIncome(tx, income(rider, `${rider.id}-two`)));
    retrySecond = () => db.$transaction(tx => creditConfirmedRiderIncome(tx, income(rider, `${rider.id}-two`)));
  }
  const results = await Promise.allSettled([first(), second()]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1, 'one stale transaction must roll back');
  const rejected = results.find(r => r.status === 'rejected');
  assert.ok(rejected.reason.code === 'P2034' || /负债已由其他订单/.test(rejected.reason.message), 'stale debt must roll back');
  if (results[0].status === 'rejected') await db.$transaction(tx => creditConfirmedRiderIncome(tx, income(rider, `${rider.id}-one`)));
  else await retrySecond();
  const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: rider.id } });
  assert.equal(Number(wallet.balance), 14, 'two 9-yuan incomes recover one 4-yuan debt');
  assert.equal(Number(wallet.totalIn), 14);
  assert.equal(Number((await db.riderLiability.findUniqueOrThrow({ where: { id: debt.id } })).recoveredAmount), 4);
  const paid = await db.riderSettlement.aggregate({ where: { riderId: rider.id }, _sum: { paidAmount: true } });
  assert.equal(Number(paid._sum.paidAmount), 14);
  console.log(`PASS: concurrent ${manual ? 'manual/automatic' : 'automatic/automatic'} debt recovery + rollback + retry`);
}

async function payoutOrder(service, label) {
  const rider = await user(label);
  const buyer = await user(`${label}-buyer`);
  await db.regionRider.create({ data: { userId: rider.id, regionId: 'audit', realName: '测试骑手', idCard: 'test', phone: rider.phone } });
  const auth = await db.riderWechatAuthorization.create({ data: { userId: rider.id, ...cfg, openid: rider.openid,
    sceneId: '1005', outAuthorizationNo: `${rider.id}-auth`, authorizationId: `${rider.id}-wxauth`, enabled: true, state: 'TAKING_EFFECT' } });
  const order = await db.errandOrder.create({ data: { id: `${rider.id}-order`, orderNo: `${rider.id}-no`, userId: buyer.id,
    riderId: rider.id, title: 'audit', pickupAddress: 'A', deliverAddress: 'B', price: 10, tip: 0,
    payAmount: 0, couponDiscount: 10, platformFee: 1, status: 'completed', receiptConfirmedAt: now, settlementEligibleAt: now } });
  await db.$transaction(tx => creditConfirmedRiderIncome(tx, { ...income(rider, order.id),
    reserveAutoPayout: (inner, amount) => service.reserve(inner, order, amount) }));
  return { rider, auth, order, row: await db.riderWechatPayout.findUniqueOrThrow({ where: { orderId_kind: { orderId: order.id, kind: 'delivery_fee' } } }) };
}

function response(row, state = 'SUCCESS') {
  return { out_bill_no: row.id, mch_id: row.mchid, appid: row.appid, openid: row.openid,
    transfer_amount: row.amountFen, transfer_bill_no: `wx-${row.id}`, state };
}

async function main() {
  const firstDay = await user('first-day');
  const firstDayClient = concurrentDebtClient(barrier(2), 'riderSettlementItem', 'findFirst');
  await Promise.all([1, 2].map(n => firstDayClient.$transaction(tx =>
    creditConfirmedRiderIncome(tx, income(firstDay, `${firstDay.id}-${n}`)))));
  const header = await db.riderSettlement.findFirstOrThrow({ where: { riderId: firstDay.id } });
  assert.equal(header.orderCount, 2); assert.equal(Number(header.paidAmount), 18);
  assert.equal(Number((await db.wallet.findUniqueOrThrow({ where: { userId: firstDay.id } })).balance), 18);
  console.log('PASS: concurrent first orders create one daily settlement and credit both incomes');
  await debtRace(false);
  await debtRace(true);
  await db.config.upsert({ where: { key: 'wechat_pay' }, create: { key: 'wechat_pay', value: { riderAutoPayoutEnabled: true } },
    update: { value: { riderAutoPayoutEnabled: true } } });
  const noNetwork = { runtime: async () => cfg, request: async () => { throw new Error('No real WeChat requests permitted'); } };
  const service = new RiderPayoutService(db, redis, noNetwork);
  const success = await payoutOrder(service, 'success');
  await Promise.all([service.consume(success.row, response(success.row)), service.consume(success.row, response(success.row))]);
  const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: success.rider.id } });
  assert.equal(Number(wallet.balance), 0); assert.equal(Number(wallet.freeze), 0); assert.equal(Number(wallet.totalOut), 9);
  assert.equal(await db.withdraw.count({ where: { userId: success.rider.id, status: 'SUCCESS' } }), 1);
  console.log('PASS: full-coupon 10 yuan -> 9 yuan payout; duplicate concurrent success consumes once');

  const fail = await payoutOrder(service, 'failed');
  await Promise.all([service.consume(fail.row, response(fail.row, 'FAIL')), service.consume(fail.row, response(fail.row, 'FAIL'))]);
  const returned = await db.wallet.findUniqueOrThrow({ where: { userId: fail.rider.id } });
  assert.equal(Number(returned.balance), 9); assert.equal(Number(returned.freeze), 0); assert.equal(Number(returned.totalOut), 0);
  assert.equal(await db.walletTransaction.count({ where: { orderNo: `WD_RETURN_${fail.row.id}` } }), 1);
  console.log('PASS: duplicate concurrent terminal failure returns funds exactly once');

  const corrupt = await payoutOrder(service, 'ledger');
  await db.walletTransaction.deleteMany({ where: { orderNo: corrupt.row.id } });
  await assert.rejects(service.consume(corrupt.row, response(corrupt.row)), /流水不一致/);
  assert.equal((await db.riderWechatPayout.findUniqueOrThrow({ where: { id: corrupt.row.id } })).status, 'QUEUED');
  assert.equal((await db.withdraw.findUniqueOrThrow({ where: { id: corrupt.row.id } })).status, 'PROCESSING');
  assert.equal(Number((await db.wallet.findUniqueOrThrow({ where: { userId: corrupt.rider.id } })).freeze), 9);
  console.log('PASS: inconsistent ledger rolls back payout, withdrawal and wallet together');

  // Purchase goods money is a second transfer on the same order, next to the delivery income.
  const notices = [];
  const notifying = new RiderPayoutService(db, redis, noNetwork, { createAndDispatch: async (dto, eventKey) => { notices.push([dto.title, eventKey]); } });
  const both = await payoutOrder(notifying, 'principal');
  await db.$transaction(async tx => {
    await tx.wallet.update({ where: { userId: both.rider.id }, data: { balance: { increment: 5 }, totalIn: { increment: 5 } } });
    assert.deepEqual(await notifying.reserve(tx, both.order, 5, 'purchase_principal'), { status: 'QUEUED', reason: '' });
  });
  const principal = await db.riderWechatPayout.findUniqueOrThrow({ where: { orderId_kind: { orderId: both.order.id, kind: 'purchase_principal' } } });
  assert.equal(principal.amountFen, 500);
  await assert.rejects(db.$transaction(tx => notifying.reserve(tx, both.order, 5, 'purchase_principal')), error => error.code === 'P2002');
  await Promise.all([notifying.consume(principal, response(principal)), notifying.consume(principal, response(principal))]);
  await notifying.consume(both.row, response(both.row));
  const settled = await db.wallet.findUniqueOrThrow({ where: { userId: both.rider.id } });
  assert.equal(Number(settled.balance), 0); assert.equal(Number(settled.freeze), 0); assert.equal(Number(settled.totalOut), 14);
  assert.equal(await db.withdraw.count({ where: { userId: both.rider.id, status: 'SUCCESS' } }), 2);
  assert.equal((await db.walletTransaction.findFirstOrThrow({ where: { orderNo: principal.id } })).description, `代买垫付货款已到账微信零钱 ${both.order.orderNo}`);
  assert.deepEqual(notices, [
    ['代买垫付货款 ¥5.00 已到账微信零钱', `rider_payout:${principal.id}`],
    ['跑腿报酬 ¥9.00 已到账微信零钱', `rider_payout:${both.row.id}`],
  ]);
  console.log('PASS: goods money and delivery income transfer separately on one order; duplicate reserve rolls back; each notifies once');

  await db.config.update({ where: { key: 'wechat_pay' }, data: { value: { riderAutoPayoutEnabled: true, riderTransferDailyAmount: 9 } } });
  const meet = barrier(2);
  const sent = [];
  const gateway = { runtime: async () => cfg, request: async (method, url, body) => {
    if (url.includes('out-authorization-no/')) {
      const auth = await db.riderWechatAuthorization.findUniqueOrThrow({ where: { outAuthorizationNo: url.split('/').pop() } });
      await meet();
      return { state: auth.state, authorization_id: auth.authorizationId, out_authorization_no: auth.outAuthorizationNo, openid: auth.openid };
    }
    if (method === 'POST') { sent.push(body.out_bill_no); return {}; }
    const row = await db.riderWechatPayout.findUniqueOrThrow({ where: { id: url.split('/').pop() } });
    return response(row);
  } };
  const racing = new RiderPayoutService(db, redis, gateway);
  const one = await payoutOrder(racing, 'quota-one');
  const two = await payoutOrder(racing, 'quota-two');
  const attempts = await Promise.allSettled([racing.process(one.row.id), racing.process(two.row.id)]);
  for (const result of attempts) if (result.status === 'rejected') assert.equal(result.reason.code, 'P2034');
  assert.equal(sent.length, 1, 'DB quota must hold even when Redis does not serialize dispatchers');
  const remaining = sent[0] === one.row.id ? two : one;
  await racing.process(remaining.row.id);
  assert.equal(sent.length, 1);
  assert.match((await db.riderWechatPayout.findUniqueOrThrow({ where: { id: remaining.row.id } })).reason, /今日自动转账额度/);
  console.log('PASS: concurrent independent dispatchers cannot overrun merchant daily quota');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
