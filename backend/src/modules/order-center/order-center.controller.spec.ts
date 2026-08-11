import { OrderCenterController } from './order-center.controller';

describe('OrderCenterController permissions', () => {
  it('requires an order operation permission before returning a rider to the pool', () => {
    expect(Reflect.getMetadata('admin_permissions', OrderCenterController.prototype.releaseRider))
      .toEqual(['order:refund']);
  });
});
