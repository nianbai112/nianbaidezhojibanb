/**
 * 后台菜单信息架构（2026-08-19 精简重构）
 * - 7 个分组（原 11）：外卖/商城/跑腿合并为交易中心，营销/数据/系统合并为运营与系统
 * - 删除各模块内的冗余"工作台/概览"项，删除授权/下载项和 AI 运营，保留运营文件中心
 * - group.icon：分组图标，用于折叠态 rail 与扫读识别
 * - item.section：组内二级小标（不可点），标在每段第一项上
 * - item.badge：队列徽章键，由 layout/useNavBadges.ts 聚合计数
 */
export const menuGroups = [
  {
    title: '工作台',
    icon: 'Monitor',
    children: [
      { path: '/dashboard', title: '数据总览', icon: 'Odometer' },
      { path: '/dashboard/todos', title: '今日待办', icon: 'Calendar' },
      { path: '/dashboard/alerts', title: '异常中心', icon: 'WarningFilled', badge: 'alerts' },
      { path: '/order/center', title: '统一订单检索', icon: 'Tickets' },
      { path: '/order/appeals', title: '订单申诉', icon: 'ChatLineSquare', badge: 'appeals' },
    ]
  },
  {
    title: '区域中心',
    icon: 'MapLocation',
    children: [
      { path: '/region/list', title: '区域列表', icon: 'Location' },
      { path: '/region/config', title: '区域配置', icon: 'Setting' },
      { path: '/dashboard/region-ops', title: '区域运营', icon: 'TrendCharts' },
      { path: '/region/app-pages', title: 'UI 编辑器', icon: 'MagicStick', section: '页面装修' },
      { path: '/region/admins', title: '区域管理员', icon: 'UserFilled', section: '人员与合作' },
      { path: '/region/city-agent', title: '区域合作', icon: 'Connection' },
    ]
  },
  {
    title: '用户中心',
    icon: 'User',
    children: [
      { path: '/user/list', title: '用户列表', icon: 'User' },
      { path: '/user/verification', title: '学生认证', icon: 'Checked', badge: 'certs' },
      { path: '/membership/overview', title: '会员运营', icon: 'Crown' },
      { path: '/user/loyalty', title: '成长中心', icon: 'Trophy' },
      { path: '/user/guidance', title: '用户引导', icon: 'Guide' },
      { path: '/user/schools', title: '学校库管理', icon: 'School' },
      { path: '/user/private-messages', title: '私信审核', icon: 'ChatDotRound' },
      { path: '/user/blacklist', title: '黑名单处罚', icon: 'Lock' },
    ]
  },
  {
    title: '内容中心',
    icon: 'Document',
    children: [
      { path: '/content/posts', title: '帖子管理', icon: 'Document' },
      { path: '/content/discussions', title: '评论管理', icon: 'ChatDotSquare' },
      { path: '/content/circles', title: '圈子运营', icon: 'Connection' },
      { path: '/content/audit', title: '审核举报', icon: 'Checked', badge: 'audit', section: '审核与置顶' },
      { path: '/content/paid-pinning', title: '付费置顶', icon: 'Top' },
      { path: '/content/assets', title: '内容素材', icon: 'Picture', section: '素材与配置' },
      { path: '/content/settings', title: '内容配置', icon: 'Setting' },
    ]
  },
  {
    // 外卖/商城/跑腿三个业务模块合并，用 section 分隔
    title: '交易中心',
    icon: 'Goods',
    children: [
      { path: '/merchant/list', title: '商家管理', icon: 'Shop', section: '外卖' },
      { path: '/merchant/audit', title: '商家审核', icon: 'Checked', badge: 'merchantAudit' },
      { path: '/merchant/categories', title: '商品分类', icon: 'Collection' },
      { path: '/merchant/products', title: '商品管理', icon: 'Goods' },
      { path: '/merchant/orders', title: '订单履约', icon: 'Tickets' },
      { path: '/merchant/refunds', title: '售后处理', icon: 'Money' },
      { path: '/merchant/reviews', title: '评价管理', icon: 'Star' },
      { path: '/merchant/dorm-center', title: '宿舍小店', icon: 'House' },
      { path: '/merchant/config', title: '外卖配置', icon: 'Setting' },
      { path: '/mall/merchants', title: '商城商户', icon: 'Shop', section: '商城' },
      { path: '/mall/products', title: '商城商品', icon: 'ShoppingCart' },
      { path: '/mall/categories', title: '商品分类', icon: 'CollectionTag' },
      { path: '/mall/orders', title: '商城订单', icon: 'Tickets' },
      { path: '/mall/refunds', title: '商城售后', icon: 'Money' },
      { path: '/mall/reviews', title: '商城评价', icon: 'Star' },
      { path: '/mall/promo', title: '促销分销', icon: 'Flag' },
      { path: '/mall/settings', title: '商城设置', icon: 'Setting' },
      { path: '/errand/orders', title: '跑腿订单', icon: 'List', section: '跑腿' },
      { path: '/errand/dispatch', title: '调度中心', icon: 'Position' },
      { path: '/errand/riders', title: '骑手管理', icon: 'User' },
      { path: '/errand/pickup-points', title: '取件点管理', icon: 'Location' },
      { path: '/errand/abnormal', title: '异常订单', icon: 'Warning', badge: 'errandAbnormal' },
      { path: '/errand/setup', title: '跑腿设置', icon: 'Tools' },
    ]
  },
  {
    title: '财务中心',
    icon: 'Wallet',
    children: [
      { path: '/finance/overview', title: '财务总览', icon: 'DataLine' },
      { path: '/finance/merchant-settle', title: '商家结算', icon: 'Shop' },
      { path: '/finance/rider-settle', title: '骑手结算', icon: 'Van' },
      { path: '/finance/settle', title: '结算中心', icon: 'Scale' },
    ]
  },
  {
    // 营销增长 + 数据分析 + 系统运维合并，均为低频操作区
    title: '运营与系统',
    icon: 'Operation',
    children: [
      { path: '/marketing/center', title: '活动中心', icon: 'Promotion', section: '营销增长' },
      { path: '/marketing/perks', title: '优惠激励', icon: 'Ticket' },
      { path: '/marketing/official-assistant', title: '校园内容', icon: 'Document' },
      { path: '/marketing/notifications', title: '通知投递', icon: 'Bell' },
      { path: '/marketing/wechat-notify', title: '服务号通知', icon: 'ChatDotRound' },
      { path: '/marketing/popups', title: '首页权益卡片', icon: 'Monitor' },
      { path: '/growth/ranking', title: '榜单推荐', icon: 'Trophy' },
      { path: '/insights/business', title: '业务分析', icon: 'DataLine', section: '数据分析' },
      { path: '/analytics/riders', title: '骑手分析', icon: 'Van' },
      { path: '/insights/tracking', title: '埋点分析', icon: 'Aim' },
      { path: '/system/admins', title: '管理员', icon: 'User', section: '系统运维' },
      { path: '/system/roles', title: '角色权限', icon: 'Lock' },
      { path: '/system/files', title: '文件中心', icon: 'FolderOpened' },
      { path: '/system/settings', title: '系统配置', icon: 'Tools' },
      { path: '/system/rider-app-control', title: '骑手 App 控制中心', icon: 'Iphone' },
      { path: '/system/launch-check', title: '上线检查', icon: 'Finished' },
      { path: '/system/mini-program-paths', title: '小程序路径', icon: 'Link' },
      { path: '/system/realtime-sessions', title: '客服工作台', icon: 'Service' },
      { path: '/system/publishing', title: '官网与内容', icon: 'Monitor' },
      { path: '/system/observability', title: '监控与日志', icon: 'View' },
    ]
  },
]
