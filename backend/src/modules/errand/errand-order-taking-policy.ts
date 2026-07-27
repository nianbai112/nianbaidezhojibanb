export type ErrandReceiverType = 'approved_rider' | 'ordinary_user' | 'auto'

export type ErrandOrderTakingPolicy = {
  ordinaryUserEnabled: boolean
  ordinaryUserTaskTypes: string[]
  ordinaryUserRequirePhone: boolean
  ordinaryUserRequireStudentVerify: boolean
  ordinaryUserMaxActiveOrders: number
  ordinaryUserDailyLimit: number
  riderPriorityMinutes: number
  receiverChoiceEnabled: boolean
  ordinaryUserFallbackEnabled: boolean
  ordinaryUserFallbackMinutes: number
  approvedRiderSurchargeAmount: number
  highRiskRequiresApprovedRider: boolean
}

export type ErrandOrderTakingEligibility = {
  allowed: boolean
  receiverType: ErrandReceiverType
  reason: string
  reasonCode: string
}

export const DEFAULT_ERRAND_ORDER_TAKING_POLICY: ErrandOrderTakingPolicy = {
  ordinaryUserEnabled: false,
  ordinaryUserTaskTypes: ['express_pickup'],
  ordinaryUserRequirePhone: false,
  ordinaryUserRequireStudentVerify: false,
  ordinaryUserMaxActiveOrders: 1,
  ordinaryUserDailyLimit: 3,
  riderPriorityMinutes: 0,
  receiverChoiceEnabled: false,
  ordinaryUserFallbackEnabled: false,
  ordinaryUserFallbackMinutes: 10,
  approvedRiderSurchargeAmount: 0,
  highRiskRequiresApprovedRider: true,
}

const RECEIVER_TYPES = new Set(['approved_rider', 'ordinary_user', 'auto'])
const RISKY_TAGS = new Set([
  'cake',
  'fragile',
  'valuable',
  'large',
  'heavy',
  'prohibited_item',
  'value_cap_exceeded',
])

function toBoolean(value: any, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  return ['1', 'true', 'yes', 'open', 'enabled', 'on'].includes(String(value).toLowerCase())
}

function toNumber(value: any, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toArray(value: any, fallback: string[]) {
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean)
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(/[,，]/).map(item => item.trim()).filter(Boolean)
  }
  return fallback.slice()
}

export function normalizeErrandOrderTakingPolicy(value: any = {}): ErrandOrderTakingPolicy {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const defaults = DEFAULT_ERRAND_ORDER_TAKING_POLICY
  return {
    ordinaryUserEnabled: toBoolean(
      source.ordinaryUserEnabled ?? source.ordinary_user_enabled,
      defaults.ordinaryUserEnabled,
    ),
    ordinaryUserTaskTypes: toArray(
      source.ordinaryUserTaskTypes ?? source.ordinary_user_task_types,
      defaults.ordinaryUserTaskTypes,
    ),
    ordinaryUserRequirePhone: toBoolean(
      source.ordinaryUserRequirePhone ?? source.ordinary_user_require_phone,
      defaults.ordinaryUserRequirePhone,
    ),
    ordinaryUserRequireStudentVerify: toBoolean(
      source.ordinaryUserRequireStudentVerify ?? source.ordinary_user_require_student_verify,
      defaults.ordinaryUserRequireStudentVerify,
    ),
    ordinaryUserMaxActiveOrders: Math.max(0, Math.floor(toNumber(
      source.ordinaryUserMaxActiveOrders ?? source.ordinary_user_max_active_orders,
      defaults.ordinaryUserMaxActiveOrders,
    ))),
    ordinaryUserDailyLimit: Math.max(0, Math.floor(toNumber(
      source.ordinaryUserDailyLimit ?? source.ordinary_user_daily_limit,
      defaults.ordinaryUserDailyLimit,
    ))),
    riderPriorityMinutes: Math.max(0, Math.floor(toNumber(
      source.riderPriorityMinutes ?? source.rider_priority_minutes,
      defaults.riderPriorityMinutes,
    ))),
    receiverChoiceEnabled: toBoolean(
      source.receiverChoiceEnabled ?? source.receiver_choice_enabled,
      defaults.receiverChoiceEnabled,
    ),
    ordinaryUserFallbackEnabled: toBoolean(
      source.ordinaryUserFallbackEnabled ?? source.ordinary_user_fallback_enabled,
      defaults.ordinaryUserFallbackEnabled,
    ),
    ordinaryUserFallbackMinutes: Math.max(1, Math.floor(toNumber(
      source.ordinaryUserFallbackMinutes ?? source.ordinary_user_fallback_minutes,
      defaults.ordinaryUserFallbackMinutes,
    ))),
    approvedRiderSurchargeAmount: Math.max(0, toNumber(
      source.approvedRiderSurchargeAmount ?? source.approved_rider_surcharge_amount,
      defaults.approvedRiderSurchargeAmount,
    )),
    highRiskRequiresApprovedRider: toBoolean(
      source.highRiskRequiresApprovedRider ?? source.high_risk_requires_approved_rider,
      defaults.highRiskRequiresApprovedRider,
    ),
  }
}

