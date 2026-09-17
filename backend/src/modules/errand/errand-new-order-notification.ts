import { assessErrandDispatch } from './errand-dispatch-algorithm';
import { assessErrandRisk } from './errand-risk-engine';
import { inspectErrandAssignmentRisk } from './errand-assignment-guard';
import { errandRiderGenderMatches } from './errand-delivery-requirements';
import { assessApprovedRiderFallbackEligibility } from './errand-order-taking-policy';
import { errandExtendedConfigKey, internalErrandTypeToMini, miniErrandStatus, normalizeErrandExtendedConfig } from './errand-config.util';

export const ERRAND_NEW_ORDER_SCENE = 'new_errand_order';
export const ERRAND_NEW_ORDER_PAGE = '/pagesA/Grab/Grab?status=awaiting_delivery';

export function errandOrderRemark(order: any) {
  const value = order?.remark;
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try { return JSON.parse(value || '{}') || {}; } catch { return {}; }
}

// The same payload is used by acceptance and notification eligibility.
export function buildErrandDispatchPayload(order: any, suppliedTasks?: any[]) {
  const remark = errandOrderRemark(order);
  const tasks = suppliedTasks || (order.tasks?.length ? order.tasks.map((task: any) => ({
    task_type: task.taskType, item_size_id: task.itemSizeId || '',
    pickup_point_id: task.pickupPointId || '', express_company: task.expressCompany || '',
    platform: task.platform || '', code: task.code || '', description: task.description || '',
    item_description: task.itemDescription || '', pickup_address: task.pickupAddress || '',
    recipient_address: task.recipientAddress || '', budget_amount: Number(task.budgetAmount || 0),
    computed_fee: Number(task.computedFee || 0), image_urls: task.imageUrls || [], metadata: task.metadata || {},
  })) : Array.isArray(remark.tasks) ? remark.tasks : []);
  const payload = {
    type: 'errand', status: miniErrandStatus(order.status || 'pending_accept'), raw_status: order.status,
    service_type: internalErrandTypeToMini(order.type),
    delivery_mode: remark.delivery_mode || remark.deliveryMode || 'immediate',
    delivery_time: remark.delivery_time || order.deliverTime || order.createdAt,
    delivery_address: order.deliverAddress, address: order.deliverAddress, details: tasks, tasks,
  };
  const risk = remark.risk_assessment || assessErrandRisk(payload);
  return { ...payload, risk_assessment: risk, errand_risk: risk, dispatch_constraints: risk?.dispatch_constraints };
}

export function isAvailableErrandOrder(order: any) {
  return !!order?.regionId && !!order.payTime && order.status === 'pending_accept' && !order.riderId
    && !['refunding', 'refunded'].includes(String(order.refundStatus || 'none'));
}

// Read errors propagate: an unavailable capacity/risk query must not admit a rider.
export async function loadErrandNotificationAudience(db: any, orderId: string, userId?: string) {
  const order = await db.errandOrder.findUnique({ where: { id: orderId }, include: { tasks: true } });
  if (!isAvailableErrandOrder(order)) return { order, targets: [], reason: 'order_unavailable' };
  const config = await db.config.findUnique({ where: { key: errandExtendedConfigKey(order.regionId) } });
  const extended = normalizeErrandExtendedConfig(config?.value, 0);
  if (!assessApprovedRiderFallbackEligibility({ policy: extended.orderTakingPolicy, order }).allowed) {
    return { order, targets: [], reason: 'rider_pool_not_released' };
  }
  const riders = await db.regionRider.findMany({
    where: {
      regionId: order.regionId, verifyStatus: 'approved',
      // Duty status controls acceptance; reminders also reach riders who are offline.
      status: { in: ['online', 'busy', 'offline'] },
      notificationStatus: true,
      // Both official and part-time approved riders. Ordinary students are a different role.
      riderType: { not: 'ordinary_user' },
      userId: userId ? { equals: userId, not: order.userId } : { not: order.userId },
      User: { status: 'ACTIVE' },
    },
    select: { userId: true, riderType: true, User: { select: { profile: { select: { gender: true } } } } },
  });
  if (!riders.length) return { order, targets: [], reason: 'no_eligible_rider' };
  const ids = riders.map((rider: any) => rider.userId);
  const groups = await Promise.all([
    db.errandOrder.groupBy({ by: ['riderId'], where: { riderId: { in: ids }, status: { in: ['accepted', 'in_progress'] } }, _count: { _all: true } }),
    db.order.groupBy({ by: ['riderId'], where: { riderId: { in: ids }, status: 'SHIPPED' }, _count: { _all: true } }),
  ]);
  const counts = new Map<string, number>();
  for (const group of groups.flat()) counts.set(group.riderId, (counts.get(group.riderId) || 0) + group._count._all);
  const payload = buildErrandDispatchPayload(order);
  const targets: Array<{ userId: string; riderType: string; score: number }> = [];
  for (const rider of riders) {
    const activeCount = counts.get(rider.userId) || 0;
    if (activeCount >= 2 || !errandRiderGenderMatches(order, rider.User?.profile?.gender)) continue;
    const assessment = assessErrandDispatch({ order: payload, rider: { active_orders_count: activeCount } });
    if (!assessment.canAccept) continue;
    if ((await inspectErrandAssignmentRisk(db, order, rider.userId)).blocked) continue;
    targets.push({ userId: rider.userId, riderType: rider.riderType, score: assessment.score });
  }
  return { order, targets: targets.sort((a, b) => b.score - a.score), reason: targets.length ? '' : 'no_eligible_rider' };
}

export function errandNewOrderData(order: any, regionName: string) {
  const serviceType = internalErrandTypeToMini(order.type);
  const names: Record<string, string> = {
    express_pickup: '快递代取', express_send: '快递代寄', food_delivery: '餐食代取', custom_task: '校园跑腿',
  };
  return {
    orderId: order.id, orderNo: order.orderNo, regionId: order.regionId, serviceType,
    serviceName: names[serviceType] || '校园跑腿', amount: Number(order.payAmount || 0),
    orderAmount: `${Number(order.payAmount || 0).toFixed(2)}元`,
    // Deliberately use only the campus name, never customer phone, room or pickup code.
    serviceAddress: regionName || '所属校区', orderTime: order.createdAt || order.payTime,
  };
}
