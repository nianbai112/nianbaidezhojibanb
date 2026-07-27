export const MINI_PROGRAM_ROOT_PREFIX_LIST = [
  'wx-auth',
  'regions',
  'schools',
  'posts',
  'comments',
  'likes',
  'favorites',
  'user-followers',
  'circle-members',
  'topics',
  'circles',
  'circle',
  'status',
  'merchants',
  'dorm-shops',
  'categories',
  'products',
  'product-options',
  'order',
  'shopping-cart',
  'addresses',
  'merchant',
  'second-hand',
  'coupons',
  'post-management',
  'squats',
  'delivery-products',
  'specs',
  'errand',
  'delivery',
  'wxpay',
  'finance',
  'alipay-transfer',
  'messages',
  'membership',
  'wechat',
  'notifications',
  'order-appeals',
  'assistant-tickets',
  'delivery-distance',
  'upload',
  'auth',
  'city-agent',
  'activity',
  'activities',
  'marketing',
  'explosivesel',
  'topnotes',
  'config',
  'region',
  'setup',
  'healthz',
  'AnonymousIdentity',
  'miniapp',
  'search',
  'user-mentions',
  'user-management',
  // AUD-P1-002/004/005: 补充缺失的根路径豁免
  'campus-map',
  'region-signin',
  'official-assistant',
  'tracking',
  'platform',
];

const MINI_PROGRAM_ROOT_PREFIXES = new Set(MINI_PROGRAM_ROOT_PREFIX_LIST);

export function getMiniProgramGlobalPrefixExcludes() {
  return MINI_PROGRAM_ROOT_PREFIX_LIST.flatMap((prefix) => [
    prefix,
    `${prefix}/(.*)`,
  ]);
}

export function rewriteMiniProgramApiPath(url = '') {
  const [pathname, search = ''] = String(url || '').split('?');
  if (!pathname.startsWith('/api/')) return url;

  const withoutApi = pathname.slice('/api/'.length);
  if (withoutApi === 'region/incentives/my-records' || withoutApi.startsWith('region/incentives/')) {
    return url;
  }

  const firstSegment = withoutApi.split('/')[0];
  if (!MINI_PROGRAM_ROOT_PREFIXES.has(firstSegment)) return url;

  return `/${withoutApi}${search ? `?${search}` : ''}`;
}

export function miniProgramApiCompatMiddleware(req: any, _res: any, next: any) {
  req.url = rewriteMiniProgramApiPath(req.url);
  next();
}
