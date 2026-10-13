/* Dedicated disposable PostgreSQL only. WeChat transport and notifications are stubbed. */
const assert = require("node:assert/strict");
const url = process.env.PURCHASE_TEST_DATABASE_URL || "";
if (
  !/^postgresql:\/\/[^@]+@127\.0\.0\.1:55439\/purchase_review(?:\?|$)/.test(url)
)
  throw new Error(
    "Use the disposable purchase_review database on 127.0.0.1:55439",
  );
require("ts-node").register({ transpileOnly: true });
const { PrismaClient } = require("@prisma/client");
const {
  PurchaseService,
} = require("../src/modules/errand-purchase/purchase.service");
const { PaymentService } = require("../src/modules/payment/payment.service");
const {
  ErrandLifecycleService,
} = require("../src/modules/errand/errand-lifecycle.service");
const {
  assertPurchaseAdvance,
  assertPurchaseReadyForDelivery,
  PURCHASE_TRANSACTION_OPTIONS,
} = require("../src/modules/errand-purchase/purchase.transactions");
const {
  lockErrandAssignee,
} = require("../src/modules/errand/errand-transaction-guards");
const prisma = new PrismaClient({ datasources: { db: { url } } });
const noOp = async () => {};
const redis = {
  getLock: async () => true,
  releaseLock: noOp,
  withLock: async (_key, _seconds, run) => run(),
};
const payment = new PaymentService({}, prisma, redis, {}, {});
payment.notifyAvailableErrandRiders = noOp;
payment.notifyShopRefundSuccess = noOp;
payment.getWxPayConfig = async () => ({});
let providerRefunds = 0;
payment.wxPayRequest = async (method, path) => {
  assert.equal(method, "POST");
  assert.equal(path, "/v3/refund/domestic/refunds");
  providerRefunds++;
  return { status: "SUCCESS", refund_id: `fake-refund-${providerRefunds}` };
};
const scope = {
  assertRegionAccess: async (admin, region) => {
    assert.equal(admin, "test-admin");
    assert.equal(region, "test-school");
  },
};
const service = new PurchaseService(
  prisma,
  { assertStudentProtectedAction: noOp },
  scope,
  payment,
  redis,
  { createAndDispatch: noOp },
);
const lifecycle = new ErrandLifecycleService(prisma);
const receipt = "https://example.invalid/test-purchase-proof.jpg";
let counter = 0;
const key = () => `test-${Date.now()}-${++counter}`;

async function pay(order, change) {
  const row = await prisma.paymentOrder.create({
    data: {
      paymentNo: key(),
      bizType: change ? "errand_purchase_change" : "errand_purchase",
      bizId: change?.id || order.id,
      orderNo: order.order.orderNo,
      userId: "test-buyer",
      amount: change
        ? change.deltaCents / 100
        : (order.initialGoodsCents + order.serviceCents) / 100,
    },
  });
  await Promise.all([
    payment.handlePaymentSuccess(row.paymentNo, "fake-wx-id"),
    payment.handlePaymentSuccess(row.paymentNo, "fake-wx-id"),
  ]);
  return row;
}
async function accept(id) {
  return prisma.$transaction(async (tx) => {
    await lockErrandAssignee(tx, "test-rider");
    const order = await tx.errandOrder.findUnique({ where: { id } });
    await assertPurchaseAdvance(tx, order, "test-rider");
    const claimed = await tx.errandOrder.updateMany({
      where: { id, status: "pending_accept", riderId: null },
      data: {
        riderId: "test-rider",
        status: "accepted",
        receiptCode: "123456",
      },
    });
    assert.equal(claimed.count, 1);
  }, PURCHASE_TRANSACTION_OPTIONS);
}

