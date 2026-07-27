export type ErrandEtaEstimate = {
  now: Date;
  earliestAt: Date;
  latestAt: Date;
  totalMinutes: number;
  latestBuffer: number;
  notice: string;
};

export type ErrandDispatchAssessment = {
  canAccept: boolean;
  score: number;
  riskLevel: 'safe' | 'warning' | 'blocked';
  tagText: string;
  reasonText: string;
  capacityUnits: number;
  riderUsedUnits: number;
  activeOrdersCount: number;
  sameArea: boolean;
  deadlineRisk: boolean;
  estimatedLatestAt: Date;
  estimatedLatestText: string;
  errandRisk?: any;
};

const SERVICE_BASE_MINUTES: Record<string, number> = {
  express_pickup: 30,
  express_send: 38,
  food_delivery: 29,
  custom_task: 45,
};

const MAX_RIDER_CAPACITY_UNITS = 8;
const ACTIVE_ORDER_CAPACITY_UNITS = 2;
const AREA_KEYWORDS = ['东区', '西区', '南区', '北区', '中区', '快递站', '食堂', '宿舍', '教学楼'];

const pad = (value: number) => String(value).padStart(2, '0');

export const toDate = (value?: any) => {
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value === 'string' && value.trim()) return new Date(value.trim().replace(/-/g, '/'));
  if (typeof value === 'number') return new Date(value);
  return new Date();
};

export const addMinutes = (date: any, minutes: number) => new Date(toDate(date).getTime() + minutes * 60 * 1000);

const isSameLocalDay = (left: any, right: any) => {
  const a = toDate(left);
  const b = toDate(right);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
};

const dayDiff = (from: any, to: any) => {
  const a = toDate(from);
  const b = toDate(to);
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((end - start) / 86400000);
};

export const formatClock = (date: any) => {
  const value = toDate(date);
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
};

