/* Dedicated disposable PostgreSQL only. WeChat transport and notifications are stubbed. */
const assert = require("node:assert/strict");
const url = process.env.PURCHASE_TEST_DATABASE_URL || "";
if (!/^postgresql:\/\/[^@]+@127\.0\.0\.1:55439\/purchase_review(?:\?|$)/.test(url))
  throw new Error("Use the disposable purchase_review database on 127.0.0.1:55439");
require("ts-node").register({ transpileOnly: true });
const { PrismaClient } = require("@prisma/client");
const { PurchaseService } = require("../src/modules/errand-purchase/purchase.service");
const { PaymentService } = require("../src/modules/payment/payment.service");
const {
  assertPurchaseAdvance,
  PURCHASE_TRANSACTION_OPTIONS,
} = require("../src/modules/errand-purchase/purchase.transactions");
const { lockErrandAssignee } = require("../src/modules/errand/errand-transaction-guards");

const prisma = new PrismaClient({ datasources: { db: { url } } });
const noOp = async () => {};
const redis = { getLock: async () => true, releaseLock: noOp, withLock: async (_key, _seconds, run) => run() };
const payment = new PaymentService({}, prisma, redis, {}, {});
payment.notifyAvailableErrandRiders = noOp;
payment.notifyShopRefundSuccess = noOp;
payment.getWxPayConfig = async () => ({});
payment.wxPayRequest = async () => ({ status: "SUCCESS", refund_id: `fake-${Date.now()}` });

// Unique ids let this run beside the other purchase database tests.
const run = `mod${Date.now().toString(36)}`;
const regionId = `${run}-school`,
  admin = `${run}-admin`,
  buyer = `${run}-buyer`,
  rider = `${run}-rider`,
  addressId = `${run}-address`;
const service = new PurchaseService(
  prisma,
  { assertStudentProtectedAction: noOp },
  { assertRegionAccess: async (a, r) => { assert.equal(a, admin); assert.equal(r, regionId); } },
  payment,
  redis,
  { createAndDispatch: noOp },
);
const proof = "https://example.invalid/modifier-proof.jpg";
let counter = 0;
const key = () => `${run}-${++counter}`;

async function pay(order) {
  const row = await prisma.paymentOrder.create({
    data: {
      paymentNo: key(),
      bizType: "errand_purchase",
      bizId: order.id,
      orderNo: order.order.orderNo,
      userId: buyer,
      amount: (order.initialGoodsCents + order.serviceCents) / 100,
    },
  });
  await payment.handlePaymentSuccess(row.paymentNo, "fake-wx-id");
}
async function accept(id) {
  await prisma.$transaction(async (tx) => {
    await lockErrandAssignee(tx, rider);
    const order = await tx.errandOrder.findUnique({ where: { id } });
    await assertPurchaseAdvance(tx, order, rider);
    const claimed = await tx.errandOrder.updateMany({
      where: { id, status: "pending_accept", riderId: null },
      data: { riderId: rider, status: "accepted", receiptCode: "654321" },
    });
    assert.equal(claimed.count, 1);
  }, PURCHASE_TRANSACTION_OPTIONS);
}
const group = (shopId, body) => service.saveModifierGroup(admin, regionId, { shopId, enabled: true, ...body });
const opt = (name, priceCents = 0, extra = {}) => ({ name, priceCents, isDefault: false, soldOut: false, enabled: true, ...extra });

