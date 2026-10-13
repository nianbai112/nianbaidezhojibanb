import { BadRequestException, NotFoundException } from "@nestjs/common";
import { lockErrandAssignee } from "../errand/errand-transaction-guards";
import { restoreErrandOrderCoupon } from "../errand/errand-coupon-restoration";
import {
  effectiveStudentIdentity,
  identityInclude,
} from "../student-identity/student-identity.policy";
import {
  CHANGE_BIZ,
  PURCHASE_BIZ,
  PURCHASE_RIDER_TIER_LABELS,
  PURCHASE_TYPE,
  PurchaseRiderTier,
  cents,
  money,
  policy,
  purchaseConfigKey,
} from "./purchase.policy";

export const purchaseInclude = {
  order: true,
  stops: { orderBy: { sortOrder: "asc" }, include: { items: true } },
  changes: { orderBy: { createdAt: "desc" } },
  refunds: { orderBy: { createdAt: "desc" } },
};
export const unresolvedChanges = ["pending", "awaiting_payment"];
// Prisma's MySQL upsert may read before waiting for the assignee mutex.
// Purchase callers must see committed orders after that wait to enforce caps.
export const PURCHASE_TRANSACTION_OPTIONS = { isolationLevel: "ReadCommitted" as const };

// All purchase mutations take locks in the same order: assignee, order, purchase.
// The assignee row also serializes aggregate advance checks across different orders.
export async function lockPurchase(tx: any, id: string) {
  const order = await tx.errandOrder.findUnique({ where: { id } });
  if (!order || order.type !== PURCHASE_TYPE)
    throw new NotFoundException("代买订单不存在");
  if (order.riderId) await lockErrandAssignee(tx, order.riderId);
  await tx.errandOrder.update({
    where: { id },
    data: { updatedAt: new Date() },
  });
  await tx.errandPurchase.update({
    where: { id },
    data: { version: { increment: 1 } },
  });
  return tx.errandPurchase.findUnique({
    where: { id },
    include: purchaseInclude,
  });
}

export async function purchaseEvent(
  tx: any,
  id: string,
  actorId: string,
  kind: string,
  data: any = {},
) {
  await tx.purchaseEvent.create({
    data: { purchaseId: id, actorId, kind, data },
  });
}

const OFFICIAL_RIDER_TYPES = ["official", "platform", "full_time", "官方"];

// Official riders are 专职; everyone else is 兼职, or 学生 with a current school identity here.
// Tier switches and limits are read from the live region settings, so they apply immediately.
export async function purchaseRiderAccess(db: any, regionId: string, rider: any) {
  const official = OFFICIAL_RIDER_TYPES.includes(
    String(rider?.riderType || "").trim().toLowerCase(),
  );
  const verification = official
    ? null
    : await db.studentVerify.findUnique({
        where: { userId: rider.userId },
        include: identityInclude,
      });
  const tier: PurchaseRiderTier = official
    ? "official"
    : effectiveStudentIdentity(verification, rider.userId, regionId)
      ? "student"
      : "part_time";
  const config = await db.config.findUnique({
    where: { key: purchaseConfigKey(regionId) },
  });
  const rule = policy(config?.value).riderTiers[tier];
  const label = PURCHASE_RIDER_TIER_LABELS[tier];
  return {
    tier,
    label,
    rule,
    blockedReason: rule.enabled ? "" : `本区域暂未向${label}开放代买服务`,
  };
}