export const toBackendDateTime = (date: any) => {
  const value = toDate(date);
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:00`;
};

export const roundUpToInterval = (date: any, intervalMinutes = 15) => {
  const value = toDate(date);
  const intervalMs = Math.max(1, Number(intervalMinutes) || 15) * 60 * 1000;
  return new Date(Math.ceil(value.getTime() / intervalMs) * intervalMs);
};

const createNotice = (params: { activeRiderCount: number; sameArea: boolean; taskCount: number }) => {
  if (Number(params.activeRiderCount) <= 0) return '当前骑手较少，预计送达时间可能延长';
  if (!params.sameArea) return '取送区域不一致，已增加路程缓冲';
  if (params.taskCount >= 4) return '任务较多，已增加取件处理时间';
  return '';
};

export const estimateErrandDelivery = (params: any = {}): ErrandEtaEstimate => {
  const now = toDate(params.now);
  const serviceType = params.serviceType || params.service_type || 'express_pickup';
  const taskCount = Math.max(1, Number(params.taskCount || params.task_count || 1));
  const sameArea = params.sameArea !== false && params.same_area !== false;
  const activeRiderCount = Number(params.activeRiderCount ?? params.active_rider_count ?? 1);
  const currentRiderLoad = Math.max(0, Number(params.currentRiderLoad ?? params.current_rider_load ?? 0));
  const base = Number(SERVICE_BASE_MINUTES[serviceType] || SERVICE_BASE_MINUTES.custom_task);
  const acceptMinutes = activeRiderCount <= 0 ? 18 : activeRiderCount === 1 ? 8 : 5;
  const firstTaskMinutes = serviceType === 'food_delivery' ? 2 : serviceType === 'custom_task' ? 8 : 3;
  const extraTaskMinutes = Math.max(0, taskCount - 1) * (serviceType === 'food_delivery' ? 8 : 10);
  const areaPenalty = sameArea ? 0 : 14;
  const riderLoadPenalty = currentRiderLoad * 6;
  const totalMinutes = base + acceptMinutes + firstTaskMinutes + extraTaskMinutes + areaPenalty + riderLoadPenalty;
  const latestBuffer = 10 + Math.max(0, taskCount - 1) * 3 + (sameArea ? 0 : 5) + (activeRiderCount <= 0 ? 5 : 0);
  const earliestAt = addMinutes(now, totalMinutes);
  const latestAt = addMinutes(earliestAt, latestBuffer);
  return {
    now,
    earliestAt,
    latestAt,
    totalMinutes,
    latestBuffer,
    notice: createNotice({ activeRiderCount, sameArea, taskCount }),
  };
};

export const formatReservationLabel = (now: any, date: any) => {
  const diff = dayDiff(now, date);
  const clock = formatClock(date);
  if (diff === 0) return `今天 ${clock}`;
  if (diff === 1) return `明天 ${clock}`;
  if (diff === 2) return `后天 ${clock}`;
  const value = toDate(date);
  return `${value.getMonth() + 1}月${value.getDate()}日 ${clock}`;
};

export const formatEtaRange = (estimate: ErrandEtaEstimate) => {
  if (isSameLocalDay(estimate.earliestAt, estimate.latestAt)) {
    return `${formatClock(estimate.earliestAt)}-${formatClock(estimate.latestAt)}`;
  }
  return `${formatReservationLabel(estimate.now, estimate.earliestAt)}-${formatReservationLabel(estimate.now, estimate.latestAt)}`;
};

export const createErrandReservationOptions = (estimate: ErrandEtaEstimate, options: any = {}) => {
  const intervalMinutes = Number(options.intervalMinutes || options.interval_minutes || 15);
  const count = Number(options.count || 24);
  const start = roundUpToInterval(estimate.earliestAt, intervalMinutes);
  return Array.from({ length: count }).map((_, index) => {
    const date = addMinutes(start, index * intervalMinutes);
    return {
      label: formatReservationLabel(estimate.now || start, date),
      value: toBackendDateTime(date),
    };
  });
};

export const normalizeArea = (value = '') => {
  const text = String(value || '');
  if (!text) return '';
  const found = AREA_KEYWORDS.find((area) => text.includes(area));
  return found || text.slice(0, 4);
};

export const getTaskList = (order: any = {}) => {
  const list = order.details || order.tasks || order.errand_tasks || [];
  return Array.isArray(list) ? list : [];
};

export const getTaskSizeUnits = (task: any = {}) => {
  const text = `${task.item_size_name || ''}${task.size_name || ''}${task.description || ''}${task.itemDescription || ''}`;
  if (/超大|大型|大件|重|桶|箱/.test(text)) return 3;
  if (/中件|中型/.test(text)) return 2;
  if (task.task_type === 'custom_task' || task.taskType === 'custom_task') return 2;
  return 1;
};

export const calculateCapacityUnits = (order: any = {}) => {
  const tasks = getTaskList(order);
  if (!tasks.length) return 1;
  return tasks.reduce((total, task) => total + getTaskSizeUnits(task), 0);
};

export const collectAreas = (order: any = {}) => {
  const areas: string[] = [];
  const push = (value: any) => {
    const area = normalizeArea(value);
    if (area) areas.push(area);
  };
  getTaskList(order).forEach((task: any) => {
    push(task.pickup_area || task.pickup_point_area || task.pickup_point_name || task.pickup_address || task.location_name);
  });
  push(order.delivery_area || order.delivery_address || order.address || order.recipient_address || order.deliverAddress);
  return areas;
};

export const isSameArea = (order: any = {}) => {
  const areas = collectAreas(order);
  if (areas.length <= 1) return true;
  return new Set(areas).size <= 1;
};

const getRiderActiveOrdersCount = (rider: any = {}) => {
  return Math.max(0, Number(
    rider.active_orders_count ??
    rider.activeOrdersCount ??
    rider.current_orders_count ??
    rider.currentOrdersCount ??
    0,
  ));
};

const getDeadline = (order: any = {}) => {
  const value = order.delivery_time || order.estimated_delivery_time || order.expected_delivery_time || order.appointment_time || order.deliverTime;
  return value ? toDate(value) : null;
};

const createReasonText = (reasons: string[]) => {
  if (!reasons.length) return '路线顺路，预计可按时送达';
  return reasons.join('，');
};

const shouldAssessOrder = (order: any = {}) => {
  const status = order.status || order.raw_status || '';
  return (order.type === 'errand' || order.order_type === 'errand') && ['pending', 'pending_accept', 'confirmed', 'paid'].includes(status);
};

export const assessErrandDispatch = ({ order = {}, rider = {}, now = new Date() }: any = {}): ErrandDispatchAssessment => {
  const taskCount = Math.max(1, getTaskList(order).length || Number(order.task_count || 1));
  const capacityUnits = calculateCapacityUnits(order);
  const activeOrdersCount = getRiderActiveOrdersCount(rider);
  const riderUsedUnits = activeOrdersCount * ACTIVE_ORDER_CAPACITY_UNITS;
  const sameArea = isSameArea(order);
  const estimate = estimateErrandDelivery({
    now,
    serviceType: order.service_type || order.serviceType || 'express_pickup',
    taskCount,
    sameArea,
    activeRiderCount: 1,
    currentRiderLoad: activeOrdersCount,
  });
  const deadline = getDeadline(order);
  const deadlineRisk = deadline ? estimate.latestAt.getTime() > deadline.getTime() : false;
  const reasons: string[] = [];
  if (riderUsedUnits + capacityUnits > MAX_RIDER_CAPACITY_UNITS) reasons.push('任务容量已满');
  if (!sameArea) reasons.push('取送跨区');
  if (deadlineRisk) reasons.push('预计可能超时');
  const canAccept = !reasons.includes('任务容量已满') && !deadlineRisk;
  const score = Math.max(
    0,
    100 -
    capacityUnits * 4 -
    activeOrdersCount * 10 -
    (sameArea ? 0 : 18) -
    (deadlineRisk ? 35 : 0),
  );
  const riskLevel = canAccept ? reasons.length ? 'warning' : 'safe' : 'blocked';
  const baseAssessment: ErrandDispatchAssessment = {
    canAccept,
    score,
    riskLevel,
    tagText: canAccept ? riskLevel === 'safe' ? '推荐接' : '谨慎接' : '不建议接',
    reasonText: createReasonText(reasons),
    capacityUnits,
    riderUsedUnits,
    activeOrdersCount,
    sameArea,
    deadlineRisk,
    estimatedLatestAt: estimate.latestAt,
    estimatedLatestText: toBackendDateTime(estimate.latestAt),
  };
  return applyErrandRiskToDispatchAssessment(baseAssessment, { order, rider });
};

export const getErrandRiskFromOrder = (order: any = {}) => {
  const risk = order.risk_assessment || order.riskAssessment || order.errand_risk || order.errandRisk || order.risk;
  if (risk && typeof risk === 'object') return risk;
  const remark = order.remark || order.order_remark;
  if (typeof remark === 'string' && remark.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(remark);
      return parsed.risk_assessment || parsed.errand_risk || parsed.risk || null;
    } catch {
      return null;
    }
  }
  return null;
};

export const applyErrandRiskToDispatchAssessment = (assessment: ErrandDispatchAssessment, context: any = {}): ErrandDispatchAssessment => {
  const order = context.order || {};
  const rider = context.rider || {};
  const risk = context.risk || getErrandRiskFromOrder(order);
  if (!risk || typeof risk !== 'object') return assessment;

  const constraints = risk.dispatch_constraints || {};
  const riskTags = Array.isArray(risk.risk_tags) ? risk.risk_tags : [];
  const activeOrdersCount = getRiderActiveOrdersCount(rider);
  const blockedByRisk = risk.risk_level === 'blocked' || constraints.can_dispatch === false;
  const stackingBlocked = constraints.allow_stacking === false && activeOrdersCount > 0;
  const maxActiveOrders = Number(constraints.max_active_orders ?? constraints.maxActiveOrders);
  const overRiskLoad = Number.isFinite(maxActiveOrders) && activeOrdersCount > maxActiveOrders;
  const riskPenalty = risk.risk_level === 'restricted'
    ? 35
    : risk.risk_level === 'high'
      ? 22
      : risk.risk_level === 'medium'
        ? 8
        : 0;
  const reasons = [assessment.reasonText === '路线顺路，预计可按时送达' ? '' : assessment.reasonText];
  if (blockedByRisk) reasons.push('任务风险超出普通跑腿范围');
  if (stackingBlocked) reasons.push('高风险任务禁止叠单');
  if (overRiskLoad) reasons.push('骑手当前任务量不符合风险规则');
  const canAccept = assessment.canAccept && !blockedByRisk && !stackingBlocked && !overRiskLoad;
  const score = Math.max(0, assessment.score - riskPenalty - (stackingBlocked ? 30 : 0) - (overRiskLoad ? 25 : 0));
  const riskLevel = canAccept ? score >= 75 && !riskPenalty ? assessment.riskLevel : 'warning' : 'blocked';
  const tagText = canAccept
    ? risk.risk_level === 'high' || risk.risk_level === 'restricted'
      ? '高风险'
      : assessment.tagText
    : '不建议接';

  return {
    ...assessment,
    canAccept,
    score,
    riskLevel,
    tagText,
    reasonText: createReasonText(reasons.filter(Boolean)),
    errandRisk: {
      risk_level: risk.risk_level,
      risk_score: risk.risk_score,
      risk_tags: riskTags,
      dispatch_constraints: constraints,
    },
  };
};

export const attachAssessment = (order: any, assessment: ErrandDispatchAssessment) => ({
  ...order,
  dispatch_source: 'backend',
  dispatch_can_accept: assessment.canAccept,
  dispatch_score: assessment.score,
  dispatch_risk_level: assessment.riskLevel,
  dispatchTagText: assessment.tagText,
  dispatchReasonText: assessment.reasonText,
  dispatch_capacity_units: assessment.capacityUnits,
  dispatch_estimated_latest_time: assessment.estimatedLatestText,
  dispatch_constraints: assessment.errandRisk?.dispatch_constraints || order.dispatch_constraints,
  errand_risk: assessment.errandRisk || order.errand_risk || order.risk_assessment,
});

export const enrichErrandOrdersForDispatch = (orders: any[] = [], context: any = {}) => {
  const rider = context.rider || {};
  const now = context.now || new Date();
  return [...orders].map((order, index) => {
    if (!shouldAssessOrder(order)) return { ...order, dispatch_original_index: index };
    const assessment = assessErrandDispatch({ order, rider, now });
    return attachAssessment({ ...order, dispatch_original_index: index }, assessment);
  }).sort((left, right) => {
    if (!shouldAssessOrder(left) || !shouldAssessOrder(right)) {
      return left.dispatch_original_index - right.dispatch_original_index;
    }
    if (left.dispatch_can_accept !== right.dispatch_can_accept) {
      return left.dispatch_can_accept ? -1 : 1;
    }
    if (left.dispatch_score !== right.dispatch_score) {
      return right.dispatch_score - left.dispatch_score;
    }
    return left.dispatch_original_index - right.dispatch_original_index;
  }).map(({ dispatch_original_index, ...order }) => order);
};
