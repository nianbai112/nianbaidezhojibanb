import { ErrandService } from './errand.service';
import { errandStatusFilter } from './errand-order-filter';

describe('user errand status filters', () => {
  test('processing includes procurement, delivery and waiting for receipt', () => {
    expect(errandStatusFilter('processing')).toEqual({ in: ['accepted', 'in_progress', 'arrived'] });
    expect(errandStatusFilter('all')).toBeUndefined();
    expect(() => errandStatusFilter('unknown')).toThrow('筛选无效');
  });
  test.each(['my_orders', 'my_accepted_orders'])('filtering %s keeps ownership and pagination on the server', async filterType => {
    const db = {errandOrder:{findMany:jest.fn().mockResolvedValue([]),count:jest.fn().mockResolvedValue(0)}};
    const service: any = new (ErrandService as any)(db);
    service.getOrderTakingIdentity = jest.fn().mockResolvedValue(null);
    service.formatOrderTakingIdentity = jest.fn().mockReturnValue({});
    service.formatMiniOrders = jest.fn().mockResolvedValue([]);
    await service.getUserOrders('current-user',{filter_type:filterType,region_id:'school',status_group:'pending_pay',page:2,limit:10});
    const expected = {regionId:'school',status:{in:['pending_pay']},[filterType==='my_orders'?'userId':'riderId']:'current-user'};
    expect(db.errandOrder.findMany.mock.calls[0][0]).toMatchObject({where:expected,skip:10,take:10});
    expect(db.errandOrder.count).toHaveBeenCalledWith({where:expected});
  });
});