async function main() {
  assert.equal(
    await prisma.errandPurchase.count(),
    0,
    "Requires a fresh disposable database",
  );
  await prisma.region.create({
    data: { id: "test-school", name: "测试学校", code: key() },
  });
  await prisma.user.createMany({
    data: ["test-buyer", "test-rider", "test-outsider"].map((id) => ({
      id,
      openid: key(),
    })),
  });
  await prisma.regionRider.create({
    data: {
      userId: "test-rider",
      regionId: "test-school",
      realName: "测试骑手",
      idCard: "test",
      phone: "13800000000",
      verifyStatus: "approved",
      status: "online",
    },
  });
  await prisma.address.create({
    data: {
      id: "test-address",
      userId: "test-buyer",
      regionId: "test-school",
      name: "测试用户",
      phone: "13800000001",
      detail: "一号宿舍 101",
      latitude: 30,
      longitude: 120,
    },
  });
  await service.savePolicy("test-admin", "test-school", {
    enabled: true,
    maxGoodsCents: 3000,
    maxOutstandingCents: 3500,
  });
  const configuration = await service.adminData("test-admin", "test-school");
  await assert.rejects(
    service.savePolicy("test-admin", "test-school", configuration.policy),
    /刷新/,
  );
  await service.savePolicy(
    "test-admin",
    "test-school",
    configuration.policy,
    configuration.policyVersion,
  );
  await assert.rejects(
    service.savePolicy(
      "test-admin",
      "test-school",
      configuration.policy,
      configuration.policyVersion,
    ),
    /其他管理员/,
  );
  const shopA = await service.saveShop("test-admin", "test-school", {
    name: "A店",
    address: "A地址",
    latitude: 30.001,
    longitude: 120,
    opensAt: "00:00",
    closesAt: "00:00",
    enabled: true,
  });
  const shopB = await service.saveShop("test-admin", "test-school", {
    name: "B店",
    address: "B地址",
    latitude: 30.002,
    longitude: 120,
    opensAt: "00:00",
    closesAt: "00:00",
    enabled: true,
  });
  for (const [shop, price] of [
    [shopA, 1200],
    [shopB, 800],
  ])
    await service.saveProduct("test-admin", "test-school", {
      shopId: shop.id,
      name: shop.name + "商品",
      enabled: true,
      skus: [
        { name: "标准", priceCents: price, weightGrams: 100, enabled: true },
      ],
    });
  const catalog = await service.catalog("test-school");
  const items = catalog.shops.map((s) => ({
    skuId: s.products[0].skus[0].id,
    quantity: 1,
  }));
  const base = {
    regionId: "test-school",
    addressId: "test-address",
    items,
    shortagePolicy: "refund_missing",
  };
  await assert.rejects(service.quote("test-buyer", base), /合单/);
  await assert.rejects(service.quote("test-outsider", base), /自己的收货地址/);
  await service.saveCombination("test-admin", "test-school", {
    name: "A+B",
    shopIds: [shopA.id, shopB.id],
    enabled: true,
    extraFeeCents: 200,
    maxGoodsCents: 3000,
  });
  const q = await service.quote("test-buyer", base);
  assert.equal(q.totalCents, 2900);
  const body = { ...base, quoteHash: q.quoteHash, requestKey: key() };
  const order = await service.create("test-buyer", body);
  assert.equal(
    Number(order.order.price),
    9,
    "Only service fees go into runner income",
  );
  assert.equal((await service.create("test-buyer", body)).id, order.id);
  await assert.rejects(service.detail(order.id, "test-outsider"), /无权/);
  const paid = await pay(order);
  assert.equal(
    await prisma.purchaseEvent.count({
      where: { purchaseId: order.id, kind: "prepaid" },
    }),
    1,
  );
  assert.equal(
    await prisma.platformLedger.count({ where: { orderNo: paid.paymentNo } }),
    1,
  );
  await accept(order.id);
  console.log(
    "PASS quote, exact combination, ownership, separate service fees, payment callback idempotency",
  );

  const detail = await service.detail(order.id, "test-rider");
  assert.equal(
    detail.order.receiptCode,
    undefined,
    "Rider cannot read the receipt code",
  );
  const stopA = detail.stops.find((s) => s.shopId === shopA.id),
    stopB = detail.stops.find((s) => s.shopId === shopB.id);
  await assert.rejects(
    assertPurchaseReadyForDelivery(prisma, detail.order),
    /凭证/,
  );
  await assert.rejects(
    lifecycle.markInProgress(order.id, "test-rider"),
    /凭证/,
  );
  const change = await service.propose(order.id, "test-rider", {
    requestKey: key(),
    itemId: stopA.items[0].id,
    quantity: 1,
    unitCents: 1500,
    reason: "到店涨价",
    evidenceUrls: [receipt],
  });
  assert.equal(change.deltaCents, 300);
  await service.respond(order.id, "test-buyer", change.id, true);
  assert.equal(
    (await service.detail(order.id, "test-buyer")).approvedGoodsCents,
    2000,
  );
  await pay(order, change);
  assert.equal(
    (await service.detail(order.id, "test-buyer")).approvedGoodsCents,
    2300,
  );
  const shortage = await service.propose(order.id, "test-rider", {
    requestKey: key(),
    itemId: stopB.items[0].id,
    quantity: 0,
    unitCents: 0,
    reason: "缺货",
    evidenceUrls: [receipt],
  });
  let adjusted = await service.detail(order.id, "test-buyer");
  assert.equal(adjusted.approvedGoodsCents, 1500);
  assert.equal(adjusted.refunds[0].amountCents, 800);
  await service.processRefund(adjusted.refunds[0]);
  await service.processRefund(adjusted.refunds[0]);
  assert.equal(
    providerRefunds,
    1,
    "Same refund allocation uses the same provider refund",
  );
  assert.equal(
    Number(
      (await prisma.paymentOrder.findUnique({ where: { id: paid.id } }))
        .refundedAmount,
    ),
    8,
  );
  assert.equal(
    (await prisma.errandOrder.findUnique({ where: { id: order.id } }))
      .refundStatus,
    "none",
    "Difference refund must not block fulfillment",
  );
  console.log(
    "PASS positive difference waits for payment, shortage refund, repeated refund stays idempotent",
  );

  await service.receipt(order.id, "test-rider", stopA.id, {
    actualCents: 1500,
    receiptUrls: [receipt],
  });
  await service.receipt(order.id, "test-rider", stopB.id, {
    actualCents: 0,
    receiptUrls: [],
  });
  await assert.rejects(
    service.receipt(order.id, "test-rider", stopA.id, {
      actualCents: 1500,
      receiptUrls: [receipt],
    }),
    /审核/,
  );
  await assertPurchaseReadyForDelivery(prisma, detail.order);
  await service.audit("test-admin", order.id, stopA.id, {
    approved: true,
    note: "测试凭证核对通过",
  });
  const debt = await prisma.riderLiability.create({
    data: {
      riderId: "test-rider",
      orderId: "historical-order",
      refundId: "historical-refund",
      amount: 100,
    },
  });
  await lifecycle.markInProgress(order.id, "test-rider");
  await lifecycle.markArrived(order.id, "test-rider", {
    proof_images: [receipt],
  });
  await lifecycle.confirmReceipt(order.id, "test-buyer");
  await lifecycle.confirmReceipt(order.id, "test-buyer");
  const income = await prisma.riderSettlementItem.findFirst({
    where: { orderId: order.id },
  });
  assert.equal(
    Number(income.deliveryFeeAmount),
    9,
    "Only service fees may enter rider income",
  );
  assert.equal(
    await prisma.riderSettlementItem.count({ where: { orderId: order.id } }),
    1,
  );
  const debtBeforePrincipal = Number(
    (await prisma.riderLiability.findUnique({ where: { id: debt.id } }))
      .recoveredAmount,
  );
  assert.ok(debtBeforePrincipal <= 9);
  console.log(
    "PASS real delivery and receipt lifecycle, service-only settlement, duplicate receipt protection",
  );
  await Promise.all([service.reimburse(order.id), service.reimburse(order.id)]);
  assert.equal(
    Number(
      (await prisma.wallet.findUnique({ where: { userId: "test-rider" } }))
        .balance,
    ),
    15,
  );
  assert.equal(
    await prisma.walletTransaction.count({
      where: { type: "PURCHASE_REIMBURSEMENT" },
    }),
    1,
  );
  assert.equal(
    Number(
      (await prisma.riderLiability.findUnique({ where: { id: debt.id } }))
        .recoveredAmount,
    ),
    debtBeforePrincipal,
    "Goods principal must never offset historical rider debt",
  );
  console.log(
    "PASS receipt gate, audit, no receipt-code leak, concurrent principal reimbursement exactly once",
  );

  const compensation = {
    amountCents: 400,
    reason: "商品体验补偿",
    costBearer: "platform",
    requestKey: key(),
  };
  await assert.rejects(
    service.compensate("test-admin", order.id, {
      ...compensation,
      costBearer: "rider",
    }),
    /平台承担/,
  );
  const refunds = await Promise.all([
    service.compensate("test-admin", order.id, compensation),
    service.compensate("test-admin", order.id, compensation),
  ]);
  assert.equal(refunds[0].refundId, refunds[1].refundId);
  await assert.rejects(
    service.compensate("test-admin", order.id, {
      ...compensation,
      amountCents: 500,
    }),
    /请求编号/,
  );
  await assert.rejects(
    service.compensate("test-admin", order.id, {
      ...compensation,
      requestKey: key(),
      amountCents: 3000,
    }),
    /不足/,
  );
  await service.processRefund(
    await prisma.purchaseRefund.findUnique({
      where: { id: refunds[0].refundId },
    }),
  );
  assert.equal(providerRefunds, 2);
  assert.equal(
    Number(
      (await prisma.wallet.findUnique({ where: { userId: "test-rider" } }))
        .balance,
    ),
    15,
  );
  assert.equal(
    (await service.detail(order.id, "test-buyer")).order.status,
    "completed",
  );
  console.log(
    "PASS platform compensation acknowledgement, concurrency, amount ceiling and rider principal isolation",
  );

  async function fresh() {
    const quote = await service.quote("test-buyer", base);
    return service.create("test-buyer", {
      ...base,
      quoteHash: quote.quoteHash,
      requestKey: key(),
    });
  }
  const one = await fresh(),
    two = await fresh();
  await pay(one);
  await pay(two);
  const accepted = await Promise.allSettled([accept(one.id), accept(two.id)]);
  assert.equal(
    accepted.filter((r) => r.status === "fulfilled").length,
    1,
    "Concurrent accepts cannot exceed aggregate advance cap",
  );
  console.log(
    "PASS database assignment mutex protects advance limit across different orders",
  );

  const overview = await service.adminData("test-admin", "test-school", {
    pageSize: 1,
    page: 2,
  });
  assert.equal(overview.total, 3);
  assert.equal(overview.orders.length, 1);
  assert.equal(overview.overview.active, 2);
  assert.equal(
    (
      await service.adminData("test-admin", "test-school", {
        keyword: order.order.orderNo,
      })
    ).total,
    1,
  );
  assert.equal(
    (await service.adminData("test-admin", "test-school", { filter: "audit" }))
      .total,
    0,
  );
  console.log(
    "PASS optimistic configuration editing and region-wide paginated order search",
  );

  const late = await fresh();
  await service.cancel(late.id, "test-buyer", "测试取消");
  await pay(late);
  const lateDetail = await service.detail(late.id, "test-buyer");
  assert.equal(lateDetail.order.status, "cancelled");
  assert.equal(lateDetail.refunds[0].amountCents, 2900);
  console.log(
    "PASS late payment after cancellation is refunded without reopening order",
  );

  const quote = await service.quote("test-buyer", base);
  await prisma.purchaseSku.update({
    where: { id: items[0].skuId },
    data: { priceCents: { increment: 1 }, version: { increment: 1 } },
  });
  await assert.rejects(
    service.create("test-buyer", {
      ...base,
      quoteHash: quote.quoteHash,
      requestKey: key(),
    }),
    /重新确认报价/,
  );
  assert.equal(
    (await service.detail(order.id, "test-buyer")).stops.find(
      (s) => s.shopId === shopA.id,
    ).items[0].approvedUnitCents,
    1500,
  );
  console.log(
    "PASS stale quote rejected, purchased item snapshots remain unchanged",
  );
  await service.tick();
  assert.equal(
    (await service.detail(late.id, "test-buyer")).refunds[0].status,
    "success",
  );
  assert.equal(providerRefunds, 3);
  console.log(
    "PASS scheduled refund worker processes pending outbox without HTTP follow-up",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
