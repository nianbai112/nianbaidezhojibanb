export interface MenuItem {
  path: string
  title: string
  icon?: string
  /** 组内二级小标：标在每段第一项上，渲染为该段开头的不可点标签 */
  section?: string
  /** 队列徽章键，由 layout/useNavBadges.ts 聚合计数 */
  badge?: string
}

export interface MenuGroup {
  title: string
  /** 分组图标（折叠态 rail / 组头显示） */
  icon?: string
  children: MenuItem[]
}

export interface AccessContext {
  role?: string
  permissions?: string[]
  menus?: Array<{ path?: string }>
}

const PATH_PERMISSION_RULES: Array<{ prefix: string; any: string[] }> = [
  { prefix: '/dashboard', any: ['dashboard:view'] },
  { prefix: '/region/city-agent', any: ['city:view', 'region:view'] },
  { prefix: '/region', any: ['region:view'] },

  { prefix: '/user/verification', any: ['user:cert'] },
  { prefix: '/user/private-messages', any: ['message:view'] },
  { prefix: '/user/blacklist', any: ['user:ban', 'user:edit'] },
  { prefix: '/membership', any: ['membership:list', 'membership:plan:list', 'membership:order:list', 'membership:user:list'] },
  { prefix: '/user', any: ['user:view'] },

  { prefix: '/content/comments', any: ['comment:view', 'comment:audit'] },
  { prefix: '/content/comment-lotteries', any: ['lottery:list', 'lottery:detail', 'lottery:record:list'] },
  { prefix: '/content/audit', any: ['audit:view', 'report:handle', 'post:audit', 'comment:audit'] },
  { prefix: '/content/sensitive', any: ['content:view', 'system:config'] },
  { prefix: '/content/settings', any: ['content:view', 'system:config'] },
  { prefix: '/content/paid-pinning', any: ['post:view', 'post:top'] },
  { prefix: '/content', any: ['content:view', 'post:view'] },

  { prefix: '/merchant/workbench', any: ['merchant:view', 'merchant:audit', 'product:view', 'order:view', 'order:refund', 'review:manage', 'finance:view'] },
  { prefix: '/merchant/audit', any: ['merchant:audit'] },
  { prefix: '/merchant/products', any: ['product:view'] },
  { prefix: '/merchant/dorm-products', any: ['product:view'] },
  { prefix: '/merchant/categories', any: ['product:view', 'product:edit'] },
  { prefix: '/merchant/dorm-categories', any: ['product:view', 'product:edit'] },
  { prefix: '/merchant/orders', any: ['order:view'] },
  { prefix: '/merchant/dorm-orders', any: ['order:view'] },
  { prefix: '/merchant/refunds', any: ['order:refund', 'finance:view'] },
  { prefix: '/merchant/reviews', any: ['review:manage'] },
  { prefix: '/merchant/settlements', any: ['finance:view'] },
  { prefix: '/merchant/printers', any: ['printer:list'] },
  { prefix: '/merchant/price-adjustments', any: ['system:config'] },
  { prefix: '/merchant/product-collection', any: ['product:view'] },
  { prefix: '/merchant/region-settings', any: ['system:config'] },
  { prefix: '/merchant/dorm-shop-audit', any: ['merchant:audit'] },
  { prefix: '/merchant', any: ['merchant:view'] },

  { prefix: '/mall/orders', any: ['order:view', 'mall:view'] },
  { prefix: '/mall/refunds', any: ['order:refund', 'mall:view'] },
  { prefix: '/mall/reviews', any: ['review:manage', 'mall:view'] },
  { prefix: '/mall', any: ['mall:view', 'product:view'] },

  { prefix: '/errand/riders', any: ['rider:view'] },
  { prefix: '/errand/item-sizes', any: ['errand:item-size:view', 'errand:view'] },
  { prefix: '/errand/pickup-points', any: ['errand:pickup-point:view', 'errand:view'] },
  { prefix: '/errand/config', any: ['errand:config:view', 'errand:view'] },
  { prefix: '/errand', any: ['errand:view', 'delivery:view'] },
  { prefix: '/order', any: ['order:view'] },
  { prefix: '/finance/withdrawals', any: ['withdraw:view', 'withdraw:audit', 'finance:view'] },
  { prefix: '/finance', any: ['finance:view'] },

  { prefix: '/marketing/coupons', any: ['coupon:view', 'marketing:view'] },
  { prefix: '/marketing/group-buys', any: ['groupbuy:view', 'marketing:view'] },
  { prefix: '/marketing/share', any: ['share:view', 'marketing:view'] },
  { prefix: '/marketing/notifications', any: ['notification:view', 'notification:send', 'marketing:view'] },
  { prefix: '/marketing', any: ['marketing:view', 'activity:view'] },
  { prefix: '/growth/ranking', any: ['ranking:list', 'marketing:view'] },

  { prefix: '/features/dating', any: ['dating:view'] },
  { prefix: '/features/netdisk', any: ['netdisk:view'] },
  { prefix: '/features/checkin-map', any: ['punch:view', 'punchIn:list'] },
  { prefix: '/features/rating', any: ['rating:view'] },
  { prefix: '/features/second-hand', any: ['secondhand:view'] },
  { prefix: '/features/photo-vote', any: ['photoContest:view'] },
  { prefix: '/features/clubs', any: ['club:list'] },

  { prefix: '/analytics', any: ['analytics:view'] },
  { prefix: '/tracking', any: ['analytics:view'] },
  { prefix: '/recommend', any: ['recommend:view'] },
  { prefix: '/ab-tests', any: ['abtest:view'] },
  { prefix: '/ai', any: ['ai:view'] },
  { prefix: '/layout', any: ['layout:view', 'system:config'] },

  { prefix: '/system/admins', any: ['admin:view'] },
  { prefix: '/system/roles', any: ['admin:view'] },
  { prefix: '/system/files', any: ['system:upload', 'system:config'] },
  { prefix: '/system/website', any: ['system:config', 'config:view'] },
  { prefix: '/system/operation-logs', any: ['admin:view', 'system:config'] },
  { prefix: '/system/login-logs', any: ['admin:view', 'system:config'] },
  { prefix: '/system/realtime-sessions', any: ['message:view'] },
  { prefix: '/system/notification-center', any: ['notification:view', 'system:config'] },
  { prefix: '/system/rider-app-control', any: ['rider-app:config'] },
  { prefix: '/system', any: ['system:config', 'config:view'] },
  { prefix: '/ops/jobs', any: ['ops:view', 'system:config'] },

  // 数据与智能 tab 化入口（P3）：沿用原各域权限
  { prefix: '/insights/business', any: ['analytics:view'] },
  { prefix: '/insights/tracking', any: ['analytics:view'] },
  { prefix: '/insights/recommend', any: ['recommend:view', 'abtest:view'] },
  { prefix: '/insights/ai', any: ['ai:view'] },

  // 其余 tab 化入口（P3 剩余批）：权限取各子页并集
  { prefix: '/merchant/dorm-center', any: ['merchant:view', 'merchant:audit', 'product:view', 'order:view'] },
  { prefix: '/merchant/config', any: ['system:config', 'product:view', 'printer:list'] },
  { prefix: '/mall/promo', any: ['mall:view', 'marketing:view'] },
  { prefix: '/mall/settings', any: ['mall:view', 'product:view'] },
  { prefix: '/errand/setup', any: ['errand:config:view', 'errand:item-size:view', 'errand:view'] },
  { prefix: '/finance/settle', any: ['finance:view'] },
  { prefix: '/finance/ledger', any: ['finance:view'] },
  { prefix: '/marketing/center', any: ['marketing:view', 'activity:view', 'groupbuy:view'] },
  { prefix: '/marketing/perks', any: ['coupon:view', 'share:view', 'marketing:view'] },
  { prefix: '/marketing/messages', any: ['notification:view', 'marketing:view'] },
  { prefix: '/content/discussions', any: ['comment:view', 'comment:audit', 'lottery:list'] },
  { prefix: '/content/assets', any: ['content:view', 'post:audit', 'system:config'] },
  { prefix: '/user/loyalty', any: ['user:view'] },
  { prefix: '/system/publishing', any: ['system:config', 'config:view', 'notification:view'] },
  { prefix: '/system/observability', any: ['system:config', 'admin:view', 'ops:view', 'message:view'] },
  { prefix: '/region/app-pages', any: ['layout:view', 'system:config'] }
]

