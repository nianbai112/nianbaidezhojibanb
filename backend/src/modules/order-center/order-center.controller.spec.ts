import { OrderCenterController } from './order-center.controller';

describe('OrderCenterController permissions', () => {
  it('requires an order operation permission before returning a rider to the pool', () => {
    expect(Reflect.getMetadata('admin_permissions', OrderCenterController.prototype.releaseRider))
      .toEqual(['order:refund']);
  });

  it('uses merchant permissions for dorm-shop staff supervision', () => {
    expect(Reflect.getMetadata('admin_permissions', OrderCenterController.prototype.getDormShopDeliveryStaff))
      .toEqual(['merchant:view']);
    expect(Reflect.getMetadata('admin_permissions', OrderCenterController.prototype.updateDormShopDeliveryStaffStatus))
      .toEqual(['merchant:audit']);
  });
});