async function main() {
  await prisma.region.create({ data: { id: regionId, name: "规格测试校区", code: key() } });
  await prisma.user.createMany({ data: [buyer, rider].map((id) => ({ id, openid: key() })) });
  await prisma.regionRider.create({
    data: { userId: rider, regionId, realName: "规格骑手", idCard: "test", phone: "13800000002", verifyStatus: "approved", status: "online" },
  });
  await prisma.address.create({
    data: { id: addressId, userId: buyer, regionId, name: "规格用户", phone: "13800000003", detail: "二号宿舍 202", latitude: 30, longitude: 120 },
  });
  await service.savePolicy(admin, regionId, { enabled: true });
  const shop = await service.saveShop(admin, regionId, {
    name: "规格茶饮", address: "规格路1号", latitude: 30.001, longitude: 120, opensAt: "00:00", closesAt: "00:00", enabled: true,
  });

  await group(shop.id, { name: "温度", type: "attribute", required: true, maxSelect: 1,
    options: [opt("标准冰", 0, { isDefault: true }), opt("少冰"), opt("热")] });
  await group(shop.id, { name: "糖度", type: "attribute", required: true, maxSelect: 1,
    options: [opt("七分糖", 0, { isDefault: true }), opt("三分糖")] });
  await group(shop.id, { name: "加料", type: "extra", required: false, maxTotalQuantity: 3,
    options: [opt("珍珠", 100, { maxQuantity: 2 }), opt("芝士奶盖", 300)] });
  await assert.rejects(group(shop.id, { name: "温度", type: "attribute", required: false, options: [opt("冰")] }), /不能重复/);
  const library = async () => (await service.adminData(admin, regionId)).shops.find((s) => s.id === shop.id).modifierGroups;
  const groups = await library();
  const byName = (name) => groups.find((g) => g.name === name);
  const option = (groupName, name) => byName(groupName).options.find((o) => o.name === name).id;
  const [ice, less, hot, s7, s3, pearl, cheese] = [
    option("温度", "标准冰"), option("温度", "少冰"), option("温度", "热"),
    option("糖度", "七分糖"), option("糖度", "三分糖"),
    option("加料", "珍珠"), option("加料", "芝士奶盖"),
  ];
  console.log("PASS shop library groups, options and duplicate-name guard");

  const productBody = {
    shopId: shop.id, name: "茉莉奶绿", enabled: true,
    skus: [
      { name: "中杯", priceCents: 1200, weightGrams: 500, enabled: true },
      { name: "大杯", priceCents: 1500, weightGrams: 650, enabled: true },
    ],
    modifierBindings: [
      { groupId: byName("温度").id, hiddenOptionIds: [hot] },
      { groupId: byName("糖度").id },
      { groupId: byName("加料").id },
    ],
  };
  await service.saveProduct(admin, regionId, productBody);
  await assert.rejects(
    service.saveProduct(admin, regionId, { ...productBody, name: "串店商品", modifierBindings: [{ groupId: "missing" }] }),
    /不属于当前店铺/,
  );
  const listed = (await service.products({ regionId, shopId: shop.id })).items.find((p) => p.name === "茉莉奶绿");
  assert.equal(listed.modifierBindings, undefined);
  assert.deepEqual(listed.modifierGroups.map((g) => g.name), ["温度", "糖度", "加料"]);
  assert.deepEqual(listed.modifierGroups[0].options.map((o) => o.name), ["标准冰", "少冰"]);
  assert.equal(listed.modifierGroups[0].options.find((o) => o.isDefault).name, "标准冰");
  const mid = listed.skus.find((s) => s.name === "中杯"), big = listed.skus.find((s) => s.name === "大杯");
  console.log("PASS product bindings validated; buyers see mounted groups without hidden options");

  const cart = await service.cartItems({ regionId, lines: [
    { skuId: big.id, modifiers: [{ optionId: less }, { optionId: s3 }, { optionId: pearl, quantity: 2 }] },
    { skuId: big.id, modifiers: [{ optionId: ice }] },
  ] });
  assert.equal(cart.items[0].unitCents, 1700);
  assert.equal(cart.items[0].spec, "大杯 / 少冰 / 三分糖 / 加珍珠×2");
  assert.equal(cart.items[0].invalidReason, "");
  assert.match(cart.items[1].invalidReason, /请选择糖度/);
  const legacyCart = await service.cartItems({ regionId, skuIds: [mid.id] });
  assert.equal(legacyCart.items[0].spec, "中杯 / 标准冰 / 七分糖");
  console.log("PASS cart refresh prices each flavour line and flags incomplete choices");

  const base = { regionId, addressId, shortagePolicy: "refund_missing" };
  const lineA = { skuId: big.id, quantity: 2, modifiers: [{ optionId: less }, { optionId: s3 }, { optionId: pearl, quantity: 2 }] };
  const lineB = { skuId: big.id, quantity: 1, modifiers: [{ optionId: ice }, { optionId: s7 }, { optionId: cheese }] };
  const quote = await service.quote(buyer, { ...base, items: [lineA, lineB] });
  assert.equal(quote.goodsCents, 1700 * 2 + 1800);
  assert.equal(quote.items.length, 2);
  const reordered = await service.quote(buyer, { ...base, items: [lineB, { ...lineA, modifiers: [...lineA.modifiers].reverse() }] });
  assert.equal(reordered.quoteHash, quote.quoteHash);
  await assert.rejects(service.quote(buyer, { ...base, items: [lineA, { ...lineA, quantity: 1 }] }), /合并数量/);
  await assert.rejects(service.quote(buyer, { ...base, items: [{ skuId: big.id, quantity: 1, modifiers: [{ optionId: ice }] }] }), /请选择糖度/);
  await assert.rejects(service.quote(buyer, { ...base, items: [{ skuId: big.id, quantity: 1, modifiers: [{ optionId: hot }, { optionId: s7 }] }] }), /已下架/);
  await assert.rejects(service.quote(buyer, { ...base, items: [{ ...lineA, modifiers: [{ optionId: less }, { optionId: s3 }, { optionId: pearl, quantity: 3 }] }] }), /最多加2份/);
  const legacyQuote = await service.quote(buyer, { ...base, items: [{ skuId: mid.id, quantity: 1 }] });
  assert.equal(legacyQuote.items[0].snapshot.specText, "中杯 / 标准冰 / 七分糖");
  console.log("PASS same cup with different flavours quotes as separate lines; limits and legacy defaults hold");

  const order = await service.create(buyer, { ...base, items: [lineA, lineB], quoteHash: quote.quoteHash, requestKey: key() });
  const stored = order.stops[0].items.find((i) => i.quantity === 2);
  assert.equal(stored.approvedUnitCents, 1700);
  assert.deepEqual(stored.snapshot.modifiers.map((m) => m.optionName), ["少冰", "三分糖", "珍珠"]);
  assert.equal(stored.snapshot.specText, "大杯 / 少冰 / 三分糖 / 加珍珠×2");
  console.log("PASS order snapshot keeps every flavour choice and its price");

  const extraGroup = (await library()).find((g) => g.name === "加料");
  await service.setModifierSoldOut(admin, regionId, cheese, true);
  await assert.rejects(service.quote(buyer, { ...base, items: [lineB] }), /芝士奶盖已售罄/);
  await assert.rejects(
    service.saveModifierGroup(admin, regionId, { ...extraGroup, shopId: shop.id }),
    /已被修改/,
  );
  await service.setModifierSoldOut(admin, regionId, cheese, false);
  const beforePrice = await service.quote(buyer, { ...base, items: [lineA] });
  const fresh = (await library()).find((g) => g.name === "加料");
  await service.saveModifierGroup(admin, regionId, {
    ...fresh, shopId: shop.id,
    options: fresh.options.map((o) => ({ ...o, priceCents: o.name === "珍珠" ? 150 : o.priceCents })),
  });
  await assert.rejects(
    service.create(buyer, { ...base, items: [lineA], quoteHash: beforePrice.quoteHash, requestKey: key() }),
    /重新确认报价/,
  );
  assert.equal((await service.quote(buyer, { ...base, items: [lineA] })).goodsCents, (1500 + 300) * 2);
  assert.equal((await service.detail(order.id, buyer)).stops[0].items.find((i) => i.quantity === 2).approvedUnitCents, 1700);
  console.log("PASS sold-out toggle blocks new quotes, stale forms conflict, price edits invalidate old quotes only");

  await pay(order);
  await accept(order.id);
  const riderView = await service.detail(order.id, rider);
  const item = riderView.stops[0].items.find((i) => i.quantity === 2);
  const flavourChange = {
    requestKey: key(), itemId: item.id, quantity: 2, unitCents: 1500, skuId: item.skuId,
    modifiers: [{ optionId: less }, { optionId: s3 }], reason: "珍珠卖完了，去掉珍珠", evidenceUrls: [proof],
  };
  const change = await service.propose(order.id, rider, flavourChange);
  assert.equal(change.deltaCents, -400);
  assert.equal(change.snapshot.specText, "大杯 / 少冰 / 三分糖");
  await assert.rejects(
    service.propose(order.id, rider, { ...flavourChange, modifiers: [{ optionId: less }, { optionId: s7 }] }),
    /请求编号已使用/,
  );
  await service.respond(order.id, buyer, change.id, true);
  const afterChange = await service.detail(order.id, buyer);
  const updated = afterChange.stops[0].items.find((i) => i.id === item.id);
  assert.equal(updated.snapshot.specText, "大杯 / 少冰 / 三分糖");
  assert.equal(updated.approvedUnitCents, 1500);
  assert.equal(afterChange.approvedGoodsCents, 1700 * 2 + 1800 - 400);
  assert.ok(afterChange.refunds.some((r) => r.amountCents === 400 && r.kind === "difference"));
  await assert.rejects(
    service.propose(order.id, rider, { ...flavourChange, requestKey: key(), reason: "没有变化" }),
    /没有变化/,
  );
  console.log("PASS rider flavour change updates the item snapshot and refunds the difference");

  // Deleting an option removes it from the library and from product bindings.
  const product = (await service.adminData(admin, regionId)).shops.find((s) => s.id === shop.id).products.find((p) => p.name === "茉莉奶绿");
  const tempGroup = (await library()).find((g) => g.name === "温度");
  await service.saveModifierGroup(admin, regionId, { ...tempGroup, shopId: shop.id, options: tempGroup.options.filter((o) => o.name !== "热") });
  assert.equal(await prisma.purchaseModifierOption.count({ where: { id: hot } }), 0);
  const afterOption = await prisma.purchaseProduct.findUnique({ where: { id: product.id } });
  assert.deepEqual(afterOption.modifierBindings.find((b) => b.groupId === tempGroup.id).hiddenOptionIds, []);
  assert.equal(afterOption.version, product.version + 1);
  // A form opened before the delete still saves; the stale option id is dropped.
  await service.saveProduct(admin, regionId, { ...productBody, id: product.id, version: afterOption.version,
    skus: product.skus.map(({ id, name, priceCents, weightGrams, enabled }) => ({ id, name, priceCents, weightGrams, enabled })),
    modifierBindings: [{ groupId: tempGroup.id, hiddenOptionIds: [hot] }, ...productBody.modifierBindings.slice(1)] });
  assert.deepEqual((await prisma.purchaseProduct.findUnique({ where: { id: product.id } })).modifierBindings[0].hiddenOptionIds, []);
  console.log("PASS deleting an option cleans product bindings; stale forms still save");

  // Deleting a group removes its options and unmounts it everywhere.
  const addons = (await library()).find((g) => g.name === "加料");
  await assert.rejects(service.deleteModifierGroup(admin, regionId, addons.id, addons.version - 1), /已被修改/);
  const removedGroup = await service.deleteModifierGroup(admin, regionId, addons.id, addons.version);
  assert.equal(removedGroup.products, 1);
  assert.equal(await prisma.purchaseModifierGroup.count({ where: { id: addons.id } }), 0);
  assert.equal(await prisma.purchaseModifierOption.count({ where: { groupId: addons.id } }), 0);
  const listedAfter = (await service.products({ regionId, shopId: shop.id })).items.find((p) => p.id === product.id);
  assert.deepEqual(listedAfter.modifierGroups.map((g) => g.name), ["温度", "糖度"]);
  await assert.rejects(service.quote(buyer, { ...base, items: [lineB] }), /已下架/);
  await assert.rejects(service.deleteModifierGroup(admin, regionId, addons.id, addons.version), /不存在/);
  console.log("PASS deleting a group removes its options and unmounts it from products");

  // Deleting a size keeps the other sizes and every placed order's snapshot.
  const current = await prisma.purchaseProduct.findUnique({ where: { id: product.id }, include: { skus: true } });
  const keep = current.skus.find((s) => s.name === "大杯");
  await service.saveProduct(admin, regionId, { ...productBody, id: product.id, version: current.version,
    skus: [{ id: keep.id, name: keep.name, priceCents: keep.priceCents, weightGrams: keep.weightGrams, enabled: true }],
    modifierBindings: current.modifierBindings });
  assert.deepEqual((await prisma.purchaseSku.findMany({ where: { productId: product.id } })).map((s) => s.name), ["大杯"]);
  assert.equal((await service.cartItems({ regionId, lines: [{ skuId: mid.id, modifiers: [] }] })).items.length, 0);
  const history = await service.detail(order.id, buyer);
  assert.equal(history.stops[0].items.find((i) => i.quantity === 1).snapshot.specText, "大杯 / 标准冰 / 七分糖 / 加芝士奶盖");
  console.log("PASS deleting a size leaves other sizes and placed orders untouched");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