const LEGACY_MENU_ALIASES: Record<string, string[]> = {
  '/user/list': ['/users/list'],
  '/user/verification': ['/users/certifications'],
  '/user/tags': ['/users/tags'],
  '/content/audit': ['/content/reports'],
  '/merchant/list': ['/shop/merchants'],
  '/merchant/audit': ['/shop/applications'],
  '/merchant/products': ['/shop/products'],
  '/merchant/printers': ['/shop/printers'],
  '/merchant/price-adjustments': ['/shop/price-adjustments'],
  '/merchant/product-collection': ['/shop/product-collection'],
  '/merchant/reviews': ['/shop/reviews'],
  '/merchant/region-settings': ['/shop/merchant-config'],
  '/errand/orders': ['/delivery/orders'],
  '/errand/riders': ['/delivery/riders'],
  '/errand/item-sizes': ['/delivery/item-sizes'],
  '/errand/pickup-points': ['/delivery/pickup-points'],
  '/finance/withdrawals': ['/finance/withdraws'],
  '/region/list': ['/area/list'],
  '/region/tabbar': ['/area/tabbar'],
  '/region/share-settings': ['/area/share'],
  '/region/city-agent': ['/city-agent/applications'],
  '/system/operation-logs': ['/system/logs'],
  '/system/settings': ['/system/config'],
  '/system/mini-program-paths': ['/miniapp/pages'],
  '/features/second-hand': ['/second-hand/products'],
  '/marketing/share': ['/share/activity'],
  // 数据与智能 tab 化入口：按后端旧菜单路径匹配（P3）
  '/insights/business': ['/analytics/overview', '/analytics/users', '/analytics'],
  '/insights/tracking': ['/tracking/events', '/tracking'],
  '/insights/recommend': ['/recommend/dashboard', '/recommend', '/ab-tests'],
  '/insights/ai': ['/ai/dashboard', '/ai'],
  // 其余 tab 化入口（P3 剩余批）
  '/merchant/dorm-center': ['/merchant/dorm-shops', '/merchant/dorm'],
  '/merchant/config': ['/merchant/price-adjustments', '/merchant/printers', '/merchant/product-collection', '/merchant/region-settings'],
  '/mall/promo': ['/mall/promotions', '/mall/distributors'],
  '/mall/settings': ['/mall/freight', '/mall/service-staff'],
  '/errand/setup': ['/errand/config', '/errand/item-sizes', '/delivery/pricing'],
  '/finance/settle': ['/finance/merchant-settle', '/finance/rider-settle'],
  '/finance/ledger': ['/finance/subsidies', '/finance/reconciliation'],
  '/marketing/center': ['/marketing/campaigns', '/marketing/activities', '/marketing/group-buys'],
  '/marketing/perks': ['/marketing/coupons', '/marketing/sign', '/marketing/share'],
  '/marketing/messages': ['/marketing/official-assistant', '/marketing/notifications'],
  '/content/discussions': ['/content/comments', '/content/comment-lotteries'],
  '/content/assets': ['/content/stickers', '/content/text-cover-templates', '/content/sensitive'],
  '/user/loyalty': ['/user/growth', '/user/badges', '/user/tags'],
  '/system/publishing': ['/system/website', '/system/agreements', '/system/notification-center', '/system/mini-program-paths'],
  '/system/observability': ['/system/monitor', '/system/realtime-sessions', '/ops/jobs', '/system/operation-logs', '/system/login-logs', '/system/wechat-logs'],
  '/region/app-pages': ['/layout/home', '/layout/message', '/layout/profile', '/layout']
}

