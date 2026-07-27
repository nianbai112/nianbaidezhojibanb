export type ErrandRiskLevel = 'low' | 'medium' | 'high' | 'restricted' | 'blocked';

export type ErrandRiskAssessment = {
  risk_level: ErrandRiskLevel;
  risk_score: number;
  risk_tags: string[];
  required_confirmations: string[];
  required_evidence: string[];
  dispatch_constraints: {
    can_dispatch: boolean;
    allow_stacking: boolean;
    max_active_orders: number;
    push_scope: 'same_building' | 'same_area' | 'nearby_area' | 'whole_region' | 'manual_review';
    preferred_rider_tags: string[];
    blocked_rider_conditions: string[];
  };
  extra_eta_minutes: number;
  user_notice: string;
  rider_notice: string;
  learning_snapshot: Record<string, any>;
};

const VALUE_CAP_YUAN = 5000;
const HIGH_VALUE_YUAN = 1000;
const LONG_DISTANCE_METERS = 1200;

const uniq = (list: string[]) => Array.from(new Set(list.filter(Boolean)));

const textOf = (value: any) => String(value || '').trim();

const hasText = (source: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(source));

const numberValue = (value: any, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampNumber = (value: any, min = 0, max = 45) => Math.max(min, Math.min(max, numberValue(value, min)));

const isOneOfServiceTypes = (serviceType: string, types: string[]) => types.includes(serviceType);

export const normalizeRiskTasks = (input: any = {}) => {
  const list = input.tasks || input.details || input.errand_tasks || [];
  return Array.isArray(list) ? list : [];
};

export const inferErrandRiskAttributes = (input: any = {}) => {
  const tasks = normalizeRiskTasks(input);
  const serviceType = textOf(input.service_type || input.serviceType || input.type || 'custom_task');
  const isFoodLikeTask = isOneOfServiceTypes(serviceType, ['food_delivery', 'meal', 'custom_task', 'universal']);
  const canInferFoodRiskFromText = isFoodLikeTask;
  const canInferSendRiskFromText = isOneOfServiceTypes(serviceType, ['express_send', 'deliver', 'custom_task', 'universal']);
  const declaredValue = Math.max(
    numberValue(input.declared_value_yuan ?? input.declaredValueYuan ?? input.value_amount ?? input.valueAmount, 0),
    ...tasks.map((task: any) => numberValue(task.declared_value_yuan ?? task.declaredValueYuan ?? task.value_amount ?? task.valueAmount, 0)),
  );
  const joined = [
    serviceType,
    input.description,
    input.item_name,
    input.item_category,
    input.item_size_name,
    input.delivery_address,
    input.pickup_address,
    ...tasks.flatMap((task: any) => [
      task.task_type,
      task.item_name,
      task.itemName,
      task.item_category,
      task.itemCategory,
      task.item_size_name,
      task.size_name,
      task.description,
      task.item_description,
      task.pickup_point_name,
      task.pickup_address,
      task.recipient_address,
    ]),
  ].map(textOf).join(' ');

  const explicitCake = input.cake === true || tasks.some((task: any) => task.cake === true || task.need_keep_flat === true);
  const cake = canInferFoodRiskFromText && (explicitCake || hasText(joined, [/蛋糕/, /甜品/]));
  const fragile = input.fragile === true || tasks.some((task: any) => task.fragile === true) || hasText(joined, [/易碎/, /玻璃/, /陶瓷/]) || (canInferFoodRiskFromText && hasText(joined, [/蛋糕/]));
  const liquid = input.liquid === true || tasks.some((task: any) => task.liquid === true) || (canInferFoodRiskFromText || canInferSendRiskFromText ? hasText(joined, [/汤/, /奶茶/, /饮料/, /咖啡/, /热饮/, /液体/]) : false);
  const hot = input.hot === true || tasks.some((task: any) => task.hot === true) || (canInferFoodRiskFromText ? hasText(joined, [/热食/, /热饮/, /热餐/]) : false);
  const cold = input.cold === true || tasks.some((task: any) => task.cold === true) || (canInferFoodRiskFromText ? hasText(joined, [/冷藏/, /冰淇淋/, /生鲜/, /冷饮/]) : false);
  const large = input.large === true || tasks.some((task: any) => task.large === true) || hasText(joined, [/超大/, /大型/, /大件/, /箱/]);
  const heavy = input.heavy === true || tasks.some((task: any) => task.heavy === true) || hasText(joined, [/重物/, /很重/, /桶装/, /搬/]);
  const valuable = input.valuable === true || tasks.some((task: any) => task.valuable === true) || declaredValue >= HIGH_VALUE_YUAN || hasText(joined, [/贵重/, /手机/, /电脑/, /相机/, /平板/]);
  const prohibited = input.prohibited === true || hasText(joined, [/现金/, /危险品/, /违禁/, /烟花/, /刀具/, /代考/, /违法/]);

  return {
    serviceType,
    taskCount: Math.max(1, numberValue(input.task_count ?? input.taskCount, tasks.length || 1)),
    declaredValue,
    distanceMeters: numberValue(input.delivery_distance_meters ?? input.distance_meters ?? input.distance, 0),
    fragile,
    cake,
    liquid,
    hot,
    cold,
    large,
    heavy,
    valuable,
    prohibited,
  };
};

export const assessErrandRisk = (input: any = {}): ErrandRiskAssessment => {
  const attrs = inferErrandRiskAttributes(input);
  const tags: string[] = [];
  const confirmations: string[] = [];
  const evidence: string[] = [];
  const preferredRiderTags: string[] = [];
  const blockedRiderConditions: string[] = [];
  let score = 10;
  let extraEta = 0;
  let allowStacking = true;
  let maxActiveOrders = 3;
  let pushScope: ErrandRiskAssessment['dispatch_constraints']['push_scope'] = 'whole_region';
  let canDispatch = true;

  const add = (condition: boolean, tag: string, points: number) => {
    if (!condition) return;
    tags.push(tag);
    score += points;
  };

  add(attrs.serviceType === 'express_pickup' || attrs.serviceType === 'pickup', 'express_pickup_code', 4);
  add(attrs.serviceType === 'express_send' || attrs.serviceType === 'deliver', 'express_send', 8);
  add(attrs.serviceType === 'food_delivery' || attrs.serviceType === 'meal', 'food_pickup', 6);
  add(attrs.serviceType === 'custom_task' || attrs.serviceType === 'universal', 'custom_task', 10);
  add(attrs.fragile, 'fragile', 18);
  add(attrs.cake, 'cake', 34);
  add(attrs.liquid, 'liquid', 18);
  add(attrs.hot, 'hot', 8);
  add(attrs.cold, 'cold', 10);
  add(attrs.large, 'large', 18);
  add(attrs.heavy, 'heavy', 20);
  add(attrs.valuable, 'valuable', 26);
  add(attrs.distanceMeters >= LONG_DISTANCE_METERS, 'long_distance', 12);

  if (attrs.prohibited) {
    tags.push('prohibited_item');
    score += 100;
    canDispatch = false;
  }
  if (attrs.declaredValue > VALUE_CAP_YUAN) {
    tags.push('value_cap_exceeded');
    score += 100;
    canDispatch = false;
  }
  if (attrs.taskCount >= 4) {
    tags.push('many_tasks');
    score += 10;
  }

  if (attrs.cake) {
    allowStacking = false;
    maxActiveOrders = 0;
    pushScope = attrs.distanceMeters >= LONG_DISTANCE_METERS ? 'same_area' : 'nearby_area';
    extraEta += 8;
    confirmations.push('cake_flat_delivery_risk');
    evidence.push('pickup_photo', 'delivery_photo');
    preferredRiderTags.push('careful_delivery');
    blockedRiderConditions.push('active_orders_present');
  }

  if (attrs.liquid) {
    maxActiveOrders = Math.min(maxActiveOrders, 1);
    pushScope = pushScope === 'whole_region' ? 'nearby_area' : pushScope;
    extraEta += 5;
    confirmations.push('liquid_spill_risk');
    evidence.push('pickup_photo');
  }

  if (attrs.fragile || attrs.valuable || attrs.large || attrs.heavy) {
    pushScope = pushScope === 'whole_region' ? 'same_area' : pushScope;
    maxActiveOrders = Math.min(maxActiveOrders, attrs.valuable ? 1 : 2);
    extraEta += attrs.large || attrs.heavy ? 6 : 4;
    evidence.push('pickup_photo', 'delivery_photo');
    confirmations.push(attrs.valuable ? 'valuable_item_risk' : 'fragile_or_large_item_risk');
    if (attrs.large || attrs.heavy) preferredRiderTags.push('large_item_capable');
  }

  if (!canDispatch) {
    pushScope = 'manual_review';
    allowStacking = false;
    maxActiveOrders = 0;
    evidence.push('manual_review_record');
    confirmations.push('unsupported_task_notice');
  }

  const level: ErrandRiskLevel = !canDispatch
    ? 'blocked'
    : score >= 85
      ? 'restricted'
      : score >= 55
        ? 'high'
        : score >= 28
          ? 'medium'
          : 'low';

  if (level === 'restricted') {
    maxActiveOrders = Math.min(maxActiveOrders, 1);
    pushScope = pushScope === 'whole_region' ? 'same_area' : pushScope;
    preferredRiderTags.push('experienced_rider');
  }

  const configuredExtraEta = clampNumber(input.configured_extra_eta_minutes ?? input.risk_extra_eta_minutes ?? input.riskExtraEtaMinutes, 0, 60);
  extraEta = Math.max(extraEta, configuredExtraEta);

  const riskTags = uniq(tags);
  const evidenceList = uniq(evidence);
  const confirmationList = uniq(confirmations);
  const userNotice = createUserNotice(level, riskTags, canDispatch);
  const riderNotice = createRiderNotice(level, riskTags, allowStacking);

  return {
    risk_level: level,
    risk_score: Math.min(100, Math.round(score)),
    risk_tags: riskTags,
    required_confirmations: confirmationList,
    required_evidence: evidenceList,
    dispatch_constraints: {
      can_dispatch: canDispatch,
      allow_stacking: allowStacking,
      max_active_orders: maxActiveOrders,
      push_scope: pushScope,
      preferred_rider_tags: uniq(preferredRiderTags),
      blocked_rider_conditions: uniq(blockedRiderConditions),
    },
    extra_eta_minutes: extraEta,
    user_notice: userNotice,
    rider_notice: riderNotice,
    learning_snapshot: sanitizeErrandRiskLearningSnapshot(input, attrs, riskTags, level),
  };
};

const createUserNotice = (level: ErrandRiskLevel, tags: string[], canDispatch: boolean) => {
  if (!canDispatch) return '该任务超出平台普通跑腿支持范围，建议选择专业服务或联系平台处理';
  if (tags.includes('cake')) return '蛋糕属于高风险物品，需平放配送，平台会限制叠单并要求取送照片';
  if (tags.includes('valuable')) return '贵重物品需谨慎配送，请确认物品价值和交接证据';
  if (tags.includes('liquid')) return '液体或汤水易洒，预计时间和配送要求已增加保护';
  if (level === 'high' || level === 'restricted') return '该任务风险较高，系统将限制骑手和配送方式';
  if (level === 'medium') return '该任务需要骑手谨慎处理，预计时间可能略有增加';
  return '任务风险正常';
};

const createRiderNotice = (level: ErrandRiskLevel, tags: string[], allowStacking: boolean) => {
  const parts: string[] = [];
  if (tags.includes('cake')) parts.push('蛋糕', '需平放');
  if (tags.includes('liquid')) parts.push('易洒');
  if (tags.includes('valuable')) parts.push('贵重物');
  if (tags.includes('large') || tags.includes('heavy')) parts.push('大件/重物');
  if (!allowStacking) parts.push('禁止叠单');
  if (!parts.length) return level === 'low' ? '普通任务' : '谨慎处理';
  return parts.join(' | ');
};

export const sanitizeErrandRiskLearningSnapshot = (input: any, attrs: any, tags: string[], level: ErrandRiskLevel) => ({
  service_type: attrs.serviceType,
  task_count: attrs.taskCount,
  risk_level: level,
  risk_tags: tags,
  declared_value_band: attrs.declaredValue > VALUE_CAP_YUAN ? 'over_cap' : attrs.declaredValue >= HIGH_VALUE_YUAN ? 'high' : attrs.declaredValue > 0 ? 'declared' : 'none',
  distance_band: attrs.distanceMeters >= LONG_DISTANCE_METERS ? 'long' : attrs.distanceMeters > 0 ? 'normal' : 'unknown',
  has_fragile: attrs.fragile,
  has_cake: attrs.cake,
  has_liquid: attrs.liquid,
  has_large: attrs.large,
  has_heavy: attrs.heavy,
  has_valuable: attrs.valuable,
  pickup_area_text: textOf(input.pickup_area || input.pickup_address || '').slice(0, 16),
  delivery_area_text: textOf(input.delivery_area || input.delivery_address || input.address || '').slice(0, 16),
});