export function policyToSnakeCase(policy: any = {}) {
  const normalized = normalizeErrandOrderTakingPolicy(policy)
  return {
    ordinary_user_enabled: normalized.ordinaryUserEnabled,
    ordinary_user_task_types: normalized.ordinaryUserTaskTypes,
    ordinary_user_require_phone: normalized.ordinaryUserRequirePhone,
    ordinary_user_require_student_verify: normalized.ordinaryUserRequireStudentVerify,
    ordinary_user_max_active_orders: normalized.ordinaryUserMaxActiveOrders,
    ordinary_user_daily_limit: normalized.ordinaryUserDailyLimit,
    rider_priority_minutes: normalized.riderPriorityMinutes,
    receiver_choice_enabled: normalized.receiverChoiceEnabled,
    ordinary_user_fallback_enabled: normalized.ordinaryUserFallbackEnabled,
    ordinary_user_fallback_minutes: normalized.ordinaryUserFallbackMinutes,
    approved_rider_surcharge_amount: normalized.approvedRiderSurchargeAmount,
    high_risk_requires_approved_rider: normalized.highRiskRequiresApprovedRider,
  }
}

export function normalizeErrandReceiverType(value: any, policy: any = {}): ErrandReceiverType {
  const normalizedPolicy = normalizeErrandOrderTakingPolicy(policy)
  const raw = String(value || '').trim()
  const receiverType = RECEIVER_TYPES.has(raw) ? raw as ErrandReceiverType : 'approved_rider'
  if (!normalizedPolicy.ordinaryUserEnabled && receiverType !== 'approved_rider') return 'approved_rider'
  if (!normalizedPolicy.receiverChoiceEnabled && receiverType === 'ordinary_user') return 'approved_rider'
  return receiverType
}

export function resolveErrandReceiverType(source: any = {}, policy: any = {}): ErrandReceiverType {
  const raw = source?.receiver_type ?? source?.receiverType ?? source?.order_receiver_type ?? source?.orderReceiverType
  return normalizeErrandReceiverType(raw, policy)
}

export function normalizeErrandTaskType(value: any) {
  const raw = String(value || '').trim()
  const map: Record<string, string> = {
    pickup: 'express_pickup',
    deliver: 'express_send',
    meal: 'food_delivery',
    universal: 'custom_task',
  }
  return map[raw] || raw || 'custom_task'
}

function dateValue(value: any) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const text = typeof value === 'string' ? value.trim() : value
  const date = new Date(typeof text === 'string' && !text.includes('T') ? text.replace(/-/g, '/') : text)
  return Number.isNaN(date.getTime()) ? null : date
}

