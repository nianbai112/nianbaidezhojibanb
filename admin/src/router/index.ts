import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import MainLayout from '@/layout/MainLayout.vue'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/dashboard' },
  { path: '/login', component: () => import('@/views/auth/Login.vue'), meta: { public: true, title: '登录' } },
  { path: '/setup', component: () => import('@/views/setup/SetupWizard.vue'), meta: { public: true, title: '首次安装' } },
  {
    path: '/',
    component: MainLayout,
    children: [
      // ========== 运营工作台 ==========
      { path: 'dashboard', component: () => import('@/views/dashboard/OperationsDashboard.vue'), meta: { title: '数据总览' } },
      { path: 'dashboard/todos', component: () => import('@/views/dashboard/TodayTodos.vue'), meta: { title: '今日待办' } },
      { path: 'dashboard/region-ops', component: () => import('@/views/dashboard/RegionOpsWorkbench.vue'), meta: { title: '区域运营' } },
      { path: 'dashboard/alerts', component: () => import('@/views/dashboard/AlertCenter.vue'), meta: { title: '异常中心' } },
      { path: 'dashboard/shortcuts', component: () => import('@/views/dashboard/QuickShortcuts.vue'), meta: { title: '快捷操作' } },

      // ========== 区域中心 ==========
      { path: 'region/list', component: () => import('@/views/region/RegionList.vue'), meta: { title: '区域列表' } },
      { path: 'region/config', component: () => import('@/views/region/RegionConfigCenter.vue'), meta: { title: '区域配置' } },
      { path: 'region/page-decoration', component: () => import('@/views/region/RegionPageDecoration.vue'), meta: { title: '页面装修' } },
      { path: 'region/tabbar', component: () => import('@/views/region/RegionTabbarManager.vue'), meta: { title: 'Tabbar 配置' } },
      { path: 'region/share-settings', component: () => import('@/views/region/RegionShareSettings.vue'), meta: { title: '分享配置' } },
      { path: 'region/admins', component: () => import('@/views/region/RegionAdmins.vue'), meta: { title: '区域管理员' } },

      // ========== 用户中心 ==========
      { path: 'user/list', component: () => import('@/views/modules/UsersPage.vue'), meta: { title: '用户列表' } },
      { path: 'user/verification', component: () => import('@/views/modules/VerificationPage.vue'), meta: { title: '学生认证' } },
      { path: 'user/schools', component: () => import('@/views/user/SchoolLibrary.vue'), meta: { title: '学校库管理' } },
      { path: 'user/tags', component: () => import('@/views/user/UserTags.vue'), meta: { title: '用户标签' } },
      { path: 'user/badges', component: () => import('@/views/user/UserBadges.vue'), meta: { title: '徽章称号' } },
      { path: 'user/blacklist', component: () => import('@/views/user/UserBlacklist.vue'), meta: { title: '黑名单/处罚' } },

      // ========== 内容中心 ==========
      { path: 'content/posts', component: () => import('@/views/content/PostsManage.vue'), meta: { title: '帖子管理' } },
      { path: 'content/comments', component: () => import('@/views/content/CommentsPage.vue'), meta: { title: '评论管理' } },
      { path: 'content/circles', component: () => import('@/views/content/CirclesPage.vue'), meta: { title: '圈子话题' } },
      { path: 'content/audit', component: () => import('@/views/content/ContentAudit.vue'), meta: { title: '审核举报' } },
      { path: 'content/sensitive', component: () => import('@/views/content/SensitiveWords.vue'), meta: { title: '敏感词库' } },
      { path: 'content/settings', component: () => import('@/views/content/ContentSettings.vue'), meta: { title: '内容配置' } },

      // ========== 商家中心 ==========
      { path: 'merchant/list', component: () => import('@/views/merchant/MerchantList.vue'), meta: { title: '商家列表' } },
      { path: 'merchant/audit', component: () => import('@/views/merchant/MerchantAudit.vue'), meta: { title: '商家审核' } },
      { path: 'merchant/products', component: () => import('@/views/merchant/MerchantProducts.vue'), meta: { title: '商品管理' } },
      { path: 'merchant/categories', component: () => import('@/views/merchant/ProductCategories.vue'), meta: { title: '商品分类' } },
      { path: 'merchant/orders', component: () => import('@/views/merchant/MerchantOrders.vue'), meta: { title: '外卖订单' } },
      { path: 'merchant/refunds', component: () => import('@/views/merchant/MerchantRefunds.vue'), meta: { title: '退款售后' } },
      { path: 'merchant/reviews', component: () => import('@/views/merchant/MerchantReviews.vue'), meta: { title: '商家评价' } },
      { path: 'merchant/settlements', component: () => import('@/views/merchant/MerchantSettlements.vue'), meta: { title: '商家结算' } },
      { path: 'merchant/printers', component: () => import('@/views/merchant/MerchantPrinters.vue'), meta: { title: '打印机配置' } },
      { path: 'merchant/price-adjustments', component: () => import('@/views/merchant/MerchantPriceAdjustments.vue'), meta: { title: '加价规则' } },
      { path: 'merchant/product-collection', component: () => import('@/views/merchant/ProductCollection.vue'), meta: { title: '商品采集' } },
      { path: 'merchant/region-settings', component: () => import('@/views/merchant/RegionMerchantSettings.vue'), meta: { title: '商家设置' } },

      // ========== 商城中心 ==========
      { path: 'mall/overview', component: () => import('@/views/mall/MallOverview.vue'), meta: { title: '商城概览' } },
      { path: 'mall/categories', component: () => import('@/views/mall/MallCategoriesPage.vue'), meta: { title: '商品分类' } },
      { path: 'mall/merchants', component: () => import('@/views/mall/MallMerchants.vue'), meta: { title: '商城商户' } },
      { path: 'mall/products', component: () => import('@/views/mall/MallProductsPage.vue'), meta: { title: '商城商品' } },
      { path: 'mall/orders', component: () => import('@/views/mall/MallOrdersPage.vue'), meta: { title: '商城订单' } },
      { path: 'mall/refunds', component: () => import('@/views/mall/MallRefunds.vue'), meta: { title: '商城售后' } },
      { path: 'mall/reviews', component: () => import('@/views/mall/MallReviews.vue'), meta: { title: '商城评价' } },
      { path: 'mall/freight', component: () => import('@/views/mall/MallFreight.vue'), meta: { title: '运费模板' } },
      { path: 'mall/distributors', component: () => import('@/views/mall/MallDistributors.vue'), meta: { title: '分销管理' } },
      { path: 'mall/promotions', component: () => import('@/views/mall/MallPromotionsPage.vue'), meta: { title: '促销活动' } },
      { path: 'mall/service-staff', component: () => import('@/views/mall/MallServiceStaff.vue'), meta: { title: '客服管理' } },

      // ========== 跑腿管理 ==========
      { path: 'errand/dashboard', component: () => import('@/views/delivery/ErrandDashboard.vue'), meta: { title: '跑腿工作台' } },
      { path: 'errand/orders', component: () => import('@/views/delivery/ErrandOrdersPage.vue'), meta: { title: '跑腿订单' } },
      { path: 'errand/pickup-points', component: () => import('@/views/delivery/ErrandPickupPoints.vue'), meta: { title: '取件点管理' } },
      { path: 'errand/item-sizes', component: () => import('@/views/delivery/ErrandItemSizes.vue'), meta: { title: '物品大小' } },
      { path: 'errand/riders', component: () => import('@/views/delivery/RidersPage.vue'), meta: { title: '骑手管理' } },
      { path: 'errand/dispatch', component: () => import('@/views/delivery/DispatchCenter.vue'), meta: { title: '调度中心' } },
      { path: 'errand/config', component: () => import('@/views/delivery/PricingRules.vue'), meta: { title: '跑腿配置' } },
      { path: 'errand/abnormal', component: () => import('@/views/delivery/AbnormalOrders.vue'), meta: { title: '异常订单' } },

      // ========== 订单履约中心 ==========
      { path: 'order/center', component: () => import('@/views/order/OrderCenterPage.vue'), meta: { title: '统一订单' } },
      { path: 'delivery/errand', redirect: '/errand/dashboard' },
      { path: 'delivery/orders', redirect: '/errand/orders' },
      { path: 'delivery/pickup-points', redirect: '/errand/pickup-points' },
      { path: 'delivery/item-sizes', redirect: '/errand/item-sizes' },
      { path: 'delivery/riders', redirect: '/errand/riders' },
      { path: 'delivery/dispatch', redirect: '/errand/dispatch' },
      { path: 'delivery/pricing', redirect: '/errand/config' },
      { path: 'delivery/abnormal', redirect: '/errand/abnormal' },

      // ========== 财务中心 ==========
      { path: 'finance/overview', component: () => import('@/views/finance/FinanceOverview.vue'), meta: { title: '财务总览' } },
      { path: 'finance/payments', component: () => import('@/views/finance/PaymentOrders.vue'), meta: { title: '支付订单' } },
      { path: 'finance/refunds', component: () => import('@/views/finance/RefundOrders.vue'), meta: { title: '退款订单' } },
      { path: 'finance/withdrawals', component: () => import('@/views/finance/WithdrawalsPage.vue'), meta: { title: '提现审核' } },
      { path: 'finance/wallet-logs', component: () => import('@/views/finance/WalletLogs.vue'), meta: { title: '用户流水' } },
      { path: 'finance/merchant-settle', component: () => import('@/views/finance/MerchantSettle.vue'), meta: { title: '商家结算' } },
      { path: 'finance/rider-settle', component: () => import('@/views/finance/RiderSettle.vue'), meta: { title: '骑手结算' } },
      { path: 'finance/reconciliation', component: () => import('@/views/finance/Reconciliation.vue'), meta: { title: '对账中心' } },

      // ========== 营销增长中心 ==========
      { path: 'marketing/overview', component: () => import('@/views/marketing/MarketingOverview.vue'), meta: { title: '营销概览' } },
      { path: 'marketing/coupons', component: () => import('@/views/marketing/CouponList.vue'), meta: { title: '优惠券' } },
      { path: 'marketing/activities', component: () => import('@/views/marketing/ActivityList.vue'), meta: { title: '活动管理' } },
      { path: 'marketing/group-buys', component: () => import('@/views/marketing/GroupBuyList.vue'), meta: { title: '团购管理' } },
      { path: 'marketing/sign', component: () => import('@/views/marketing/SignConfig.vue'), meta: { title: '签到任务' } },
      { path: 'marketing/share', component: () => import('@/views/marketing/ShareInvite.vue'), meta: { title: '分享有礼' } },
      { path: 'marketing/popups', component: () => import('@/views/marketing/PopupList.vue'), meta: { title: '弹窗广告' } },
      { path: 'growth/ranking', component: () => import('@/views/growth/RankingConfig.vue'), meta: { title: '榜单推荐' } },
      { path: 'marketing/notifications', component: () => import('@/views/marketing/NotificationList.vue'), meta: { title: '系统通知' } },
      { path: 'growth/ai-ops-config', component: () => import('@/views/growth/AiOpsConfigCenter.vue'), meta: { title: 'AI 运营' } },

      // ========== 扩展玩法中心 ==========
      { path: 'features/dating', component: () => import('@/views/features/DatingManage.vue'), meta: { title: '对象匹配' } },
      { path: 'features/drift-bottle', component: () => import('@/views/features/DriftBottle.vue'), meta: { title: '漂流瓶' } },
      { path: 'features/netdisk', component: () => import('@/views/features/NetDisk.vue'), meta: { title: '网盘资源' } },
      { path: 'features/checkin-map', component: () => import('@/views/features/CheckinMap.vue'), meta: { title: '打卡地图' } },
      { path: 'features/rating', component: () => import('@/views/features/RatingSystem.vue'), meta: { title: '评分系统' } },
      { path: 'features/second-hand', component: () => import('@/views/features/SecondHand.vue'), meta: { title: '二手交易' } },
      { path: 'features/photo-vote', component: () => import('@/views/features/PhotoVote.vue'), meta: { title: '爆照评选' } },
      { path: 'features/clubs', component: () => import('@/views/features/ClubsManage.vue'), meta: { title: '社团俱乐部' } },

      // ========== 系统运维中心 ==========
      { path: 'system/admins', component: () => import('@/views/modules/AdminsPage.vue'), meta: { title: '管理员' } },
      { path: 'system/roles', component: () => import('@/views/system/RolesPage.vue'), meta: { title: '角色权限' } },
      { path: 'system/files', component: () => import('@/views/modules/FilesPage.vue'), meta: { title: '文件中心' } },
      { path: 'system/settings', component: () => import('@/views/system/SystemSettings.vue'), meta: { title: '系统配置' } },
      { path: 'system/mini-program-paths', component: () => import('@/views/system/MiniProgramPaths.vue'), meta: { title: '小程序路径' } },
      { path: 'system/notification-center', component: () => import('@/views/system/NotificationCenterSettings.vue'), meta: { title: '通知中心配置' } },
      { path: 'system/operation-logs', component: () => import('@/views/system/OperationLogs.vue'), meta: { title: '操作日志' } },
      { path: 'system/login-logs', component: () => import('@/views/system/LoginLogs.vue'), meta: { title: '登录日志' } },
      { path: 'system/monitor', component: () => import('@/views/system/ServiceMonitor.vue'), meta: { title: '服务监控' } },
      { path: 'system/launch-check', component: () => import('@/views/system/LaunchCheck.vue'), meta: { title: '上线检查' } },
      { path: 'system/wechat-logs', component: () => import('@/views/system/WechatLogsPage.vue'), meta: { title: '微信发送日志' } },
      { path: 'system/realtime-sessions', component: () => import('@/views/system/RealtimeSessionsPage.vue'), meta: { title: '在线连接' } },
      { path: 'ops/jobs', component: () => import('@/views/ops/ScheduledJobs.vue'), meta: { title: '定时任务' } },

      // ========== 页面装修 ==========
      { path: 'layout/home', component: () => import('@/views/layout/HomeLayoutConfig.vue'), meta: { title: '首页布局配置' } },
      { path: 'layout/message', component: () => import('@/views/layout/MessageLayoutConfig.vue'), meta: { title: '消息页布局配置' } },
      { path: 'layout/profile', component: () => import('@/views/layout/ProfileLayoutConfig.vue'), meta: { title: '我的页布局配置' } },

      // ========== 数据分析 ==========
      { path: 'analytics/overview', component: () => import('@/views/analytics/AnalyticsOverview.vue'), meta: { title: '数据概览' } },
      { path: 'analytics/users', component: () => import('@/views/analytics/UserAnalytics.vue'), meta: { title: '用户分析' } },
      { path: 'analytics/content', component: () => import('@/views/analytics/ContentAnalytics.vue'), meta: { title: '内容分析' } },
      { path: 'analytics/orders', component: () => import('@/views/analytics/OrderAnalytics.vue'), meta: { title: '订单分析' } },

      // ========== 推荐与测试 ==========
      { path: 'recommend/dashboard', component: () => import('@/views/recommend/RecommendDashboard.vue'), meta: { title: '推荐中心' } },
      { path: 'recommend/strategy', component: () => import('@/views/recommend/RecommendStrategy.vue'), meta: { title: '推荐策略' } },
      { path: 'recommend/pool', component: () => import('@/views/recommend/RecommendPool.vue'), meta: { title: '推荐池' } },
      { path: 'ab-tests', component: () => import('@/views/ab-test/ABTestList.vue'), meta: { title: 'A/B测试' } },

      // ========== AI 运营 ==========
      { path: 'ai/dashboard', component: () => import('@/views/ai/AiDashboard.vue'), meta: { title: 'AI运营中心' } },
      { path: 'ai/bots', component: () => import('@/views/ai/BotList.vue'), meta: { title: '机器人管理' } },
      { path: 'ai/personas', component: () => import('@/views/ai/PersonaList.vue'), meta: { title: '人设管理' } },
      { path: 'ai/tasks', component: () => import('@/views/ai/TaskList.vue'), meta: { title: 'AI任务' } },
      { path: 'ai/logs', component: () => import('@/views/ai/AiLogs.vue'), meta: { title: 'AI日志' } },
      { path: 'ai/config', component: () => import('@/views/ai/AiConfig.vue'), meta: { title: 'AI配置' } },

      // ========== 埋点追踪 ==========
      { path: 'tracking/events', component: () => import('@/views/tracking/TrackingEvents.vue'), meta: { title: '埋点事件' } },
      { path: 'tracking/funnel', component: () => import('@/views/tracking/FunnelAnalysis.vue'), meta: { title: '漏斗分析' } },
      { path: 'tracking/keywords', component: () => import('@/views/tracking/SearchKeywords.vue'), meta: { title: '搜索关键词' } },
    ]
  },
  { path: '/:pathMatch(.*)*', component: () => import('@/views/error/NotFound.vue') }
]

const router = createRouter({ history: createWebHistory(), routes })
router.beforeEach((to) => {
  const token = localStorage.getItem('LM_ADMIN_TOKEN') || localStorage.getItem('admin_token')
  if (!to.meta.public && !token) return '/login'
  if (to.path === '/login' && token) return '/dashboard'
})
export default router
