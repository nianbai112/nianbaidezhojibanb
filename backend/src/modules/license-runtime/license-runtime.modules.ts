export const ALL_LICENSE_MODULES = [
  'user',
  'content',
  'circle',
  'region',
  'merchant',
  'shop',
  'mall',
  'errand',
  'rider',
  'finance',
  'marketing',
  'ai',
  'analytics',
  'message',
  'system',
  'school',
] as const;

export type LicenseModuleKey = (typeof ALL_LICENSE_MODULES)[number];

const ALL_MODULE_SET = new Set<string>(ALL_LICENSE_MODULES);

const MODULE_PATH_RULES: Array<{ module: LicenseModuleKey; prefixes: string[] }> = [
  { module: 'user', prefixes: ['/users', '/user', '/auth/user', '/admin/users', '/admin/user', '/membership', '/admin/membership'] },
  { module: 'content', prefixes: ['/posts', '/comments', '/likes', '/favorites', '/admin/posts', '/admin/comments', '/admin/reports', '/content-ext', '/admin/stickers'] },
  { module: 'circle', prefixes: ['/circles', '/circle', '/circle-members', '/topics', '/admin/circles'] },
  { module: 'region', prefixes: ['/regions', '/region', '/city-agent', '/admin/regions', '/admin/region', '/layout-config'] },
  { module: 'merchant', prefixes: ['/merchants', '/merchant', '/admin/merchants', '/admin/products', '/admin/merchant'] },
  { module: 'shop', prefixes: ['/dorm-shops', '/admin/dorm-shops', '/shop', '/admin/shop'] },
  { module: 'mall', prefixes: ['/mall', '/products', '/categories', '/shopping-cart', '/order', '/admin/mall'] },
  { module: 'errand', prefixes: ['/errand', '/admin/errand'] },
  { module: 'rider', prefixes: ['/delivery', '/delivery-products', '/admin/delivery', '/admin/riders'] },
  { module: 'finance', prefixes: ['/finance', '/payment', '/wxpay', '/topup', '/alipay-transfer', '/admin/finance', '/admin/refunds'] },
  { module: 'marketing', prefixes: ['/activity', '/activities', '/coupons', '/group-buy', '/photo-contest', '/share', '/admin/marketing'] },
  { module: 'ai', prefixes: ['/admin/ai', '/ai-admin', '/ai-runtime', '/bot', '/admin/bot'] },
  { module: 'analytics', prefixes: ['/analytics', '/tracking', '/recommend', '/ab-test', '/admin/analytics'] },
  { module: 'message', prefixes: ['/messages', '/notifications', '/notify', '/wechat', '/websocket', '/admin/messages', '/admin/notifications'] },
  { module: 'system', prefixes: ['/admin/configs', '/admin/miniapp-pages', '/admin/system', '/system', '/ops', '/upload', '/uploads'] },
  { module: 'school', prefixes: ['/schools', '/school', '/admin/schools'] },
];

export function normalizeLicenseModules(input: unknown) {
  if (input === '*' || input === 'all') return [...ALL_LICENSE_MODULES];
  if (input === undefined || input === null || input === '') return [...ALL_LICENSE_MODULES];
  if (Array.isArray(input) && !input.length) return [];
  const list = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(',')
      : [];
  const modules = list
    .map((item) => String(item || '').trim())
    .filter((item) => item && item !== '*');
  if (!modules.length || modules.includes('all')) return [...ALL_LICENSE_MODULES];
  return Array.from(new Set(modules.filter((item) => ALL_MODULE_SET.has(item))));
}

export function isModuleEnabled(enabledModules: unknown, moduleKey: string | null | undefined) {
  if (!moduleKey) return true;
  const modules = normalizeLicenseModules(enabledModules);
  return modules.includes(moduleKey as LicenseModuleKey);
}

export function resolveLicenseModuleFromPath(rawPath: string) {
  const path = normalizeRequestPath(rawPath);
  if (!path) return null;
  const matched = MODULE_PATH_RULES.find((rule) =>
    rule.prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)),
  );
  return matched?.module || null;
}

function normalizeRequestPath(rawPath: string) {
  const path = String(rawPath || '').split('?')[0].replace(/\/+/g, '/');
  if (!path) return '';
  return path
    .replace(/^\/api\/v\d+(?=\/|$)/, '')
    .replace(/^\/api(?=\/|$)/, '')
    .replace(/\/$/, '') || '/';
}
