const MALL_ADMIN_MODULES = [
  'products',
  'refunds',
  'reviews',
  'promotions',
  'freight',
  'distributor',
  'merchants',
];

export function rewriteMallAdminApiPath(url = '') {
  const [pathname, search = ''] = String(url || '').split('?');
  let rewritten = pathname;

  if (pathname.startsWith('/api/mall/admin/products/')) {
    rewritten = pathname.replace('/api/mall/admin/products/', '/mall/products/admin/');
  } else if (pathname.startsWith('/api/mall/admin/categories')) {
    rewritten = pathname.replace('/api/mall/', '/mall/');
  } else {
    const matchesAdminModule = MALL_ADMIN_MODULES.some((moduleName) =>
      pathname === `/api/mall/${moduleName}/admin`
      || pathname.startsWith(`/api/mall/${moduleName}/admin/`),
    );
    if (matchesAdminModule) {
      rewritten = pathname.replace('/api/mall/', '/mall/');
    }
  }

  return `${rewritten}${search ? `?${search}` : ''}`;
}

export function mallAdminApiCompatMiddleware(req: any, _res: any, next: any) {
  req.url = rewriteMallAdminApiPath(req.url);
  next();
}
