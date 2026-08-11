import {
  getMiniProgramGlobalPrefixExcludes,
  rewriteMiniProgramApiPath,
} from './mini-program-api-compat';

describe('rewriteMiniProgramApiPath', () => {
  it('rewrites legacy mini-program /api paths to backend root routes', () => {
    expect(rewriteMiniProgramApiPath('/api/regions/current?region_id=r1'))
      .toBe('/regions/current?region_id=r1');
    expect(rewriteMiniProgramApiPath('/api/posts/list?page=1'))
      .toBe('/posts/list?page=1');
    expect(rewriteMiniProgramApiPath('/api/notifications/all-details'))
      .toBe('/notifications/all-details');
    expect(rewriteMiniProgramApiPath('/api/search/global?keyword=test'))
      .toBe('/search/global?keyword=test');
    expect(rewriteMiniProgramApiPath('/api/user-mentions/search?keyword=a'))
      .toBe('/user-mentions/search?keyword=a');
    expect(rewriteMiniProgramApiPath('/api/user-management/tags?region_id=r1'))
      .toBe('/user-management/tags?region_id=r1');
    expect(rewriteMiniProgramApiPath('/api/miniapp/activity/activities?page=1'))
      .toBe('/miniapp/activity/activities?page=1');
    expect(rewriteMiniProgramApiPath('/api/order-appeals/eligible-orders'))
      .toBe('/order-appeals/eligible-orders');
    expect(rewriteMiniProgramApiPath('/api/assistant-tickets/my'))
      .toBe('/assistant-tickets/my');
    expect(rewriteMiniProgramApiPath('/api/delivery-distance/merchant-1'))
      .toBe('/delivery-distance/merchant-1');
    expect(rewriteMiniProgramApiPath('/api/rider-app/orders?status=accepted'))
      .toBe('/rider-app/orders?status=accepted');
  });

  it('keeps backend routes that are intentionally mounted under /api', () => {
    expect(rewriteMiniProgramApiPath('/api/mall/products/list'))
      .toBe('/api/mall/products/list');
    expect(rewriteMiniProgramApiPath('/api/rating/items'))
      .toBe('/api/rating/items');
    expect(rewriteMiniProgramApiPath('/api/balance-recharge/check-wechat-binding'))
      .toBe('/api/balance-recharge/check-wechat-binding');
    expect(rewriteMiniProgramApiPath('/api/region/incentives/my-records?page=1'))
      .toBe('/api/region/incentives/my-records?page=1');
  });

  it('leaves non-api paths unchanged', () => {
    expect(rewriteMiniProgramApiPath('/regions/current')).toBe('/regions/current');
  });

  it('excludes every rewritten root route from the Nest global API prefix', () => {
    const excludes = getMiniProgramGlobalPrefixExcludes();

    expect(excludes).toContain('search');
    expect(excludes).toContain('search/(.*)');
    expect(excludes).toContain('user-mentions/(.*)');
    expect(excludes).toContain('miniapp/(.*)');
    expect(excludes).toContain('order-appeals/(.*)');
    expect(excludes).toContain('assistant-tickets/(.*)');
    expect(excludes).toContain('delivery-distance/(.*)');
    expect(excludes).toContain('rider-app/(.*)');
  });
});
