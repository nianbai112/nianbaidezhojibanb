import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'

/** 静态路由（无需登录） */
const staticRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录', hidden: true },
  },
  {
    path: '/403',
    name: 'Forbidden',
    component: () => import('@/views/error/403.vue'),
    meta: { title: '无权限', hidden: true },
  },
  {
    path: '/setup',
    name: 'Setup',
    component: () => import('@/views/setup/index.vue'),
    meta: { title: '安装向导', hidden: true },
  },
]

/** 动态路由（按权限加载） */
export const asyncRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    redirect: '/dashboard',
    children: [
      // ===== 工作台 =====
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/index.vue'),
        meta: { title: '工作台', icon: 'DashboardOutlined', permission: 'dashboard:view', affix: true },
      },

      // ===== 区域管理 =====
      {
        path: 'area',
        name: 'Area',
        redirect: '/area/list',
        meta: { title: '区域管理', icon: 'EnvironmentOutlined', permission: 'region:view' },
        children: [
          { path: 'list', name: 'AreaList', component: () => import('@/views/area/AreaList.vue'), meta: { title: '区域列表', permission: 'region:view' } },
          { path: 'tabbar', name: 'AreaTabBar', component: () => import('@/views/area/AreaConfigPage.vue'), meta: { title: 'Tabbar管理', permission: 'region:edit', configKind: 'tabbar' } },
          { path: 'share', name: 'AreaShareSettings', component: () => import('@/views/area/AreaConfigPage.vue'), meta: { title: '分享设置', permission: 'region:edit', configKind: 'share' } },
          { path: 'features', name: 'AreaFeatureConfig', component: () => import('@/views/area/AreaConfigPage.vue'), meta: { title: '功能配置', permission: 'region:edit', configKind: 'features' } },
          { path: 'home', name: 'AreaHomeContentConfig', component: () => import('@/views/area/AreaConfigPage.vue'), meta: { title: '首页内容配置', permission: 'region:edit', configKind: 'home' } },
          { path: 'rich-text', name: 'AreaRichText', component: () => import('@/views/area/AreaConfigPage.vue'), meta: { title: '区域富文本', permission: 'region:edit', configKind: 'richText' } },
          { path: 'robots', name: 'AreaRobotConfig', component: () => import('@/views/area/AreaConfigPage.vue'), meta: { title: '机器人配置', permission: 'region:edit', configKind: 'robots' } },
          { path: 'signin', name: 'AreaSignScoreConfig', component: () => import('@/views/area/AreaConfigPage.vue'), meta: { title: '签到与积分配置', permission: 'region:edit', configKind: 'signin' } },
          { path: 'avatars', name: 'AreaAvatarLibrary', component: () => import('@/views/area/AreaConfigPage.vue'), meta: { title: '头像库管理', permission: 'region:edit', configKind: 'avatars' } },
          { path: 'emojis', name: 'AreaEmojiPack', component: () => import('@/views/area/AreaConfigPage.vue'), meta: { title: '表情包管理', permission: 'region:edit', configKind: 'emojis' } },
          { path: 'custom-pages', name: 'AreaCustomPages', component: () => import('@/views/area/AreaConfigPage.vue'), meta: { title: '自定义页面管理', permission: 'region:edit', configKind: 'customPages' } },
          { path: 'detail/:id', name: 'AreaDetail', component: () => import('@/views/area/AreaDetail.vue'), meta: { title: '区域详情', hidden: true, permission: 'region:view' } },
          { path: 'decoration/:id', name: 'AreaDecoration', component: () => import('@/views/area/AreaDecoration.vue'), meta: { title: '首页装修', hidden: true, permission: 'region:edit' } },
          { path: 'create', name: 'AreaCreate', component: () => import('@/views/area/RegionEdit.vue'), meta: { title: '新增区域', hidden: true, permission: 'region:edit' } },
          { path: 'edit/:id', name: 'AreaEdit', component: () => import('@/views/area/RegionEdit.vue'), meta: { title: '编辑区域', hidden: true, permission: 'region:edit' } },
        ],
      },

      // ===== 内容管理 =====
      {
        path: 'content',
        name: 'Content',
        redirect: '/content/posts',
        meta: { title: '内容管理', icon: 'FileTextOutlined', permission: 'post:view' },
        children: [
          { path: 'posts', name: 'PostList', component: () => import('@/views/content/PostList.vue'), meta: { title: '帖子管理', permission: 'post:view' } },
          { path: 'post/:id', name: 'PostDetail', component: () => import('@/views/content/PostDetail.vue'), meta: { title: '帖子详情', hidden: true, permission: 'post:view' } },
          { path: 'comments', name: 'CommentList', component: () => import('@/views/content/CommentList.vue'), meta: { title: '评论管理', permission: 'comment:view' } },
          { path: 'circles', name: 'CircleList', component: () => import('@/views/content/CircleList.vue'), meta: { title: '圈子管理', permission: 'circle:manage' } },
          { path: 'topics', name: 'TopicList', component: () => import('@/views/content/TopicList.vue'), meta: { title: '话题管理', permission: 'topic:manage' } },
          { path: 'reports', name: 'ReportList', component: () => import('@/views/content/ReportList.vue'), meta: { title: '举报管理', permission: 'report:handle' } },
          { path: 'hot', name: 'HotList', component: () => import('@/views/content/HotList.vue'), meta: { title: '热榜管理', permission: 'post:view' } },
          { path: 'note-settings', name: 'NoteSettings', component: () => import('@/views/content/NoteSettings.vue'), meta: { title: '笔记配置', permission: 'post:audit' } },
        ],
      },

      // ===== 用户管理 =====
      {
        path: 'user',
        name: 'User',
        redirect: '/user/list',
        meta: { title: '用户管理', icon: 'TeamOutlined', permission: 'user:view' },
        children: [
          { path: 'list', name: 'UserList', component: () => import('@/views/user/UserList.vue'), meta: { title: '用户列表', permission: 'user:view' } },
          { path: 'detail/:id', name: 'UserDetail', component: () => import('@/views/user/UserDetail.vue'), meta: { title: '用户详情', hidden: true, permission: 'user:view' } },
          { path: 'tags', name: 'UserTagManage', component: () => import('@/views/user/UserTagManage.vue'), meta: { title: '标签管理', permission: 'user:edit' } },
          { path: 'certifications', name: 'UserCertifications', component: () => import('@/views/user/UserCertifications.vue'), meta: { title: '学生认证审核', permission: 'user:cert' } },
          { path: 'levels', name: 'UserLevelManage', component: () => import('@/views/user/UserLevelManage.vue'), meta: { title: '等级管理', permission: 'user:level' } },
          { path: 'addresses', name: 'AddressList', component: () => import('@/views/user/AddressList.vue'), meta: { title: '地址管理', permission: 'user:view' } },
          { path: 'balance', name: 'BatchBalance', component: () => import('@/views/user/BatchBalance.vue'), meta: { title: '余额管理', permission: 'user:balance' } },
        ],
      },

      // ===== 用户引导 =====
      {
        path: 'user-guidance',
        name: 'UserGuidance',
        redirect: '/user-guidance/pages',
        meta: { title: '用户引导', icon: 'ReadOutlined', permission: 'userguidance:view' },
        children: [
          { path: 'pages', name: 'UserGuidanceList', component: () => import('@/views/user/UserGuidance.vue'), meta: { title: '引导页管理', permission: 'userguidance:view' } },
        ],
      },

      // ===== 私信管理 =====
      {
        path: 'messages',
        name: 'MessageManage',
        redirect: '/messages/list',
        meta: { title: '私信管理', icon: 'MessageOutlined', permission: 'message:view' },
        children: [
          { path: 'list', name: 'MessageList', component: () => import('@/views/user/MessageManage.vue'), meta: { title: '会话管理', permission: 'message:view' } },
        ],
      },

      // ===== 商城/商家 =====
      {
        path: 'shop',
        name: 'Shop',
        redirect: '/shop/merchants',
        meta: { title: '商城管理', icon: 'ShopOutlined', permission: 'merchant:view' },
        children: [
          // 7 个目标页面
          { path: 'merchants', name: 'MerchantList', component: () => import('@/views/shop/MerchantList.vue'), meta: { title: '商家列表', permission: 'merchant:view' } },
          { path: 'merchant/:id', name: 'MerchantDetail', component: () => import('@/views/shop/MerchantDetail.vue'), meta: { title: '商家详情', hidden: true, permission: 'merchant:view' } },
          { path: 'applications', name: 'MerchantApplications', component: () => import('@/views/audit/MerchantAuditList.vue'), meta: { title: '入驻申请', permission: 'merchant:audit' } },
          { path: 'printers', name: 'PrinterConfig', component: () => import('@/views/shop/PrinterConfig.vue'), meta: { title: '打印机配置', permission: 'merchant:printer' } },
          { path: 'price-adjustments', name: 'PriceAdjustmentList', component: () => import('@/views/shop/PriceAdjustmentList.vue'), meta: { title: '商品加价', permission: 'merchant:price' } },
          { path: 'product-collection', name: 'ProductCollection', component: () => import('@/views/shop/ProductCollection.vue'), meta: { title: '商品采集', permission: 'merchant:collection' } },
          { path: 'reviews', name: 'ReviewList', component: () => import('@/views/shop/ReviewList.vue'), meta: { title: '评价管理', permission: 'review:manage' } },
          { path: 'merchant-config', name: 'RegionMerchantConfig', component: () => import('@/views/shop/RegionMerchantConfig.vue'), meta: { title: '商家配置', permission: 'merchant:config' } },
          { path: 'distributors', name: 'DistributorList', component: () => import('@/views/shop/DistributorList.vue'), meta: { title: '分销管理', permission: 'mall:view' } },
          { path: 'distributor-config', name: 'DistributorConfig', component: () => import('@/views/shop/DistributorConfig.vue'), meta: { title: '分销配置', permission: 'mall:config' } },
          // 保留的子页面
          { path: 'categories', name: 'CategoryList', component: () => import('@/views/shop/CategoryList.vue'), meta: { title: '商品类目', permission: 'product:view' } },
          { path: 'products', name: 'ProductList', component: () => import('@/views/shop/ProductList.vue'), meta: { title: '商品管理', permission: 'product:view' } },
          { path: 'product/:id', name: 'ProductDetail', component: () => import('@/views/shop/ProductDetail.vue'), meta: { title: '商品详情', hidden: true, permission: 'product:view' } },
          { path: 'orders', name: 'OrderList', component: () => import('@/views/shop/OrderList.vue'), meta: { title: '订单管理', permission: 'order:view' } },
          { path: 'order/:id', name: 'OrderDetail', component: () => import('@/views/shop/OrderDetail.vue'), meta: { title: '订单详情', hidden: true, permission: 'order:view' } },
          { path: 'refunds', name: 'RefundList', component: () => import('@/views/shop/RefundList.vue'), meta: { title: '退款管理', permission: 'order:refund' } },
          { path: 'promotions', name: 'PromotionList', component: () => import('@/views/shop/PromotionList.vue'), meta: { title: '促销活动', permission: 'promotion:manage' } },
          { path: 'freight', name: 'FreightList', component: () => import('@/views/shop/FreightList.vue'), meta: { title: '运费模板', permission: 'freight:manage' } },
          { path: 'stock-alerts', name: 'StockAlertList', component: () => import('@/views/shop/StockAlertList.vue'), meta: { title: '库存预警', permission: 'product:view' } },
        ],
      },

      // ===== 交易管理 =====
      {
        path: 'transaction',
        name: 'Transaction',
        redirect: '/transaction/orders',
        meta: { title: '交易管理', icon: 'TransactionOutlined', permission: 'finance:view' },
        children: [
          { path: 'orders', name: 'TransOrderList', component: () => import('@/views/transaction/OrderList.vue'), meta: { title: '订单管理', permission: 'finance:view' } },
          { path: 'payments', name: 'TransPaymentList', component: () => import('@/views/transaction/PaymentList.vue'), meta: { title: '支付单管理', permission: 'finance:view' } },
          { path: 'refunds', name: 'TransRefundList', component: () => import('@/views/transaction/RefundList.vue'), meta: { title: '退款管理', permission: 'finance:view' } },
          { path: 'withdraws', name: 'TransWithdrawList', component: () => import('@/views/transaction/WithdrawList.vue'), meta: { title: '提现管理', permission: 'withdraw:audit' } },
          { path: 'settlements', name: 'SettlementList', component: () => import('@/views/transaction/SettlementList.vue'), meta: { title: '商户结算', permission: 'finance:settlement' } },
          { path: 'ledger', name: 'LedgerList', component: () => import('@/views/transaction/LedgerList.vue'), meta: { title: '平台流水', permission: 'finance:view' } },
          { path: 'reconciliations', name: 'ReconciliationList', component: () => import('@/views/transaction/ReconciliationList.vue'), meta: { title: '对账管理', permission: 'finance:reconciliation' } },
        ],
      },

      // ===== 审核中心 =====
      {
        path: 'audit',
        name: 'Audit',
        redirect: '/audit/center',
        meta: { title: '审核中心', icon: 'AuditOutlined', permission: 'audit:view' },
        children: [
          { path: 'center', name: 'AuditCenter', component: () => import('@/views/audit/AuditCenter.vue'), meta: { title: '审核中心', permission: 'audit:view' } },
          { path: 'posts', name: 'AuditPostList', component: () => import('@/views/audit/PostAuditList.vue'), meta: { title: '帖子审核', permission: 'post:audit' } },
          { path: 'comments', name: 'AuditCommentList', component: () => import('@/views/audit/CommentAuditList.vue'), meta: { title: '评论审核', permission: 'comment:audit' } },
          { path: 'merchants', name: 'AuditMerchantList', component: () => import('@/views/audit/MerchantAuditList.vue'), meta: { title: '商家审核', permission: 'merchant:audit' } },
          { path: 'withdraws', name: 'AuditWithdrawList', component: () => import('@/views/audit/WithdrawAuditList.vue'), meta: { title: '提现审核', permission: 'withdraw:audit' } },
          { path: 'city-agents', name: 'AuditCityAgentList', component: () => import('@/views/audit/CityAgentAuditList.vue'), meta: { title: '城市代理审核', permission: 'city:audit' } },
          { path: 'reports', name: 'AuditReportList', component: () => import('@/views/audit/ReportAuditList.vue'), meta: { title: '举报处理', permission: 'report:handle' } },
        ],
      },

      // ===== 机器人运营 =====
      {
        path: 'robot',
        name: 'Robot',
        redirect: '/robot/accounts',
        meta: { title: '机器人运营', icon: 'RobotOutlined', permission: 'robot:view' },
        children: [
          { path: 'accounts', name: 'RobotAccountList', component: () => import('@/views/robot/AccountList.vue'), meta: { title: '机器人账号', permission: 'robot:view' } },
          { path: 'post-tasks', name: 'RobotPostTaskList', component: () => import('@/views/robot/PostTaskList.vue'), meta: { title: 'AI 发帖', permission: 'robot:post' } },
          { path: 'comment-tasks', name: 'RobotCommentTaskList', component: () => import('@/views/robot/CommentTaskList.vue'), meta: { title: 'AI 评论', permission: 'robot:comment' } },
          { path: 'tasks', name: 'RobotTaskHub', component: () => import('@/views/robot/TaskHub.vue'), meta: { title: '机器人任务', permission: 'robot:view' } },
          { path: 'prompts', name: 'PromptTemplateList', component: () => import('@/views/robot/PromptTemplateList.vue'), meta: { title: 'AI 提示词', permission: 'robot:view' } },
        ],
      },

      // ===== 配置中心 =====
      {
        path: 'config',
        name: 'Config',
        redirect: '/config/basic',
        meta: { title: '配置中心', icon: 'ControlOutlined', permission: 'system:config' },
        children: [
          { path: 'basic', name: 'BasicConfig', component: () => import('@/views/config/BasicConfig.vue'), meta: { title: '基础配置', permission: 'system:config' } },
          { path: 'home', name: 'HomeConfig', component: () => import('@/views/config/HomeConfig.vue'), meta: { title: '首页配置', permission: 'system:config' } },
          { path: 'post', name: 'PostConfig', component: () => import('@/views/config/PostConfig.vue'), meta: { title: '发帖配置', permission: 'system:config' } },
          { path: 'audit', name: 'AuditConfig', component: () => import('@/views/config/AuditConfig.vue'), meta: { title: '审核配置', permission: 'system:config' } },
          { path: 'upload', name: 'UploadConfig', component: () => import('@/views/config/UploadConfig.vue'), meta: { title: '上传配置', permission: 'system:config' } },
          { path: 'ad', name: 'AdConfig', component: () => import('@/views/config/AdConfig.vue'), meta: { title: '广告配置', permission: 'system:config' } },
          { path: 'ai', name: 'AIConfig', component: () => import('@/views/config/AIConfig.vue'), meta: { title: 'AI 配置', permission: 'system:config' } },
          { path: 'robot', name: 'RobotConfig', component: () => import('@/views/config/RobotConfig.vue'), meta: { title: '机器人配置', permission: 'system:config' } },
          { path: 'sensitive-words', name: 'SensitiveWordConfig', component: () => import('@/views/config/SensitiveWordConfig.vue'), meta: { title: '敏感词配置', permission: 'system:config' } },
        ],
      },

      // ===== 跑腿配送 =====
      {
        path: 'delivery',
        name: 'Delivery',
        redirect: '/delivery/orders',
        meta: { title: '跑腿配送', icon: 'CarOutlined', permission: 'errand:view' },
        children: [
          { path: 'orders', name: 'DeliveryOrderList', component: () => import('@/views/delivery/DeliveryOrderList.vue'), meta: { title: '订单管理', permission: 'errand:view' } },
          { path: 'order/:id', name: 'DeliveryOrderDetail', component: () => import('@/views/delivery/DeliveryOrderDetail.vue'), meta: { title: '订单详情', hidden: true, permission: 'errand:view' } },
          { path: 'riders', name: 'RiderList', component: () => import('@/views/delivery/RiderList.vue'), meta: { title: '骑手管理', permission: 'rider:view' } },
          { path: 'rider/:id', name: 'RiderDetail', component: () => import('@/views/delivery/RiderDetail.vue'), meta: { title: '骑手详情', hidden: true, permission: 'rider:view' } },
          { path: 'fee-rules', name: 'FeeRuleList', component: () => import('@/views/delivery/FeeRuleList.vue'), meta: { title: '计费规则', permission: 'errand:config' } },
          { path: 'page-config', name: 'PageConfig', component: () => import('@/views/delivery/PageConfig.vue'), meta: { title: '页面配置', permission: 'errand:config' } },
          { path: 'pickup-points', name: 'PickupPointList', component: () => import('@/views/delivery/PickupPointList.vue'), meta: { title: '取件点管理', permission: 'errand:pickup-point:view' } },
          { path: 'item-sizes', name: 'ItemSizeList', component: () => import('@/views/delivery/ItemSizeList.vue'), meta: { title: '物品大小', permission: 'errand:item-size:view' } },
          { path: 'delivery-stats', name: 'DeliveryStats', component: () => import('@/views/delivery/DeliveryStats.vue'), meta: { title: '配送统计', permission: 'errand:view' } },
          { path: 'reward-punish', name: 'RewardPunishConfig', component: () => import('@/views/delivery/RewardPunishConfig.vue'), meta: { title: '奖惩配置', permission: 'errand:config' } },
        ],
      },

      // ===== 团购系统 =====
      {
        path: 'group-buy',
        name: 'GroupBuy',
        redirect: '/group-buy/dashboard',
        meta: { title: '团购系统', icon: 'ShoppingOutlined', permission: 'groupbuy:view' },
        children: [
          { path: 'dashboard', name: 'GroupBuyDashboard', component: () => import('@/views/groupBuy/Dashboard.vue'), meta: { title: '独立概览', permission: 'groupbuy:view' } },
          { path: 'config', name: 'GroupBuyConfig', component: () => import('@/views/groupBuy/Config.vue'), meta: { title: '区域设置', permission: 'groupbuy:edit' } },
          { path: 'categories', name: 'GroupBuyCategoryList', component: () => import('@/views/groupBuy/CategoryList.vue'), meta: { title: '分类管理', permission: 'groupbuy:view' } },
          { path: 'packages', name: 'GroupBuyPackageList', component: () => import('@/views/groupBuy/PackageList.vue'), meta: { title: '套餐管理', permission: 'groupbuy:view' } },
          { path: 'orders', name: 'GroupBuyOrderList', component: () => import('@/views/groupBuy/OrderList.vue'), meta: { title: '订单管理', permission: 'groupbuy:view' } },
          { path: 'reviews', name: 'GroupBuyReviewList', component: () => import('@/views/groupBuy/ReviewList.vue'), meta: { title: '评价管理', permission: 'groupbuy:view' } },
        ],
      },

      // ===== 社群管理 =====
      {
        path: 'community',
        name: 'Community',
        redirect: '/community/circles',
        meta: { title: '社群管理', icon: 'TeamOutlined', permission: 'community:view' },
        children: [
          { path: 'circles', name: 'CommunityCircleList', component: () => import('@/views/community/CircleList.vue'), meta: { title: '社群列表', permission: 'community:view' } },
          { path: 'circles/:circleId/members', name: 'CommunityCircleMembers', component: () => import('@/views/community/CircleMembers.vue'), meta: { title: '成员管理', hidden: true, permission: 'community:view' } },
          { path: 'payments', name: 'CommunityPaymentList', component: () => import('@/views/community/PaymentList.vue'), meta: { title: '购买记录', permission: 'community:view' } },
          { path: 'config', name: 'CommunityCircleConfig', component: () => import('@/views/community/CircleConfig.vue'), meta: { title: '区域配置', permission: 'community:config' } },
        ],
      },

      // ===== 小程序工具 =====
      {
        path: 'miniapp',
        name: 'Miniapp',
        redirect: '/miniapp/upload',
        meta: { title: '小程序工具', icon: 'MobileOutlined', permission: 'system:config' },
        children: [
          { path: 'upload', name: 'MiniappUpload', component: () => import('@/views/miniapp/Upload.vue'), meta: { title: '小程序上传', permission: 'system:config' } },
          { path: 'qrcode', name: 'MiniappQrcode', component: () => import('@/views/miniapp/Qrcode.vue'), meta: { title: '小程序码管理', permission: 'system:config' } },
          { path: 'pages', name: 'MiniappPages', component: () => import('@/views/miniapp/Pages.vue'), meta: { title: '页面路径', permission: 'system:config' } },
          { path: 'subscribe', name: 'MiniappSubscribe', component: () => import('@/views/miniapp/Subscribe.vue'), meta: { title: '模板消息', permission: 'system:config' } },
        ],
      },

      // ===== 内容扩展 =====
      {
        path: 'content-ext',
        name: 'ContentExt',
        redirect: '/content-ext/anonymous',
        meta: { title: '内容扩展', icon: 'FileTextOutlined', permission: 'post:audit' },
        children: [
          { path: 'anonymous', name: 'AnonymousIdentity', component: () => import('@/views/contentExt/AnonymousIdentity.vue'), meta: { title: '匿名身份', permission: 'post:audit' } },
          { path: 'poster', name: 'NotePoster', component: () => import('@/views/contentExt/NotePoster.vue'), meta: { title: '笔记海报', permission: 'post:audit' } },
          { path: 'reward', name: 'RewardConfig', component: () => import('@/views/contentExt/RewardConfig.vue'), meta: { title: '奖励设置', permission: 'system:config' } },
          { path: 'notifications', name: 'NotificationLog', component: () => import('@/views/contentExt/NotificationLog.vue'), meta: { title: '通知记录', permission: 'user:view' } },
        ],
      },

      // ===== 爆照评选 =====
      {
        path: 'photo-contest',
        name: 'PhotoContest',
        redirect: '/photo-contest/contests',
        meta: { title: '爆照评选', icon: 'CameraOutlined', permission: 'photoContest:view' },
        children: [
          { path: 'contests', name: 'PhotoContestList', component: () => import('@/views/photoContest/ContestList.vue'), meta: { title: '评选项目', permission: 'photoContest:view' } },
          { path: 'pending', name: 'PhotoContestPending', component: () => import('@/views/photoContest/EntryPending.vue'), meta: { title: '待审核照片', permission: 'photoContest:audit' } },
          { path: 'entries', name: 'PhotoContestEntries', component: () => import('@/views/photoContest/EntryList.vue'), meta: { title: '作品管理', permission: 'photoContest:view' } },
          { path: 'stats', name: 'PhotoContestStats', component: () => import('@/views/photoContest/VoteStats.vue'), meta: { title: '投票统计', permission: 'photoContest:view' } },
          { path: 'winners', name: 'PhotoContestWinners', component: () => import('@/views/photoContest/ContestWinners.vue'), meta: { title: '获奖管理', permission: 'photoContest:view' } },
          { path: 'config', name: 'PhotoContestConfig', component: () => import('@/views/photoContest/ContestConfig.vue'), meta: { title: '评选配置', permission: 'photoContest:config' } },
        ],
      },

      // ===== 活动管理 =====
      {
        path: 'activity',
        name: 'Activity',
        redirect: '/activity/list',
        meta: { title: '活动管理', icon: 'ScheduleOutlined', permission: 'activity:view' },
        children: [
          { path: 'list', name: 'ActivityMgmtList', component: () => import('@/views/activity/ActivityList.vue'), meta: { title: '活动列表', permission: 'activity:view' } },
          { path: 'types', name: 'ActivityTypeList', component: () => import('@/views/activity/ActivityTypeList.vue'), meta: { title: '活动类型', permission: 'activity:view' } },
          { path: 'packages', name: 'ActivityPackageList', component: () => import('@/views/activity/PackageList.vue'), meta: { title: '套餐管理', permission: 'activity:view' } },
          { path: 'orders', name: 'ActivityOrderList', component: () => import('@/views/activity/OrderList.vue'), meta: { title: '订单管理', permission: 'activity:order' } },
          { path: 'rewards', name: 'ActivityRewardList', component: () => import('@/views/activity/RewardList.vue'), meta: { title: '奖励管理', permission: 'activity:view' } },
        ],
      },

      // ===== 评分管理 =====
      {
        path: 'rating',
        name: 'Rating',
        redirect: '/rating/dashboard',
        meta: { title: '评分管理', icon: 'StarOutlined', permission: 'rating:view' },
        children: [
          { path: 'dashboard', name: 'RatingDashboard', component: () => import('@/views/rating/Dashboard.vue'), meta: { title: '系统概览', permission: 'rating:view' } },
          { path: 'settings', name: 'RatingRegionSettings', component: () => import('@/views/rating/RegionSettings.vue'), meta: { title: '区域设置', permission: 'rating:config' } },
          { path: 'categories', name: 'RatingCategoryList', component: () => import('@/views/rating/CategoryList.vue'), meta: { title: '分类管理', permission: 'rating:view' } },
          { path: 'items', name: 'RatingItemList', component: () => import('@/views/rating/ItemList.vue'), meta: { title: '项目管理', permission: 'rating:view' } },
          { path: 'records', name: 'RatingRecordList', component: () => import('@/views/rating/RecordList.vue'), meta: { title: '评分记录', permission: 'rating:view' } },
          { path: 'replies', name: 'RatingReplyList', component: () => import('@/views/rating/ReplyList.vue'), meta: { title: '回复管理', permission: 'rating:view' } },
        ],
      },

      // ===== 财务中心（保留原有） =====


      {
        path: 'finance',
        name: 'Finance',
        redirect: '/finance/payments',
        meta: { title: '财务中心', icon: 'DollarOutlined', permission: 'finance:view' },
        children: [
          { path: 'payments', name: 'PaymentList', component: () => import('@/views/finance/PaymentList.vue'), meta: { title: '支付订单', permission: 'finance:view' } },
          { path: 'recharges', name: 'RechargeList', component: () => import('@/views/finance/RechargeList.vue'), meta: { title: '充值记录', permission: 'finance:view' } },
          { path: 'balance-logs', name: 'BalanceLogList', component: () => import('@/views/finance/BalanceLogList.vue'), meta: { title: '余额流水', permission: 'finance:view' } },
          { path: 'withdraws', name: 'WithdrawList', component: () => import('@/views/finance/WithdrawList.vue'), meta: { title: '提现审核', permission: 'withdraw:audit' } },
          { path: 'refunds', name: 'FinanceRefundList', component: () => import('@/views/finance/RefundFinanceList.vue'), meta: { title: '退款记录', permission: 'finance:view' } },
          { path: 'alipay-transfers', name: 'AlipayTransfer', component: () => import('@/views/finance/AlipayTransfer.vue'), meta: { title: '支付宝转账', permission: 'finance:transfer' } },
          { path: 'region-balance-logs', name: 'RegionBalanceLog', component: () => import('@/views/finance/RegionBalanceLog.vue'), meta: { title: '区域余额', permission: 'finance:view' } },
          { path: 'reconciliations', name: 'FinanceReconciliationList', component: () => import('@/views/finance/ReconciliationList.vue'), meta: { title: '对账导出', permission: 'finance:reconciliation' } },
        ],
      },

      // ===== 运营工具 =====
      {
        path: 'marketing',
        name: 'Marketing',
        redirect: '/marketing/coupons',
        meta: { title: '运营工具', icon: 'GiftOutlined', permission: 'coupon:view' },
        children: [
          { path: 'coupons', name: 'CouponList', component: () => import('@/views/marketing/CouponList.vue'), meta: { title: '优惠券', permission: 'coupon:view' } },
          { path: 'coupon-records', name: 'CouponUsageList', component: () => import('@/views/marketing/CouponUsageList.vue'), meta: { title: '使用记录', permission: 'coupon:records' } },
          { path: 'sign', name: 'SignConfig', component: () => import('@/views/marketing/SignConfig.vue'), meta: { title: '签到配置', permission: 'coupon:view' } },
          { path: 'badges', name: 'BadgeList', component: () => import('@/views/marketing/BadgeList.vue'), meta: { title: '徽章头衔', permission: 'coupon:view' } },
          { path: 'notifications', name: 'NotificationList', component: () => import('@/views/marketing/NotificationList.vue'), meta: { title: '系统通知', permission: 'coupon:view' } },
        ],
      },

      // ===== 分享有礼 =====
      {
        path: 'share',
        name: 'Share',
        redirect: '/share/activity',
        meta: { title: '分享有礼', icon: 'ShareAltOutlined', permission: 'share:view' },
        children: [
          { path: 'activity', name: 'ShareActivityConfig', component: () => import('@/views/share/ActivityConfig.vue'), meta: { title: '分享活动设置', permission: 'share:config' } },
          { path: 'invites', name: 'ShareInviteList', component: () => import('@/views/share/InviteList.vue'), meta: { title: '邀请记录', permission: 'share:view' } },
          { path: 'rewards', name: 'ShareRewardList', component: () => import('@/views/share/RewardList.vue'), meta: { title: '奖励记录', permission: 'share:reward' } },
        ],
      },

      // ===== 城市代理 =====
      {
        path: 'city-agent',
        name: 'CityAgent',
        redirect: '/city-agent/applications',
        meta: { title: '城市代理', icon: 'EnvironmentOutlined', permission: 'city:view' },
        children: [
          { path: 'applications', name: 'CityAgentApplicationList', component: () => import('@/views/cityAgent/ApplicationList.vue'), meta: { title: '代理申请', permission: 'city:view' } },
          { path: 'agents', name: 'CityAgentList', component: () => import('@/views/cityAgent/AgentList.vue'), meta: { title: '代理人管理', permission: 'city:view' } },
          { path: 'settlements', name: 'CityAgentSettlementList', component: () => import('@/views/cityAgent/SettlementList.vue'), meta: { title: '结算管理', permission: 'city:settlement' } },
        ],
      },

      // ===== 消息中心 =====
      {
        path: 'message',
        name: 'Message',
        redirect: '/message/conversations',
        meta: { title: '消息中心', icon: 'MessageOutlined', permission: 'message:view' },
        children: [
          { path: 'conversations', name: 'ConversationList', component: () => import('@/views/message/ConversationList.vue'), meta: { title: '会话列表', permission: 'message:view' } },
          { path: 'violations', name: 'ViolationList', component: () => import('@/views/message/ViolationList.vue'), meta: { title: '违规消息', permission: 'message:view' } },
        ],
      },

      // ===== 系统设置 =====
      {
        path: 'system',
        name: 'System',
        redirect: '/system/admins',
        meta: { title: '系统设置', icon: 'SettingOutlined', permission: 'admin:view' },
        children: [
          { path: 'admins', name: 'AdminList', component: () => import('@/views/system/AdminList.vue'), meta: { title: '管理员', permission: 'admin:view' } },
          { path: 'roles', name: 'RoleList', component: () => import('@/views/system/RoleList.vue'), meta: { title: '角色管理', permission: 'admin:view' } },
          { path: 'menus', name: 'MenuList', component: () => import('@/views/system/MenuList.vue'), meta: { title: '菜单权限', permission: 'admin:view' } },
          { path: 'logs', name: 'OperationLogList', component: () => import('@/views/system/OperationLogList.vue'), meta: { title: '操作日志', permission: 'admin:view' } },
          { path: 'storage', name: 'StorageConfig', component: () => import('@/views/system/StorageConfig.vue'), meta: { title: '文件存储', permission: 'system:config' } },
          { path: 'wechat-pay', name: 'WechatPayConfig', component: () => import('@/views/system/WechatPayConfigPage.vue'), meta: { title: '微信支付', permission: 'system:config' } },
          { path: 'config', name: 'SystemConfigPage', component: () => import('@/views/system/SystemConfigPage.vue'), meta: { title: '系统配置', permission: 'system:config' } },
          { path: 'website-config', name: 'WebsiteConfig', component: () => import('@/views/system/WebsiteConfig.vue'), meta: { title: '网站配置', permission: 'system:config' } },
          { path: 'email-config', name: 'EmailConfig', component: () => import('@/views/system/EmailConfig.vue'), meta: { title: '邮箱配置', permission: 'system:config' } },
          { path: 'files', name: 'FileManage', component: () => import('@/views/system/FileManage.vue'), meta: { title: '文件管理', permission: 'system:upload' } },
          { path: 'map-picker', name: 'MapPicker', component: () => import('@/views/system/MapPicker.vue'), meta: { title: '地图选点', permission: 'system:config' } },
        ],
      },

      // ===== 二手交易 =====
      {
        path: 'second-hand',
        name: 'SecondHand',
        redirect: '/second-hand/products',
        meta: { title: '二手交易', icon: 'ShoppingOutlined', permission: 'secondhand:view' },
        children: [
          { path: 'products', name: 'SecondHandProductList', component: () => import('@/views/secondHand/ProductList.vue'), meta: { title: '商品管理', permission: 'secondhand:view' } },
          { path: 'orders', name: 'SecondHandOrderList', component: () => import('@/views/secondHand/OrderList.vue'), meta: { title: '订单管理', permission: 'secondhand:view' } },
          { path: 'product/:id', name: 'SecondHandProductDetail', component: () => import('@/views/secondHand/ProductDetail.vue'), meta: { title: '商品详情', hidden: true, permission: 'secondhand:view' } },
          { path: 'settings', name: 'SecondHandRegionSettings', component: () => import('@/views/secondHand/RegionConfig.vue'), meta: { title: '区域配置', permission: 'secondhand:config' } },
        ],
      },

      // ===== 漂流瓶 =====
      {
        path: 'drift-bottle',
        name: 'DriftBottle',
        redirect: '/drift-bottle/bottles',
        meta: { title: '漂流瓶管理', icon: 'MailOutlined', permission: 'driftbottle:view' },
        children: [
          { path: 'bottles', name: 'DriftBottleList', component: () => import('@/views/driftBottle/BottleList.vue'), meta: { title: '瓶子列表', permission: 'driftbottle:view' } },
        ],
      },

      // ===== 打卡评分 =====
      {
        path: 'punch-in',
        name: 'PunchIn',
        redirect: '/punch-in/categories',
        meta: { title: '打卡管理', icon: 'EnvironmentOutlined', permission: 'punch:view' },
        children: [
          { path: 'categories', name: 'PunchInCategoryList', component: () => import('@/views/punchIn/CategoryList.vue'), meta: { title: '分类管理', permission: 'punch:view' } },
          { path: 'locations', name: 'PunchInLocationList', component: () => import('@/views/punchIn/LocationList.vue'), meta: { title: '地点管理', permission: 'punch:view' } },
          { path: 'records', name: 'PunchInRecordList', component: () => import('@/views/punchIn/RecordList.vue'), meta: { title: '打卡记录', permission: 'punch:view' } },
          { path: 'comments', name: 'PunchInCommentList', component: () => import('@/views/punchIn/CommentList.vue'), meta: { title: '评论管理', permission: 'punch:view' } },
          { path: 'stats', name: 'PunchInStats', component: () => import('@/views/punchIn/Stats.vue'), meta: { title: '数据统计', permission: 'punch:view' } },
          { path: 'config', name: 'PunchInRegionConfig', component: () => import('@/views/punchIn/RegionConfig.vue'), meta: { title: '区域配置', permission: 'punch:config' } },
        ],
      },

      // ===== 网盘资源 =====
      {
        path: 'netdisk',
        name: 'NetDisk',
        redirect: '/netdisk/categories',
        meta: { title: '网盘资源', icon: 'CloudOutlined', permission: 'netdisk:view' },
        children: [
          { path: 'categories', name: 'NetDiskCategoryList', component: () => import('@/views/netdisk/CategoryList.vue'), meta: { title: '分类管理', permission: 'netdisk:view' } },
          { path: 'platforms', name: 'NetDiskPlatformList', component: () => import('@/views/netdisk/PlatformList.vue'), meta: { title: '平台管理', permission: 'netdisk:view' } },
          { path: 'resources', name: 'NetDiskResourceList', component: () => import('@/views/netdisk/ResourceList.vue'), meta: { title: '资源管理', permission: 'netdisk:view' } },
          { path: 'reports', name: 'NetDiskReportList', component: () => import('@/views/netdisk/ReportList.vue'), meta: { title: '举报管理', permission: 'netdisk:view' } },
          { path: 'comments', name: 'NetDiskCommentList', component: () => import('@/views/netdisk/CommentList.vue'), meta: { title: '评论管理', permission: 'netdisk:view' } },
          { path: 'downloads', name: 'NetDiskDownloadList', component: () => import('@/views/netdisk/DownloadList.vue'), meta: { title: '下载记录', permission: 'netdisk:view' } },
          { path: 'profit-config', name: 'NetDiskProfitConfig', component: () => import('@/views/netdisk/ProfitConfig.vue'), meta: { title: '收益配置', permission: 'netdisk:config' } },
        ],
      },

      // ===== 对象匹配 =====
      {
        path: 'dating',
        name: 'Dating',
        redirect: '/dating/profiles',
        meta: { title: '对象匹配', icon: 'HeartOutlined', permission: 'dating:view' },
        children: [
          { path: 'profiles', name: 'DatingProfileList', component: () => import('@/views/dating/ProfileList.vue'), meta: { title: '资料管理', permission: 'dating:view' } },
          { path: 'matches', name: 'DatingMatchList', component: () => import('@/views/dating/MatchList.vue'), meta: { title: '匹配记录', permission: 'dating:view' } },
          { path: 'packages', name: 'DatingPackageList', component: () => import('@/views/dating/PackageList.vue'), meta: { title: '套餐管理', permission: 'dating:view' } },
          { path: 'orders', name: 'DatingOrderList', component: () => import('@/views/dating/OrderList.vue'), meta: { title: '订单管理', permission: 'dating:view' } },
          { path: 'reports', name: 'DatingReportList', component: () => import('@/views/dating/ReportList.vue'), meta: { title: '举报管理', permission: 'dating:audit' } },
          { path: 'config', name: 'DatingConfigList', component: () => import('@/views/dating/ConfigList.vue'), meta: { title: '配置管理', permission: 'dating:config' } },
          { path: 'cache', name: 'DatingCacheManager', component: () => import('@/views/dating/CacheManager.vue'), meta: { title: '缓存管理', permission: 'dating:config' } },
        ],
      },

      // ===== 充值管理 =====
      {
        path: 'topup',
        name: 'Topup',
        redirect: '/topup/packages',
        meta: { title: '充值管理', icon: 'DollarOutlined', permission: 'topup:view' },
        children: [
          { path: 'packages', name: 'TopupPackageList', component: () => import('@/views/topup/PackageList.vue'), meta: { title: '套餐配置', permission: 'topup:view' } },
          { path: 'orders', name: 'TopupOrderList', component: () => import('@/views/topup/OrderList.vue'), meta: { title: '充值订单', permission: 'topup:view' } },
        ],
      },

      // ===== 社团管理 =====
      {
        path: 'club',
        name: 'Club',
        redirect: '/club/list',
        meta: { title: '社团管理', icon: 'TeamOutlined', permission: 'club:view' },
        children: [
          { path: 'list', name: 'ClubList', component: () => import('@/views/club/ClubList.vue'), meta: { title: '社团列表', permission: 'club:view' } },
        ],
      },

      // ===== 评论抽奖 =====
      {
        path: 'lottery',
        name: 'Lottery',
        redirect: '/lottery/list',
        meta: { title: '评论抽奖', icon: 'GiftOutlined', permission: 'lottery:view' },
        children: [
          { path: 'list', name: 'LotteryList', component: () => import('@/views/lottery/LotteryList.vue'), meta: { title: '抽奖列表', permission: 'lottery:view' } },
          { path: 'winners/:id', name: 'LotteryWinnerList', component: () => import('@/views/lottery/WinnerList.vue'), meta: { title: '中奖记录', hidden: true, permission: 'lottery:view' } },
        ],
      },

      // ===== 商家点评 =====
      {
        path: 'dianping',
        name: 'Dianping',
        redirect: '/dianping/reviews',
        meta: { title: '商家点评', icon: 'CommentOutlined', permission: 'review:manage' },
        children: [
          { path: 'reviews', name: 'DianpingReviewList', component: () => import('@/views/dianping/ReviewList.vue'), meta: { title: '点评列表', permission: 'review:manage' } },
        ],
      },

      // ===== 排行榜 =====
      {
        path: 'ranking',
        name: 'Ranking',
        redirect: '/ranking/list',
        meta: { title: '排行榜', icon: 'TrophyOutlined', permission: 'ranking:view' },
        children: [
          { path: 'list', name: 'RankingList', component: () => import('@/views/ranking/RankingList.vue'), meta: { title: '榜单管理', permission: 'ranking:view' } },
        ],
      },

      // ===== 用户引导页 =====
      {
        path: 'user-guidance',
        name: 'UserGuidance',
        redirect: '/user-guidance/pages',
        meta: { title: '用户引导', icon: 'ReadOutlined', permission: 'userguidance:view' },
        children: [
          { path: 'pages', name: 'UserGuidancePageList', component: () => import('@/views/userGuidance/PageList.vue'), meta: { title: '引导页管理', permission: 'userguidance:view' } },
        ],
      },

      // ===== 通讯录 =====
      {
        path: 'contacts',
        name: 'Contacts',
        redirect: '/contacts/categories',
        meta: { title: '通讯录', icon: 'PhoneOutlined', permission: 'contacts:view' },
        children: [
          { path: 'categories', name: 'ContactCategoryList', component: () => import('@/views/contacts/CategoryList.vue'), meta: { title: '分类管理', permission: 'contacts:view' } },
          { path: 'list', name: 'ContactList', component: () => import('@/views/contacts/ContactList.vue'), meta: { title: '联系人管理', permission: 'contacts:view' } },
        ],
      },

      // ===== 微信文章 =====
      {
        path: 'wechat-article',
        name: 'WechatArticle',
        redirect: '/wechat-article/list',
        meta: { title: '微信文章', icon: 'FileTextOutlined', permission: 'wechatarticle:view' },
        children: [
          { path: 'list', name: 'WechatArticleList', component: () => import('@/views/wechatArticle/ArticleList.vue'), meta: { title: '文章管理', permission: 'wechatarticle:view' } },
          { path: 'images', name: 'WechatArticleImage', component: () => import('@/views/system/WechatArticleImage.vue'), meta: { title: '文章图片提取', permission: 'system:config' } },
        ],
      },

      // ===== 打印机 =====
      {
        path: 'printer',
        name: 'Printer',
        redirect: '/printer/list',
        meta: { title: '打印机', icon: 'PrinterOutlined', permission: 'printer:view' },
        children: [
          { path: 'list', name: 'PrinterList', component: () => import('@/views/printer/PrinterList.vue'), meta: { title: '打印机管理', permission: 'printer:view' } },
        ],
      },

      // ===== 头衔管理 =====
      {
        path: 'user-title',
        name: 'UserTitle',
        redirect: '/user-title/list',
        meta: { title: '头衔管理', icon: 'CrownOutlined', permission: 'usertitle:view' },
        children: [
          { path: 'list', name: 'UserTitleList', component: () => import('@/views/userTitle/TitleList.vue'), meta: { title: '头衔列表', permission: 'usertitle:view' } },
          { path: 'redeem-codes/:id', name: 'RedeemCodeList', component: () => import('@/views/userTitle/RedeemCodeList.vue'), meta: { title: '兑换码', hidden: true, permission: 'usertitle:view' } },
        ],
      },

      // ===== 贴纸管理 =====
      {
        path: 'sticker',
        name: 'Sticker',
        redirect: '/sticker/categories',
        meta: { title: '贴纸管理', icon: 'SmileOutlined', permission: 'sticker:view' },
        children: [
          { path: 'categories', name: 'StickerCategoryList', component: () => import('@/views/sticker/CategoryList.vue'), meta: { title: '分类管理', permission: 'sticker:view' } },
          { path: 'list', name: 'StickerList', component: () => import('@/views/sticker/StickerList.vue'), meta: { title: '贴纸审核', permission: 'sticker:view' } },
        ],
      },

      // ===== 运维中心（仅超级管理员） =====
      {
        path: 'ops',
        name: 'Ops',
        redirect: '/ops/overview',
        meta: { title: '运维中心', icon: 'ToolOutlined', permission: 'ops:view', superOnly: true },
        children: [
          { path: 'overview', name: 'OpsOverview', component: () => import('@/views/ops/Overview.vue'), meta: { title: '服务器概览', permission: 'ops:view', superOnly: true } },
          { path: 'logs', name: 'OpsLogs', component: () => import('@/views/ops/Logs.vue'), meta: { title: '日志中心', permission: 'ops:view', superOnly: true } },
          { path: 'actions', name: 'OpsActions', component: () => import('@/views/ops/Actions.vue'), meta: { title: '操作记录', permission: 'ops:view', superOnly: true } },
        ],
      },
    ],
  },
  // 404
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/error/404.vue'),
    meta: { title: '页面不存在', hidden: true },
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes: [...staticRoutes, ...asyncRoutes],
})

const whiteList = ['/login', '/403', '/setup']

router.beforeEach(async (to, _from, next) => {
  document.title = `${to.meta.title || '灵萌后台'} - 灵萌运营管理后台`

  const userStore = useUserStore()

  if (!userStore.token) {
    userStore.restoreState()
  }

  if (whiteList.some((p) => to.path === p || to.path.startsWith(p))) {
    if (to.path === '/login' && userStore.isLoggedIn) {
      return next('/dashboard')
    }
    return next()
  }

  if (!userStore.isLoggedIn) {
    return next(`/login?redirect=${to.path}`)
  }

  const requiredPermission = to.meta.permission as string | undefined
  if (requiredPermission && !userStore.hasPermission(requiredPermission)) {
    return next('/403')
  }

  if (to.meta.superOnly && !userStore.isSuperAdmin) {
    return next('/403')
  }

  next()
})

export default router