function userHasPhone(user: any = {}) {
  return !!String(user?.phone || user?.phone_number || user?.mobile || '').trim()
}

function userHasStudentVerify(user: any = {}) {
  const verify = user?.studentVerify || user?.student_verify || user?.student_verification || {}
  const status = String(
    verify?.status ??
    user?.student_verify_status ??
    user?.studentVerifyStatus ??
    '',
  ).trim().toLowerCase()
  return ['approved', 'verified', 'pass', 'passed', 'success'].includes(status)
}

function riskTags(risk: any = {}) {
  const tags = risk?.risk_tags || risk?.riskTags || []
  return Array.isArray(tags) ? tags.map(tag => String(tag || '').trim()).filter(Boolean) : []
}

function isRiskTooHighForOrdinaryUser(risk: any = {}) {
  const level = String(risk?.risk_level || risk?.riskLevel || '').trim().toLowerCase()
  if (['blocked', 'restricted', 'high'].includes(level)) return true
  if (risk?.dispatch_constraints?.can_dispatch === false || risk?.dispatchConstraints?.canDispatch === false) return true
  return riskTags(risk).some(tag => RISKY_TAGS.has(tag))
}

function priorityWindowSatisfied(order: any = {}, policy: ErrandOrderTakingPolicy, now: Date) {
  if (policy.riderPriorityMinutes <= 0) return true
  const baseTime = dateValue(order?.payTime ?? order?.pay_time ?? order?.paid_at ?? order?.createdAt ?? order?.created_at)
  if (!baseTime) return true
  return now.getTime() - baseTime.getTime() >= policy.riderPriorityMinutes * 60 * 1000
}

