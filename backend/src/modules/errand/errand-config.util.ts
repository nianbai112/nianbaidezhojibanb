import {
  DEFAULT_ERRAND_ORDER_TAKING_POLICY,
  normalizeErrandOrderTakingPolicy,
  policyToSnakeCase,
} from './errand-order-taking-policy'

export const ERRAND_EXTENDED_CONFIG_GROUP = 'errand'

export function errandExtendedConfigKey(regionId: string) {
  return `errand.extended_config.${regionId || 'global'}`
}

export const ERRAND_SERVICE_TITLES: Record<string, string> = {
  express_pickup: '帮我取件',
  express_send: '帮我寄件',
  food_delivery: '帮我取餐',
  custom_task: '万能任务',
}

export const DEFAULT_ERRAND_SERVICE_DESCRIPTIONS: Record<string, string> = {
  express_pickup: '快递到了不方便拿，同校同学顺路帮取',
  express_send: '寄快递不用跑驿站，填写信息后等人上门',
  food_delivery: '外卖、奶茶、校园餐，到点帮你送到手边',
  custom_task: '打印、买东西、送资料等临时任务都可以发布',
}

export const DEFAULT_ERRAND_SWITCHES = {
  express: true,
  food: true,
  custom: true,
}

export const DEFAULT_ERRAND_BANNERS = [
  {
    image_url: '/static/logo.jpg',
    link_url: '',
  },
]

export const DEFAULT_ERRAND_TIP_OPTIONS = ['不需要', '¥2', '¥5', '¥10', '其他']
export const DEFAULT_ERRAND_CUSTOM_TIP_OPTIONS = ['¥2', '¥5', '¥10', '¥15', '其他']

export const DEFAULT_ERRAND_RISK_TAG_CONFIG: Record<string, any[]> = {
  express_pickup: [
    { key: 'large', label: '包裹大件', desc: '箱子/大包裹', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 6 },
    { key: 'heavy', label: '包裹较重', desc: '桶装/重物', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 6 },
    { key: 'fragile', label: '易碎标识', desc: '玻璃/陶瓷', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 4 },
    { key: 'valuable', label: '贵重包裹', desc: '手机/电脑', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 4 },
  ],
  express_send: [
    { key: 'valuable', label: '贵重物品', desc: '手机/电脑/证件', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 4 },
    { key: 'fragile', label: '易碎物品', desc: '玻璃/陶瓷', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 4 },
    { key: 'large', label: '大件包裹', desc: '箱子/大包', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 6 },
    { key: 'heavy', label: '重物包裹', desc: '较重需搬运', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 6 },
    { key: 'liquid', label: '液体粉末', desc: '需确认可寄', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 5 },
    { key: 'prohibited', label: '疑似禁寄', desc: '需人工确认', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 0 },
  ],
  food_delivery: [
    { key: 'cake', label: '蛋糕', desc: '需平放', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 8 },
    { key: 'liquid', label: '汤水/奶茶', desc: '易洒漏', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 5 },
    { key: 'hot', label: '热餐热饮', desc: '注意保温', enabled: true, requiresApprovedRider: false, extraEtaMinutes: 2 },
    { key: 'cold', label: '冷饮冷食', desc: '注意时效', enabled: true, requiresApprovedRider: false, extraEtaMinutes: 2 },
    { key: 'large', label: '多人餐', desc: '餐品较多', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 4 },
  ],
  custom_task: [
    { key: 'valuable', label: '贵重物品', desc: '需当面交接', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 4 },
    { key: 'fragile', label: '易碎物品', desc: '需轻拿轻放', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 4 },
    { key: 'large', label: '大件任务', desc: '搬运/大包', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 6 },
    { key: 'heavy', label: '重物任务', desc: '搬运较重', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 6 },
    { key: 'liquid', label: '液体物品', desc: '易洒漏', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 5 },
    { key: 'prohibited', label: '不确定风险', desc: '需平台确认', enabled: true, requiresApprovedRider: true, extraEtaMinutes: 0 },
  ],
}

export const ERRAND_CONFIG_SCALAR_FIELDS = [
  'basePrice',
  'distancePrice',
  'weightPrice',
  'timePrice',
  'nightPrice',
  'maxDistance',
  'maxWeight',
  'isOpen',
] as const

