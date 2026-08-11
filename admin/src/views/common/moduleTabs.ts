/**
 * 全站 tab 化配置（2026-07-19，P3）
 * 强相关页面合并为一个菜单入口，页内 tab 切换；旧路由全部保留，深链不死。
 * 组件用 defineAsyncComponent 保持按 tab 懒加载。
 */
import { defineAsyncComponent, type Component } from 'vue'

export interface ModuleTab {
  key: string
  title: string
  icon?: string
  component: Component
}

const asyncPage = (loader: () => Promise<any>) => defineAsyncComponent(loader)

export const moduleTabSets: Record<string, ModuleTab[]> = {
  // ── 数据与智能 ─────────────────────────────
  business: [
    { key: 'overview', title: '总览', icon: 'DataLine', component: asyncPage(() => import('@/views/analytics/AnalyticsOverview.vue')) },
    { key: 'users', title: '用户分析', icon: 'User', component: asyncPage(() => import('@/views/analytics/UserAnalytics.vue')) },
    { key: 'content', title: '内容分析', icon: 'Document', component: asyncPage(() => import('@/views/analytics/ContentAnalytics.vue')) },
    { key: 'orders', title: '订单分析', icon: 'Tickets', component: asyncPage(() => import('@/views/analytics/OrderAnalytics.vue')) },
    { key: 'riders', title: '骑手分析', icon: 'Van', component: asyncPage(() => import('@/views/analytics/RiderAnalytics.vue')) },
    { key: 'second-hand', title: '二手分析', icon: 'Goods', component: asyncPage(() => import('@/views/analytics/SecondHandAnalytics.vue')) }
  ],
  tracking: [
    { key: 'events', title: '埋点事件', icon: 'Aim', component: asyncPage(() => import('@/views/tracking/TrackingEvents.vue')) },
    { key: 'funnel', title: '漏斗分析', icon: 'Filter', component: asyncPage(() => import('@/views/tracking/FunnelAnalysis.vue')) },
    { key: 'keywords', title: '搜索关键词', icon: 'Search', component: asyncPage(() => import('@/views/tracking/SearchKeywords.vue')) }
  ],
  recommend: [
    { key: 'dashboard', title: '推荐中心', icon: 'DataLine', component: asyncPage(() => import('@/views/recommend/RecommendDashboard.vue')) },
    { key: 'strategy', title: '推荐策略', icon: 'Setting', component: asyncPage(() => import('@/views/recommend/RecommendStrategy.vue')) },
    { key: 'pool', title: '推荐池', icon: 'Box', component: asyncPage(() => import('@/views/recommend/RecommendPool.vue')) },
    { key: 'ab-tests', title: 'A/B 测试', icon: 'Operation', component: asyncPage(() => import('@/views/ab-test/ABTestList.vue')) }
  ],
  ai: [
    { key: 'dashboard', title: 'AI 看板', icon: 'Odometer', component: asyncPage(() => import('@/views/ai/AiDashboard.vue')) },
    { key: 'governance', title: 'AI 治理', icon: 'Warning', component: asyncPage(() => import('@/views/ai/AiGovernance.vue')) },
    { key: 'bots', title: '机器人管理', icon: 'Connection', component: asyncPage(() => import('@/views/ai/BotList.vue')) },
    { key: 'personas', title: '人设管理', icon: 'UserFilled', component: asyncPage(() => import('@/views/ai/PersonaList.vue')) },
    { key: 'tasks', title: 'AI 任务', icon: 'List', component: asyncPage(() => import('@/views/ai/TaskList.vue')) },
    { key: 'logs', title: 'AI 日志', icon: 'Document', component: asyncPage(() => import('@/views/ai/AiLogs.vue')) },
    { key: 'config', title: 'AI 配置', icon: 'Tools', component: asyncPage(() => import('@/views/ai/AiConfig.vue')) },
    { key: 'ops-config', title: 'AI 运营配置', icon: 'Cpu', component: asyncPage(() => import('@/views/growth/AiOpsConfigCenter.vue')) }
  ],

  // ── 外卖中心 ─────────────────────────────
  // 宿舍小店（组件靠 route.path 含 '/dorm-' 识别小店模式，路由必须保持该片段）
  dorm: [
    { key: 'shops', title: '小店列表', icon: 'House', component: asyncPage(() => import('@/views/merchant/MerchantList.vue')) },
    { key: 'audit', title: '小店审核', icon: 'Checked', component: asyncPage(() => import('@/views/merchant/MerchantAudit.vue')) },
    { key: 'categories', title: '小店分类', icon: 'Collection', component: asyncPage(() => import('@/views/merchant/ProductCategories.vue')) },
    { key: 'products', title: '小店商品', icon: 'Goods', component: asyncPage(() => import('@/views/merchant/MerchantProducts.vue')) },
    { key: 'orders', title: '小店订单', icon: 'Tickets', component: asyncPage(() => import('@/views/merchant/MerchantOrders.vue')) }
  ],
  'merchant-config': [
    { key: 'price', title: '平台价格规则', icon: 'PriceTag', component: asyncPage(() => import('@/views/merchant/MerchantPriceAdjustments.vue')) },
    { key: 'collection', title: '商品批量复制', icon: 'CopyDocument', component: asyncPage(() => import('@/views/merchant/ProductCollection.vue')) },
    { key: 'region', title: '外卖区域规则', icon: 'Setting', component: asyncPage(() => import('@/views/merchant/RegionMerchantSettings.vue')) },
    { key: 'printers', title: '打印机配置', icon: 'Printer', component: asyncPage(() => import('@/views/merchant/MerchantPrinters.vue')) }
  ],

  // ── 商城中心 ─────────────────────────────
  'mall-promo': [
    { key: 'promotions', title: '促销活动', icon: 'Flag', component: asyncPage(() => import('@/views/mall/MallPromotionsPage.vue')) },
    { key: 'distributors', title: '分销管理', icon: 'Share', component: asyncPage(() => import('@/views/mall/MallDistributors.vue')) }
  ],
  'mall-settings': [
    { key: 'freight', title: '运费模板', icon: 'Van', component: asyncPage(() => import('@/views/mall/MallFreight.vue')) },
    { key: 'service', title: '客服管理', icon: 'Service', component: asyncPage(() => import('@/views/mall/MallServiceStaff.vue')) }
  ],

  // ── 跑腿中心 ─────────────────────────────
  'errand-setup': [
    { key: 'pricing', title: '跑腿配置', icon: 'Tools', component: asyncPage(() => import('@/views/delivery/PricingRules.vue')) },
    { key: 'sizes', title: '物品大小', icon: 'Box', component: asyncPage(() => import('@/views/delivery/ErrandItemSizes.vue')) }
  ],

  // ── 财务中心 ─────────────────────────────
  'finance-settle': [
    { key: 'merchant', title: '商家结算', icon: 'Shop', component: asyncPage(() => import('@/views/finance/MerchantSettle.vue')) },
    { key: 'rider', title: '骑手结算', icon: 'Van', component: asyncPage(() => import('@/views/finance/RiderSettle.vue')) }
  ],
  'finance-ledger': [
    { key: 'subsidies', title: '平台补贴', icon: 'Coin', component: asyncPage(() => import('@/views/finance/SubsidyLedger.vue')) },
    { key: 'reconciliation', title: '对账中心', icon: 'DocumentChecked', component: asyncPage(() => import('@/views/finance/Reconciliation.vue')) }
  ],

  // ── 营销增长 ─────────────────────────────
  'marketing-center': [
    { key: 'campaigns', title: '运营活动中心', icon: 'Promotion', component: asyncPage(() => import('@/views/marketing/CampaignCenter.vue')) },
    { key: 'activities', title: '活动管理', icon: 'Flag', component: asyncPage(() => import('@/views/marketing/ActivityList.vue')) },
    { key: 'group-buys', title: '团购管理', icon: 'ShoppingCart', component: asyncPage(() => import('@/views/marketing/GroupBuyList.vue')) }
  ],
  'marketing-perks': [
    { key: 'coupons', title: '优惠券', icon: 'Ticket', component: asyncPage(() => import('@/views/marketing/CouponList.vue')) },
    { key: 'redeem', title: '兑换码', icon: 'Key', component: asyncPage(() => import('@/views/marketing/CouponRedeemCodes.vue')) },
    { key: 'sign', title: '签到任务', icon: 'Calendar', component: asyncPage(() => import('@/views/marketing/SignConfig.vue')) },
    { key: 'share', title: '分享有礼', icon: 'Share', component: asyncPage(() => import('@/views/marketing/ShareInvite.vue')) }
  ],
  'marketing-messages': [
    { key: 'assistant', title: '官方助手消息', icon: 'Service', component: asyncPage(() => import('@/views/marketing/OfficialAssistantMessages.vue')) },
    { key: 'notifications', title: '系统通知群发', icon: 'Bell', component: asyncPage(() => import('@/views/marketing/NotificationList.vue')) }
  ],

  // ── 内容中心 ─────────────────────────────
  'content-discussions': [
    { key: 'comments', title: '评论管理', icon: 'ChatDotSquare', component: asyncPage(() => import('@/views/content/CommentsPage.vue')) },
    { key: 'lotteries', title: '评论抽奖', icon: 'Present', component: asyncPage(() => import('@/views/content/CommentLotteryManage.vue')) }
  ],
  'content-assets': [
    { key: 'stickers', title: '表情包管理', icon: 'Picture', component: asyncPage(() => import('@/views/content/StickersPage.vue')) },
    { key: 'covers', title: '文字封面模板', icon: 'Brush', component: asyncPage(() => import('@/views/content/TextCoverTemplates.vue')) },
    { key: 'sensitive', title: '敏感词库', icon: 'Filter', component: asyncPage(() => import('@/views/content/SensitiveWords.vue')) }
  ],

  // ── 用户中心 ─────────────────────────────
  'user-loyalty': [
    { key: 'growth', title: '成长等级', icon: 'Trophy', component: asyncPage(() => import('@/views/user/UserGrowth.vue')) },
    { key: 'badges', title: '称号管理', icon: 'Medal', component: asyncPage(() => import('@/views/user/UserBadges.vue')) },
    { key: 'tags', title: '用户标签', icon: 'PriceTag', component: asyncPage(() => import('@/views/user/UserTags.vue')) }
  ],

  // ── 系统运维 ─────────────────────────────
  'system-publishing': [
    { key: 'website', title: '官网管理', icon: 'Monitor', component: asyncPage(() => import('@/views/system/WebsiteManager.vue')) },
    { key: 'agreements', title: '协议与条款', icon: 'DocumentChecked', component: asyncPage(() => import('@/views/system/AgreementCenter.vue')) },
    { key: 'notification-center', title: '通知中心配置', icon: 'Bell', component: asyncPage(() => import('@/views/system/NotificationCenterSettings.vue')) },
    { key: 'mini-program-paths', title: '小程序路径', icon: 'DocumentCopy', component: asyncPage(() => import('@/views/system/MiniProgramPaths.vue')) }
  ],
  'system-observability': [
    { key: 'monitor', title: '服务监控', icon: 'Cpu', component: asyncPage(() => import('@/views/system/ServiceMonitor.vue')) },
    { key: 'sessions', title: '在线连接', icon: 'Connection', component: asyncPage(() => import('@/views/system/RealtimeSessionsPage.vue')) },
    { key: 'jobs', title: '定时任务', icon: 'Timer', component: asyncPage(() => import('@/views/ops/ScheduledJobs.vue')) },
    { key: 'operation-logs', title: '操作日志', icon: 'Document', component: asyncPage(() => import('@/views/system/OperationLogs.vue')) },
    { key: 'login-logs', title: '登录日志', icon: 'Key', component: asyncPage(() => import('@/views/system/LoginLogs.vue')) },
    { key: 'wechat-logs', title: '微信发送日志', icon: 'Message', component: asyncPage(() => import('@/views/system/WechatLogsPage.vue')) }
  ],
}
