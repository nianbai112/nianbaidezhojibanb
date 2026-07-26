export const menuGroups = [
  {
    title: '运营工作台',
    children: [
      { path: '/dashboard', title: '数据总览', icon: 'DataLine' },
      { path: '/dashboard/todos', title: '今日待办', icon: 'Calendar' },
      { path: '/dashboard/region-ops', title: '区域运营', icon: 'TrendCharts' },
      { path: '/dashboard/alerts', title: '异常中心', icon: 'Warning' },
      { path: '/dashboard/shortcuts', title: '快捷操作', icon: 'Operation' }
    ]
  },
  {
    title: '区域中心',
    children: [
      { path: '/region/list', title: '区域列表', icon: 'Location' },
      { path: '/region/config', title: '区域配置', icon: 'Setting' },
      { path: '/region/page-decoration', title: '页面装修', icon: 'Home' },
      { path: '/region/tabbar', title: 'Tabbar 配置', icon: 'Menu' },
      { path: '/region/share-settings', title: '分享配置', icon: 'Share' },
      { path: '/region/admins', title: '区域管理员', icon: 'User' }
    ]
  },
  {
    title: '用户中心',
    children: [
      { path: '/user/list', title: '用户列表', icon: 'User' },
      { path: '/user/verification', title: '学生认证', icon: 'Checked' },
      { path: '/user/schools', title: '学校库管理', icon: 'School' },
      { path: '/user/tags', title: '用户标签', icon: 'PriceTag' },
      { path: '/user/badges', title: '徽章称号', icon: 'Medal' },
      { path: '/user/blacklist', title: '黑名单/处罚', icon: 'Lock' }
    ]
  },
  {
    title: '内容中心',
    children: [
      { path: '/content/posts', title: '帖子管理', icon: 'Document' },
      { path: '/content/comments', title: '评论管理', icon: 'ChatDotRound' },
      { path: '/content/circles', title: '圈子话题', icon: 'Connection' },
      { path: '/content/audit', title: '审核举报', icon: 'Warning' },
      { path: '/content/sensitive', title: '敏感词库', icon: 'Filter' },
      { path: '/content/settings', title: '内容配置', icon: 'Setting' }
    ]
  },
  {
    title: '商家中心',
    children: [
      { path: '/merchant/list', title: '商家列表', icon: 'Shop' },
      { path: '/merchant/audit', title: '商家审核', icon: 'Checked' },
      { path: '/merchant/products', title: '商品管理', icon: 'Goods' },
      { path: '/merchant/categories', title: '商品分类', icon: 'Menu' },
      { path: '/merchant/orders', title: '外卖订单', icon: 'Tickets' },
      { path: '/merchant/refunds', title: '退款售后', icon: 'Money' },
      { path: '/merchant/reviews', title: '商家评价', icon: 'Star' },
      { path: '/merchant/settlements', title: '商家结算', icon: 'Wallet' },
      { path: '/merchant/printers', title: '打印机配置', icon: 'Printer' },
      { path: '/merchant/price-adjustments', title: '加价规则', icon: 'PriceTag' },
      { path: '/merchant/product-collection', title: '商品采集', icon: 'Collection' },
      { path: '/merchant/region-settings', title: '商家设置', icon: 'Setting' }
    ]
  },
  {
    title: '商城中心',
    children: [
      { path: '/mall/overview', title: '商城概览', icon: 'DataLine' },
      { path: '/mall/categories', title: '商品分类', icon: 'Menu' },
      { path: '/mall/merchants', title: '商城商户', icon: 'Shop' },
      { path: '/mall/products', title: '商城商品', icon: 'ShoppingCart' },
      { path: '/mall/orders', title: '商城订单', icon: 'Document' },
      { path: '/mall/refunds', title: '商城售后', icon: 'Money' },
      { path: '/mall/reviews', title: '商城评价', icon: 'Star' },
      { path: '/mall/freight', title: '运费模板', icon: 'Van' },
      { path: '/mall/distributors', title: '分销管理', icon: 'Share' },
      { path: '/mall/promotions', title: '促销活动', icon: 'Flag' },
      { path: '/mall/service-staff', title: '客服管理', icon: 'Service' }
    ]
  },
  {
    title: '跑腿管理',
    children: [
      { path: '/errand/dashboard', title: '跑腿工作台', icon: 'Van' },
      { path: '/errand/orders', title: '跑腿订单', icon: 'Tickets' },
      { path: '/errand/pickup-points', title: '取件点管理', icon: 'Location' },
      { path: '/errand/item-sizes', title: '物品大小', icon: 'Box' },
      { path: '/errand/riders', title: '骑手管理', icon: 'User' },
      { path: '/errand/dispatch', title: '调度中心', icon: 'Position' },
      { path: '/errand/config', title: '跑腿配置', icon: 'Tools' },
      { path: '/errand/abnormal', title: '异常订单', icon: 'Warning' }
    ]
  },
  {
    title: '订单履约中心',
    children: [
      { path: '/order/center', title: '统一订单', icon: 'List' }
    ]
  },
  {
    title: '财务中心',
    children: [
      { path: '/finance/overview', title: '财务总览', icon: 'DataLine' },
      { path: '/finance/payments', title: '支付订单', icon: 'Tickets' },
      { path: '/finance/refunds', title: '退款订单', icon: 'Money' },
      { path: '/finance/withdrawals', title: '提现审核', icon: 'Wallet' },
      { path: '/finance/wallet-logs', title: '用户流水', icon: 'Document' },
      { path: '/finance/merchant-settle', title: '商家结算', icon: 'Shop' },
      { path: '/finance/rider-settle', title: '骑手结算', icon: 'Van' },
      { path: '/finance/reconciliation', title: '对账中心', icon: 'Checked' }
    ]
  },
  {
    title: '营销增长中心',
    children: [
      { path: '/marketing/overview', title: '营销概览', icon: 'DataLine' },
      { path: '/marketing/coupons', title: '优惠券', icon: 'Ticket' },
      { path: '/marketing/activities', title: '活动管理', icon: 'Flag' },
      { path: '/marketing/group-buys', title: '团购管理', icon: 'ShoppingCart' },
      { path: '/marketing/sign', title: '签到任务', icon: 'Calendar' },
      { path: '/marketing/share', title: '分享有礼', icon: 'Share' },
      { path: '/marketing/popups', title: '弹窗广告', icon: 'Monitor' },
      { path: '/growth/ranking', title: '榜单推荐', icon: 'Trophy' },
      { path: '/marketing/notifications', title: '系统通知群发', icon: 'Bell' }
    ]
  },
  {
    title: '扩展玩法中心',
    children: [
      { path: '/features/dating', title: '对象匹配', icon: 'Heart' },
      { path: '/features/drift-bottle', title: '漂流瓶', icon: 'Present' },
      { path: '/features/netdisk', title: '网盘资源', icon: 'FolderOpened' },
      { path: '/features/checkin-map', title: '打卡地图', icon: 'MapLocation' },
      { path: '/features/rating', title: '评分系统', icon: 'Star' },
      { path: '/features/second-hand', title: '二手交易', icon: 'Goods' },
      { path: '/features/photo-vote', title: '爆照评选', icon: 'Picture' },
      { path: '/features/clubs', title: '社团俱乐部', icon: 'Flag' }
    ]
  },
  {
    title: '数据分析中心',
    children: [
      { path: '/analytics/overview', title: '数据概览', icon: 'DataLine' },
      { path: '/analytics/users', title: '用户分析', icon: 'User' },
      { path: '/analytics/content', title: '内容分析', icon: 'Document' },
      { path: '/analytics/orders', title: '订单分析', icon: 'Tickets' },
      { path: '/tracking/events', title: '埋点事件', icon: 'Aim' },
      { path: '/tracking/funnel', title: '漏斗分析', icon: 'Filter' },
      { path: '/tracking/keywords', title: '搜索关键词', icon: 'Search' }
    ]
  },
  {
    title: '推荐实验中心',
    children: [
      { path: '/recommend/dashboard', title: '推荐中心', icon: 'DataLine' },
      { path: '/recommend/strategy', title: '推荐策略', icon: 'Setting' },
      { path: '/recommend/pool', title: '推荐池', icon: 'Box' },
      { path: '/ab-tests', title: 'A/B 测试', icon: 'Operation' }
    ]
  },
  {
    title: 'AI 运营中心',
    children: [
      { path: '/ai/dashboard', title: 'AI运营中心', icon: 'Cpu' },
      { path: '/ai/bots', title: '机器人管理', icon: 'Connection' },
      { path: '/ai/personas', title: '人设管理', icon: 'UserFilled' },
      { path: '/ai/tasks', title: 'AI任务', icon: 'List' },
      { path: '/ai/logs', title: 'AI日志', icon: 'Document' },
      { path: '/ai/config', title: 'AI配置', icon: 'Tools' },
      { path: '/growth/ai-ops-config', title: 'AI运营配置', icon: 'Cpu' }
    ]
  },
  {
    title: '系统运维中心',
    children: [
      { path: '/system/admins', title: '管理员', icon: 'User' },
      { path: '/system/roles', title: '角色权限', icon: 'Lock' },
      { path: '/system/files', title: '文件中心', icon: 'FolderOpened' },
      { path: '/system/settings', title: '系统配置', icon: 'Tools' },
      { path: '/system/mini-program-paths', title: '小程序路径', icon: 'DocumentCopy' },
      { path: '/system/notification-center', title: '通知中心配置', icon: 'Bell' },
      { path: '/system/wechat-logs', title: '微信发送日志', icon: 'Message' },
      { path: '/system/realtime-sessions', title: '在线连接', icon: 'Connection' },
      { path: '/system/operation-logs', title: '操作日志', icon: 'Document' },
      { path: '/system/login-logs', title: '登录日志', icon: 'Key' },
      { path: '/system/monitor', title: '服务监控', icon: 'Monitor' },
      { path: '/system/launch-check', title: '上线检查', icon: 'Finished' },
      { path: '/ops/jobs', title: '定时任务', icon: 'Timer' }
    ]
  }
]