export async function assertPurchaseAdvance(
  db: any,
  order: any,
  riderId: string,
  nextGoodsCents?: number,
) {
  if (order?.type !== PURCHASE_TYPE) return;
  const rider = await db.regionRider.findUnique({ where: { userId: riderId } });
  if (
    !rider ||
    rider.verifyStatus !== "approved" ||
    rider.regionId !== order.regionId
  ) {
    throw new BadRequestException("代买服务仅限本区域已认证骑手接单");
  }
  const access = await purchaseRiderAccess(db, order.regionId, rider);
  // Without nextGoodsCents this is an assignment. A closed tier blocks new orders only,
  // so a rider who already accepted can still record changes and finish the order.
  if (nextGoodsCents === undefined && !access.rule.enabled)
    throw new BadRequestException(access.blockedReason);
  const purchase = await db.errandPurchase.findUnique({
    where: { id: order.id },
    include: { changes: true },
  });
  if (!purchase) throw new BadRequestException("代买商品资料缺失");
  const p = policy(purchase.policySnapshot);
  const goods =
    nextGoodsCents ??
    purchase.approvedGoodsCents +
      purchase.changes
        .filter((c: any) => unresolvedChanges.includes(c.status))
        .reduce((n: number, c: any) => n + Math.max(0, c.deltaCents), 0);
  const cap = Math.min(
    p.maxGoodsCents,
    Number(purchase.feeSnapshot?.maxGoodsCents ?? p.maxGoodsCents),
    access.rule.maxGoodsCents ?? Infinity,
  );
  if (goods > cap)
    throw new BadRequestException(
      access.rule.maxGoodsCents !== null && goods > access.rule.maxGoodsCents
        ? `本单货款超过${access.label}单笔垫付限额 ¥${money(access.rule.maxGoodsCents)}`
        : "本单货款超过骑手单笔垫付限额",
    );
  const outstanding = await db.errandPurchase.findMany({
    where: {
      id: { not: order.id },
      reimbursementStatus: { not: "paid" },
      order: {
        riderId,
        status: {
          notIn: ["pending_pay", "pending_accept", "cancelled", "refunded"],
        },
      },
    },
    include: { changes: true },
  });
  const total = outstanding.reduce(
    (n: number, row: any) =>
      n +
      row.approvedGoodsCents +
      row.changes
        .filter((c: any) => unresolvedChanges.includes(c.status))
        .reduce((s: number, c: any) => s + Math.max(0, c.deltaCents), 0),
    goods,
  );
  const aggregateCap = Math.min(
    p.maxOutstandingCents,
    access.rule.maxOutstandingCents ?? Infinity,
    ...outstanding.map(
      (row: any) => policy(row.policySnapshot).maxOutstandingCents,
    ),
  );
  if (total > aggregateCap)
    throw new BadRequestException(
      `骑手累计未返还垫付款已达上限（${access.label} ¥${money(aggregateCap)}），请先完成订单并等待凭证审核`,
    );
}

export async function assertPurchaseReadyForDelivery(db: any, order: any) {
  if (order?.type !== PURCHASE_TYPE) return;
  const purchase = await db.errandPurchase.findUnique({
    where: { id: order.id },
    include: purchaseInclude,
  });
  if (
    !purchase ||
    purchase.stops.some(
      (s: any) => !["purchased", "empty"].includes(s.status),
    ) ||
    purchase.changes.some((c: any) => unresolvedChanges.includes(c.status))
  ) {
    throw new BadRequestException(
      "请先处理全部商品变更并上传各店购买凭证，再开始配送",
    );
  }
  if (!purchase.stops.some((s: any) => s.actualCents > 0))
    throw new BadRequestException("全部商品缺货，请取消代买订单");
}

export async function assertPurchaseUnpurchased(db: any, order: any) {
  if (order?.type !== PURCHASE_TYPE) return;
  const purchase = await db.errandPurchase.findUnique({
    where: { id: order.id },
    include: purchaseInclude,
  });
  if (
    purchase?.stops.some((s: any) => s.status === "purchased") ||
    purchase?.changes.some((c: any) => unresolvedChanges.includes(c.status))
  ) {
    throw new BadRequestException(
      "已购买商品或存在待处理变更的代买订单不能转派，请联系后台处理",
    );
  }
}

export async function queuePurchaseRefund(
  tx: any,
  purchase: any,
  amountCents: number,
  key: string,
  kind: string,
  reason: string,
  onlyPaymentId?: string,
) {
  if (amountCents <= 0) return;
  const requestKey = `${purchase.id}:${key}`;
  const existing = await tx.purchaseRefund.findUnique({
    where: { requestKey },
  });
  if (existing) {
    if (existing.amountCents !== amountCents || existing.kind !== kind)
      throw new BadRequestException("退款请求编号已使用，请刷新后重试");
    return existing;
  }
  const changes = await tx.purchaseChange.findMany({
    where: { purchaseId: purchase.id },
    select: { id: true },
  });
  const payments = await tx.paymentOrder.findMany({
    where: {
      ...(onlyPaymentId
        ? { id: onlyPaymentId }
        : {
            OR: [
              { bizType: PURCHASE_BIZ, bizId: purchase.id },
              {
                bizType: CHANGE_BIZ,
                bizId: { in: changes.map((c: any) => c.id) },
              },
            ],
          }),
      status: { in: ["paid", "refunding", "refunded"] },
    },
    orderBy: { createdAt: "asc" },
  });
  const reservations = await tx.purchaseRefund.findMany({
    where: { purchaseId: purchase.id },
  });
  const allocations: any[] = [];
  let remaining = amountCents;
  for (const payment of payments) {
    const allocated = reservations
      .flatMap((r: any) => r.allocations || [])
      .filter((a: any) => a.paymentId === payment.id)
      .reduce((n: number, a: any) => n + a.amountCents, 0);
    // All purchase refunds go through this outbox; direct generic refunds are blocked.
    const available = Math.max(0, cents(payment.amount) - allocated);
    const amount = Math.min(remaining, available);
    if (amount)
      allocations.push({
        paymentId: payment.id,
        bizType: payment.bizType,
        bizId: payment.bizId,
        amountCents: amount,
      });
    remaining -= amount;
  }
  if (remaining)
    throw new BadRequestException("可退货款不足，请等待付款结果同步");
  return tx.purchaseRefund.create({
    data: {
      purchaseId: purchase.id,
      requestKey,
      amountCents,
      kind,
      reason,
      allocations,
    },
  });
}