function parseRemark(order: any = {}) {
  const remark = order?.remark ?? order?.remarks ?? order?.extra ?? {}
  if (!remark) return {}
  if (typeof remark === 'object') return remark
  if (typeof remark !== 'string') return {}
  try {
    const parsed = JSON.parse(remark)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function getOrderRequestedReceiverType(order: any = {}, policy: any = {}) {
  const remark = parseRemark(order)
  return normalizeErrandReceiverType(
    order?.requested_receiver_type ??
      order?.requestedReceiverType ??
      order?.receiver_type ??
      order?.receiverType ??
      remark.requested_receiver_type ??
      remark.requestedReceiverType ??
      remark.receiver_type ??
      remark.receiverType,
    policy,
  )
}

function fallbackReleaseDate(order: any = {}, policy: ErrandOrderTakingPolicy) {
  const remark = parseRemark(order)
  const explicit = dateValue(
    order?.fallback_release_at ??
      order?.fallbackReleaseAt ??
      remark.fallback_release_at ??
      remark.fallbackReleaseAt,
  )
  if (explicit) return explicit
  const baseTime = dateValue(order?.payTime ?? order?.pay_time ?? order?.paid_at ?? order?.createdAt ?? order?.created_at)
  if (!baseTime) return null
  return new Date(baseTime.getTime() + policy.ordinaryUserFallbackMinutes * 60 * 1000)
}

export function getErrandFallbackReleaseAt(order: any = {}, policy: any = {}) {
  const normalizedPolicy = normalizeErrandOrderTakingPolicy(policy)
  const releaseAt = fallbackReleaseDate(order, normalizedPolicy)
  return releaseAt ? releaseAt.toISOString() : ''
}

export function assessApprovedRiderFallbackEligibility(params: any = {}) {
  const policy = normalizeErrandOrderTakingPolicy(params.policy)
  const order = params.order || {}
  const requestedReceiverType = getOrderRequestedReceiverType(order, { ...policy, receiverChoiceEnabled: true })
  const now = dateValue(params.now) || new Date()

  const allow = (reason: string, reasonCode: string) => ({
    allowed: true,
    receiverType: 'approved_rider' as ErrandReceiverType,
    reason,
    reasonCode,
  })
  const deny = (reason: string, reasonCode: string) => ({
    allowed: false,
    receiverType: 'approved_rider' as ErrandReceiverType,
    reason,
    reasonCode,
  })

  if (requestedReceiverType === 'approved_rider') {
    return allow('该订单指定认证骑手接单', 'approved_rider_requested')
  }
  if (!policy.ordinaryUserFallbackEnabled) {
    return deny('该普通用户订单未开启认证骑手兜底', 'fallback_disabled')
  }
  const releaseAt = fallbackReleaseDate(order, policy)
  if (!releaseAt) return deny('该普通用户订单暂未到认证骑手兜底时间', 'fallback_waiting')
  if (now.getTime() < releaseAt.getTime()) {
    return deny('普通用户接单等待中，暂未进入认证骑手兜底池', 'fallback_waiting')
  }
  return allow('兜底单，按原价结算', 'fallback_released')
}

export function assessErrandOrderTakingEligibility(params: any = {}): ErrandOrderTakingEligibility {
  const policy = normalizeErrandOrderTakingPolicy(params.policy)
  const order = params.order || {}
  const receiverType = normalizeErrandReceiverType(
    params.receiverType ?? order.receiver_type ?? order.receiverType,
    policy,
  )

  const deny = (reason: string, reasonCode: string): ErrandOrderTakingEligibility => ({
    allowed: false,
    receiverType,
    reason,
    reasonCode,
  })

  if (receiverType === 'approved_rider') {
    return deny('该订单指定认证骑手接单', 'approved_rider_only')
  }
  if (!policy.ordinaryUserEnabled) {
    return deny('当前区域暂未开放普通用户接单', 'ordinary_user_disabled')
  }

  const serviceType = normalizeErrandTaskType(order.service_type ?? order.serviceType ?? order.type)
  if (policy.ordinaryUserTaskTypes.length && !policy.ordinaryUserTaskTypes.includes(serviceType)) {
    return deny('该类型任务暂不支持普通用户接单', 'task_type_not_allowed')
  }

  if (receiverType === 'auto' && !priorityWindowSatisfied(order, policy, dateValue(params.now) || new Date())) {
    return deny('认证骑手优先接单中，稍后普通用户可见', 'rider_priority_waiting')
  }

  const risk = params.risk || order.risk_assessment || order.riskAssessment || {}
  if (policy.highRiskRequiresApprovedRider && isRiskTooHighForOrdinaryUser(risk)) {
    return deny('该任务风险较高，需要认证骑手接单', 'high_risk_requires_rider')
  }
  if (risk?.dispatch_constraints?.can_dispatch === false || risk?.dispatchConstraints?.canDispatch === false) {
    return deny('该任务暂不支持接单', 'risk_blocked')
  }

  const user = params.user || {}
  if (policy.ordinaryUserRequirePhone && !userHasPhone(user)) {
    return deny('请先完成手机号验证后再接单', 'phone_required')
  }
  if (policy.ordinaryUserRequireStudentVerify && !userHasStudentVerify(user)) {
    return deny('请先完成学生认证后再接单', 'student_verify_required')
  }

  const activeOrdersCount = Math.max(0, toNumber(params.activeOrdersCount ?? params.active_orders_count, 0))
  if (policy.ordinaryUserMaxActiveOrders > 0 && activeOrdersCount >= policy.ordinaryUserMaxActiveOrders) {
    return deny('你当前进行中的接单已达上限', 'active_order_limit')
  }

  const todayOrdersCount = Math.max(0, toNumber(params.todayOrdersCount ?? params.today_orders_count, 0))
  if (policy.ordinaryUserDailyLimit > 0 && todayOrdersCount >= policy.ordinaryUserDailyLimit) {
    return deny('今日普通用户接单次数已达上限', 'daily_order_limit')
  }

  return {
    allowed: true,
    receiverType,
    reason: '可接单',
    reasonCode: 'allowed',
  }
}