function normalizePath(path = '') {
  if (!path) return ''
  return path.startsWith('/') ? path : `/${path}`
}

function isSuperRole(role = '') {
  return ['super_admin', 'SUPER_ADMIN', '超级管理员'].includes(role)
}

function matchPath(path: string, allowedPath: string) {
  const current = normalizePath(path)
  const allowed = normalizePath(allowedPath)
  return current === allowed || current.startsWith(`${allowed}/`) || allowed.startsWith(`${current}/`)
}

export function requiredPermissionsForPath(path: string): string[] {
  const current = normalizePath(path)
  const matched = PATH_PERMISSION_RULES
    .filter((rule) => current === rule.prefix || current.startsWith(`${rule.prefix}/`))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0]
  return matched?.any || []
}

export function canAccessPath(path: string, access: AccessContext) {
  if (!path || path === '/' || path === '/dashboard') return true
  if (isSuperRole(access.role)) return true

  const permissions = access.permissions || []
  const required = requiredPermissionsForPath(path)
  if (required.length && permissions.length) {
    return required.some((permission) => permissions.includes(permission))
  }

  const menuPaths = (access.menus || []).map((item) => item.path).filter(Boolean) as string[]
  if (menuPaths.length) {
    const aliases = LEGACY_MENU_ALIASES[normalizePath(path)] || []
    return menuPaths.some((menuPath) => matchPath(path, menuPath) || aliases.some((alias) => matchPath(alias, menuPath)))
  }

  // AUD-P1-158: 权限/菜单缓存为空时拒绝访问，不默认放行全部页面
  if (required.length > 0 && !permissions.length && !menuPaths.length) return false
  return true
}

export function filterMenuGroups(groups: MenuGroup[], access: AccessContext): MenuGroup[] {
  return groups
    .map((group) => ({
      ...group,
      children: group.children.filter((item) => canAccessPath(item.path, access))
    }))
    .filter((group) => group.children.length > 0)
}

export function firstAccessiblePath(groups: MenuGroup[], access: AccessContext) {
  return filterMenuGroups(groups, access)[0]?.children[0]?.path || '/dashboard'
}