function toNumber(value: any, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toBoolean(value: any, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  return ['1', 'true', 'yes', 'open', 'enabled'].includes(String(value).toLowerCase())
}

function normalizeBanner(item: any) {
  if (!item || typeof item !== 'object') return null
  const imageUrl = String(item.image_url || item.imageUrl || '').trim()
  if (!imageUrl) return null
  return {
    image_url: imageUrl,
    imageUrl,
    link_url: String(item.link_url || item.linkUrl || '').trim(),
    linkUrl: String(item.link_url || item.linkUrl || '').trim(),
    title: String(item.title || '').trim(),
    enabled: item.enabled === undefined ? true : toBoolean(item.enabled, true),
  }
}

function normalizeRiskTagOption(item: any) {
  if (!item || typeof item !== 'object') return null
  const key = String(item.key || item.value || '').trim()
  const label = String(item.label || item.title || '').trim()
  if (!key || !label) return null
  return {
    key,
    label,
    desc: String(item.desc || item.description || '').trim(),
    description: String(item.desc || item.description || '').trim(),
    enabled: item.enabled === undefined ? true : toBoolean(item.enabled, true),
    requiresApprovedRider: toBoolean(
      item.requiresApprovedRider ?? item.requires_approved_rider,
      key === 'hot' || key === 'cold' ? false : true,
    ),
    requires_approved_rider: toBoolean(
      item.requiresApprovedRider ?? item.requires_approved_rider,
      key === 'hot' || key === 'cold' ? false : true,
    ),
    extraEtaMinutes: toNumber(item.extraEtaMinutes ?? item.extra_eta_minutes, 0),
    extra_eta_minutes: toNumber(item.extraEtaMinutes ?? item.extra_eta_minutes, 0),
  }
}

export function normalizeErrandRiskTagConfig(value: any = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return Object.fromEntries(
    Object.keys(ERRAND_SERVICE_TITLES).map(serviceKey => {
      const raw = Array.isArray(source[serviceKey]) ? source[serviceKey] : DEFAULT_ERRAND_RISK_TAG_CONFIG[serviceKey] || []
      const normalized = raw.map(normalizeRiskTagOption).filter(Boolean)
      return [serviceKey, normalized.length ? normalized : DEFAULT_ERRAND_RISK_TAG_CONFIG[serviceKey]]
    }),
  )
}

function deepMerge<T extends Record<string, any>>(base: T, patch: any): T {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base
  const result: any = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === 'object' &&
      !Array.isArray(base[key])
    ) {
      result[key] = deepMerge(base[key], value)
    } else {
      result[key] = value
    }
  }
  return result
}

export function normalizeErrandExtendedConfig(value: any = {}, basePrice = 0) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const rawBanners = source.banners || source.bannerJson || source.banner_json || []
  const banners = (Array.isArray(rawBanners) ? rawBanners : [])
    .map(normalizeBanner)
    .filter(Boolean)

  const rawDescriptions = source.serviceDescriptions || source.service_descriptions || {}
  const rawBaseFees = source.baseFees || source.base_fees || {}
  const rawSwitches = source.serviceSwitches || source.service_switches || {}
  const rawOrderTakingPolicy = source.orderTakingPolicy || source.order_taking_policy || DEFAULT_ERRAND_ORDER_TAKING_POLICY
  const rawRiskTagConfig = source.riskTagConfig || source.risk_tag_config || DEFAULT_ERRAND_RISK_TAG_CONFIG

  const baseFees = Object.fromEntries(
    Object.keys(ERRAND_SERVICE_TITLES).map(key => [
      key,
      toNumber(rawBaseFees[key], basePrice),
    ]),
  ) as Record<string, number>

  const serviceDescriptions = {
    ...DEFAULT_ERRAND_SERVICE_DESCRIPTIONS,
    ...(rawDescriptions && typeof rawDescriptions === 'object' ? rawDescriptions : {}),
  }

  const serviceSwitches = {
    express: toBoolean(rawSwitches.express ?? source.expressServiceSwitch, DEFAULT_ERRAND_SWITCHES.express),
    food: toBoolean(rawSwitches.food ?? source.foodServiceSwitch, DEFAULT_ERRAND_SWITCHES.food),
    custom: toBoolean(rawSwitches.custom ?? source.customServiceSwitch, DEFAULT_ERRAND_SWITCHES.custom),
  }

  const tipOptions = Array.isArray(source.tipOptions) && source.tipOptions.length
    ? source.tipOptions
    : DEFAULT_ERRAND_TIP_OPTIONS
  const customTaskTipOptions = Array.isArray(source.customTaskTipOptions) && source.customTaskTipOptions.length
    ? source.customTaskTipOptions
    : DEFAULT_ERRAND_CUSTOM_TIP_OPTIONS
  const orderTakingPolicy = normalizeErrandOrderTakingPolicy(rawOrderTakingPolicy)
  const riskTagConfig = normalizeErrandRiskTagConfig(rawRiskTagConfig)
  const closureVersion = Math.max(1, Math.floor(toNumber(source.closureVersion ?? source.closure_version, 2)))
  const autoReceiptEnabled = toBoolean(source.autoReceiptEnabled ?? source.auto_receipt_enabled, true)
  const settlementV2Enabled = toBoolean(source.settlementV2Enabled ?? source.settlement_v2_enabled, true)

  return {
    banners,
    bannerJson: banners,
    banner_json: banners,
    serviceDescriptions,
    service_descriptions: serviceDescriptions,
    baseFees,
    base_fees: baseFees,
    serviceSwitches,
    tipOptions,
    customTaskTipOptions,
    orderTakingPolicy,
    order_taking_policy: policyToSnakeCase(orderTakingPolicy),
    riskTagConfig,
    risk_tag_config: riskTagConfig,
    closureVersion,
    closure_version: closureVersion,
    autoReceiptEnabled,
    auto_receipt_enabled: autoReceiptEnabled,
    settlementV2Enabled,
    settlement_v2_enabled: settlementV2Enabled,
    pageConfig: source.pageConfig || {},
  }
}

