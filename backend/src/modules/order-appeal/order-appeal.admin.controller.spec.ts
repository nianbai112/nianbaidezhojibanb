import { OrderAppealAdminController } from './order-appeal.admin.controller';

describe('OrderAppealAdminController permissions', () => {
  it('requires order-operation permission before changing an appeal outcome', () => {
    expect(Reflect.getMetadata('admin_permissions', OrderAppealAdminController.prototype.update))
      .toEqual(['order:refund']);
  });
});