export async function applyPurchaseChange(tx: any, purchase: any, change: any) {
  const updated = await tx.purchaseItem.updateMany({
    where: { id: change.itemId, version: change.itemVersion },
    data: {
      quantity: change.quantity,
      approvedUnitCents: change.unitCents,
      skuId: change.skuId,
      snapshot: change.snapshot,
      version: { increment: 1 },
    },
  });
  if (updated.count !== 1)
    throw new BadRequestException("商品已变化，请刷新后重新确认");
  await tx.errandPurchase.update({
    where: { id: purchase.id },
    data: { approvedGoodsCents: { increment: change.deltaCents } },
  });
  await tx.purchaseChange.update({
    where: { id: change.id },
    data: { status: "applied", resolvedAt: new Date() },
  });
  if (change.deltaCents < 0)
    await queuePurchaseRefund(
      tx,
      purchase,
      -change.deltaCents,
      `change:${change.id}`,
      "difference",
      change.reason,
    );
  await purchaseEvent(tx, purchase.id, purchase.userId, "change_applied", {
    changeId: change.id,
    deltaCents: change.deltaCents,
  });
}

// Runs inside the payment callback transaction, including duplicate/late callback handling.
export async function applyPurchasePayment(tx: any, payment: any) {
  const change =
    payment.bizType === CHANGE_BIZ
      ? await tx.purchaseChange.findUnique({ where: { id: payment.bizId } })
      : null;
  const id = change?.purchaseId || payment.bizId;
  const purchase = await lockPurchase(tx, id);
  let valid = purchase.userId === payment.userId;
  if (payment.bizType === PURCHASE_BIZ) {
    valid =
      valid &&
      purchase.order.status === "pending_pay" &&
      Date.now() - purchase.createdAt.getTime() < 15 * 60000 &&
      cents(payment.amount) ===
        purchase.initialGoodsCents +
          purchase.serviceCents -
          cents(purchase.order.couponDiscount);
    if (valid) {
      await tx.errandOrder.update({
        where: { id },
        data: {
          status: "pending_accept",
          payChannel: "wx_pay",
          payTime: new Date(),
        },
      });
      await purchaseEvent(tx, id, purchase.userId, "prepaid", {
        amountCents: cents(payment.amount),
      });
      return {};
    }
    if (purchase.order.status === "pending_pay") {
      await tx.errandOrder.update({
        where: { id },
        data: {
          status: "cancelled",
          cancelTime: new Date(),
          cancelReason: "付款超时",
        },
      });
      await restoreErrandOrderCoupon(tx, purchase.order);
    }
  } else {
    const current = purchase.changes.find((c: any) => c.id === change?.id);
    const item = purchase.stops
      .flatMap((s: any) => s.items)
      .find((i: any) => i.id === current?.itemId);
    valid =
      valid &&
      current?.status === "awaiting_payment" &&
      current.expiresAt > new Date() &&
      purchase.order.status === "accepted" &&
      item?.version === current.itemVersion &&
      cents(payment.amount) === current.deltaCents;
    if (valid) {
      await applyPurchaseChange(tx, purchase, current);
      return { skipPostPayNotify: true };
    }
    if (current && unresolvedChanges.includes(current.status))
      await tx.purchaseChange.update({
        where: { id: current.id },
        data: { status: "expired", resolvedAt: new Date() },
      });
  }
  await queuePurchaseRefund(
    tx,
    purchase,
    cents(payment.amount),
    `late:${payment.id}`,
    "late_payment",
    "订单或变更已失效，原路退回付款",
    payment.id,
  );
  return { skipPostPayNotify: true };
}
