import { rewriteMallAdminApiPath } from './mall-admin-api-compat';

describe('rewriteMallAdminApiPath', () => {
  it('rewrites legacy mall admin category paths', () => {
    expect(rewriteMallAdminApiPath('/api/mall/admin/categories'))
      .toBe('/mall/admin/categories');
    expect(rewriteMallAdminApiPath('/api/mall/admin/categories/create'))
      .toBe('/mall/admin/categories/create');
  });

  it('rewrites legacy mall admin product paths', () => {
    expect(rewriteMallAdminApiPath('/api/mall/admin/products/p1/status'))
      .toBe('/mall/products/admin/p1/status');
    expect(rewriteMallAdminApiPath('/api/mall/admin/products/p1'))
      .toBe('/mall/products/admin/p1');
    expect(rewriteMallAdminApiPath('/api/mall/products/admin/list?page=1'))
      .toBe('/mall/products/admin/list?page=1');
  });

  it('rewrites legacy mall admin module paths', () => {
    expect(rewriteMallAdminApiPath('/api/mall/refunds/admin/list'))
      .toBe('/mall/refunds/admin/list');
    expect(rewriteMallAdminApiPath('/api/mall/merchants/admin/m1/stats'))
      .toBe('/mall/merchants/admin/m1/stats');
  });

  it('keeps real mall user-side api paths unchanged', () => {
    expect(rewriteMallAdminApiPath('/api/mall/products/list'))
      .toBe('/api/mall/products/list');
    expect(rewriteMallAdminApiPath('/api/mall/cart'))
      .toBe('/api/mall/cart');
    expect(rewriteMallAdminApiPath('/api/mall/service/admin/staff/list'))
      .toBe('/api/mall/service/admin/staff/list');
  });
});