export function splitErrandConfigPayload(payload: any = {}) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
  const scalar: Record<string, any> = {}
  const extended: Record<string, any> = {}

  for (const [key, value] of Object.entries(source)) {
    if ((ERRAND_CONFIG_SCALAR_FIELDS as readonly string[]).includes(key)) {
      scalar[key] = value
    } else if (!['id', 'regionId', 'createdAt', 'updatedAt', 'miniConfig'].includes(key)) {
      extended[key] = value
    }
  }

  return { scalar, extended }
}

export function mergeErrandExtendedConfig(current: any, patch: any, basePrice = 0) {
  const base = normalizeErrandExtendedConfig(current, basePrice)
  const source = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {}
  const merged = { ...base }

  if ('banners' in source || 'bannerJson' in source || 'banner_json' in source) {
    merged.banners = source.banners || source.bannerJson || source.banner_json || []
    merged.bannerJson = merged.banners
    merged.banner_json = merged.banners
  }
  if ('serviceDescriptions' in source || 'service_descriptions' in source) {
    merged.serviceDescriptions = {
      ...base.serviceDescriptions,
      ...(source.serviceDescriptions || source.service_descriptions || {}),
    }
    merged.service_descriptions = merged.serviceDescriptions
  }
  if ('baseFees' in source || 'base_fees' in source) {
    merged.baseFees = {
      ...base.baseFees,
      ...(source.baseFees || source.base_fees || {}),
    }
    merged.base_fees = merged.baseFees
  }
  if ('serviceSwitches' in source || 'service_switches' in source) {
    merged.serviceSwitches = {
      ...base.serviceSwitches,
      ...(source.serviceSwitches || source.service_switches || {}),
    }
  }
  if ('tipOptions' in source) merged.tipOptions = source.tipOptions
  if ('customTaskTipOptions' in source) merged.customTaskTipOptions = source.customTaskTipOptions
  if ('orderTakingPolicy' in source || 'order_taking_policy' in source) {
    merged.orderTakingPolicy = normalizeErrandOrderTakingPolicy(source.orderTakingPolicy || source.order_taking_policy)
    merged.order_taking_policy = policyToSnakeCase(merged.orderTakingPolicy)
  }
  if ('riskTagConfig' in source || 'risk_tag_config' in source) {
    merged.riskTagConfig = normalizeErrandRiskTagConfig(source.riskTagConfig || source.risk_tag_config)
    merged.risk_tag_config = merged.riskTagConfig
  }
  if ('closureVersion' in source || 'closure_version' in source) {
    merged.closureVersion = source.closureVersion ?? source.closure_version
    merged.closure_version = merged.closureVersion
  }
  if ('autoReceiptEnabled' in source || 'auto_receipt_enabled' in source) {
    merged.autoReceiptEnabled = source.autoReceiptEnabled ?? source.auto_receipt_enabled
    merged.auto_receipt_enabled = merged.autoReceiptEnabled
  }
  if ('settlementV2Enabled' in source || 'settlement_v2_enabled' in source) {
    merged.settlementV2Enabled = source.settlementV2Enabled ?? source.settlement_v2_enabled
    merged.settlement_v2_enabled = merged.settlementV2Enabled
  }
  if ('pageConfig' in source) {
    merged.pageConfig = {
      ...(base.pageConfig || {}),
      ...(source.pageConfig || {}),
    }
  }

  return normalizeErrandExtendedConfig(merged, basePrice)
}

export function internalErrandTypeToMini(type?: string) {
  const map: Record<string, string> = {
    pickup: 'express_pickup',
    deliver: 'express_send',
    meal: 'food_delivery',
    universal: 'custom_task',
  }
  return map[String(type || '')] || String(type || 'custom_task')
}

export function miniErrandStatus(status?: string) {
  const map: Record<string, string> = {
    pending_pay: 'confirmed',
    pending_accept: 'confirmed',
    accepted: 'dispatched',
    in_progress: 'picked_up',
    arrived: 'delivered',
    completed: 'completed',
    cancelled: 'cancelled',
    refunding: 'cancelled',
    refunded: 'cancelled',
  }
  return map[String(status || '')] || String(status || 'confirmed')
}

export function buildMiniErrandConfig(config: any, extended: any) {
  const isOpen = config?.isOpen !== false
  const normalized = normalizeErrandExtendedConfig(extended, toNumber(config?.basePrice, 0))
  return {
    id: config?.id,
    region_id: config?.regionId,
    regionId: config?.regionId,
    is_open: isOpen ? 1 : 0,
    base_price: toNumber(config?.basePrice, 0),
    distance_price: toNumber(config?.distancePrice, 0),
    weight_price: toNumber(config?.weightPrice, 0),
    time_price: toNumber(config?.timePrice, 0),
    night_price: toNumber(config?.nightPrice, 0),
    max_distance: Number(config?.maxDistance || 10),
    max_weight: Number(config?.maxWeight || 20),
    express_service_switch: isOpen && normalized.serviceSwitches.express ? 1 : 0,
    food_service_switch: isOpen && normalized.serviceSwitches.food ? 1 : 0,
    custom_service_switch: isOpen && normalized.serviceSwitches.custom ? 1 : 0,
    banner_json: normalized.banners,
    service_descriptions: normalized.serviceDescriptions,
    base_fees: normalized.baseFees,
    tip_options: normalized.tipOptions,
    custom_task_tip_options: normalized.customTaskTipOptions,
    order_taking_policy: normalized.order_taking_policy,
    risk_tag_config: normalized.riskTagConfig,
    closure_version: normalized.closureVersion,
    auto_receipt_enabled: normalized.autoReceiptEnabled,
    settlement_v2_enabled: normalized.settlementV2Enabled,
    riskTagConfig: normalized.riskTagConfig,
    ordinary_user_enabled: normalized.orderTakingPolicy.ordinaryUserEnabled,
    ordinary_user_order_taking_enabled: normalized.orderTakingPolicy.ordinaryUserEnabled ? 1 : 0,
    receiver_choice_enabled: normalized.orderTakingPolicy.receiverChoiceEnabled,
    ordinary_user_fallback_enabled: normalized.orderTakingPolicy.ordinaryUserFallbackEnabled,
    ordinary_user_fallback_minutes: normalized.orderTakingPolicy.ordinaryUserFallbackMinutes,
    approved_rider_surcharge_amount: normalized.orderTakingPolicy.approvedRiderSurchargeAmount,
  }
}

export function defaultErrandMiniPageConfig(pageConfig: any = {}, extended: any = {}) {
  const pageNotice = pageConfig?.notice || '急事找同学帮忙，跑腿更快一步'
  const orderTips = pageConfig?.orderTips || '请填写清楚取件码、取件点和送达地址'
  const normalized = normalizeErrandExtendedConfig(extended, 0)
  const defaultConfig = {
    orderTakingPolicy: normalized.orderTakingPolicy,
    order_taking_policy: normalized.order_taking_policy,
    riskTagConfig: normalized.riskTagConfig,
    risk_tag_config: normalized.riskTagConfig,
    ordinary_user_enabled: normalized.orderTakingPolicy.ordinaryUserEnabled,
    ordinaryUserOrderTakingEnabled: normalized.orderTakingPolicy.ordinaryUserEnabled,
    receiverChoiceEnabled: normalized.orderTakingPolicy.receiverChoiceEnabled,
    receiver_choice_enabled: normalized.orderTakingPolicy.receiverChoiceEnabled,
    ordinaryUserFallbackEnabled: normalized.orderTakingPolicy.ordinaryUserFallbackEnabled,
    ordinary_user_fallback_enabled: normalized.orderTakingPolicy.ordinaryUserFallbackEnabled,
    ordinaryUserFallbackMinutes: normalized.orderTakingPolicy.ordinaryUserFallbackMinutes,
    ordinary_user_fallback_minutes: normalized.orderTakingPolicy.ordinaryUserFallbackMinutes,
    approvedRiderSurchargeAmount: normalized.orderTakingPolicy.approvedRiderSurchargeAmount,
    approved_rider_surcharge_amount: normalized.orderTakingPolicy.approvedRiderSurchargeAmount,
    page: {
      title: '跑腿代拿',
      navbar: {
        background: 'transparent',
        titleColor: '#000',
        titleSize: '36rpx',
        titleWeight: '700',
      },
    },
    navigationItems: {
      leftItem: {
        backgroundImage: '/static/lv.png',
        titleBanner: '/static/zq.png',
        buttonText: '去看看',
        buttonIcon: 'icon-arrow',
        buttonColor: '#63fb9c',
      },
      rightItem: {
        backgroundImage: '/static/huang.png',
        titleBanner: '/static/rz.png',
        description: {
          primary: '完成认证即可接单',
          secondary: '顺路帮忙还赚钱',
          symbol: '!!!',
        },
        buttonText: '去认证',
        buttonIcon: 'icon-arrow',
        buttonColor: '#feed4c',
      },
    },
    tabNavigation: {
      items: [
        { name: '接单大厅', value: 1, show: true, filterType: 'pending_orders' },
        { name: '我的接单', value: 2, show: true, filterType: 'my_accepted_orders' },
        { name: '我的发布', value: 3, show: true, filterType: 'my_orders' },
      ],
      style: {
        leftPadding: '0rpx',
        activeColor: '#000',
        inactiveColor: '#999',
      },
    },
    announcement: {
      icon: 'icon-bullhorn-o',
      text: pageNotice,
      backgroundColor: '#f8f8f8',
      textColor: '#333',
      iconColor: '#666',
      show: true,
    },
    privacySettings: {
      hideNonRiderInfo: true,
      blurImages: true,
      maskPickupCode: true,
      showLockIcon: true,
      authPrompt: {
        title: '提示',
        content: '请先完成骑手认证后查看完整信息',
        confirmText: '去认证',
      },
    },
    publishButton: {
      text: '发布跑腿',
      icon: 'icon-fasong1',
      show: true,
      style: {
        backgroundColor: 'linear-gradient(90deg, #63FB9C 0%, #4CD964 100%)',
        textColor: '#000',
        iconColor: '#000',
        right: '30rpx',
        bottom: 'calc(200rpx + env(safe-area-inset-bottom))',
        width: '180rpx',
        height: '72rpx',
        borderRadius: '36rpx',
        transform: 'rotate(-2deg)',
        zIndex: 99,
      },
    },
    emptyStates: {
      pendingOrders: {
        title: '暂无待接单任务',
        subtitle: '刷新看看有没有新任务',
      },
      myAcceptedOrders: {
        title: '暂无接单记录',
        subtitle: '快去接单赚钱吧',
      },
      myPublishedOrders: {
        title: '暂无发布记录',
        subtitle: '发布一个跑腿任务吧',
      },
    },
    orderCard: {
      serviceTypes: {
        express_pickup: { text: '快递取件', backgroundColor: '#e8f5e9', textColor: '#4caf50' },
        food_delivery: { text: '外卖配送', backgroundColor: '#fff3e0', textColor: '#ff9800' },
        express_send: { text: '快递寄件', backgroundColor: '#e3f2fd', textColor: '#2196f3' },
        custom_task: { text: '万能任务', backgroundColor: '#f3e5f5', textColor: '#9c27b0' },
      },
      statusTypes: {
        confirmed: { text: '待接单', color: '#ff9800' },
        accepted: { text: '已接单', color: '#2196f3' },
        picked_up: { text: '已取件', color: '#4caf50' },
        delivered: { text: '已送达', color: '#9c27b0' },
        completed: { text: '已完成', color: '#666' },
        cancelled: { text: '已取消', color: '#999' },
      },
    },
    permissions: {
      restrictionTip: {
        show: true,
        icon: pageConfig?.defaultRiderAvatar || '/static/logo.jpg',
        title: '接单权限未开放',
        description: orderTips,
        servicePhone: pageConfig?.servicePhone || '',
      },
    },
  }
  return deepMerge(defaultConfig, extended?.pageConfig || {})
}
