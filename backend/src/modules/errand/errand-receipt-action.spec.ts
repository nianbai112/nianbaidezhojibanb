import { ErrandService } from './errand.service';

describe('ErrandService receipt action returned to mini program', () => {
  it.each([
    ['arrived', 'none', 'owner', null, true, ''],
    ['arrived', 'partial', 'owner', null, true, ''],
    ['arrived', 'none', 'rider', null, false, '仅下单用户'],
    ['arrived', 'refunding', 'owner', null, false, '退款'],
    ['arrived', 'refunded', 'owner', null, false, '退款'],
    ['in_progress', 'none', 'owner', null, false, '尚未送达'],
    ['completed', 'none', 'owner', null, false, '已结束'],
    ['arrived', 'none', 'owner', { id: 'appeal-1' }, false, '售后处理中'],
  ])('%s/%s viewed by %s with appeal %s', async (status, refundStatus, viewer, appeal, allowed, reason) => {
    const order = { id: 'errand-1', userId: 'owner', riderId: 'rider', status, refundStatus };
    const prisma: any = {
      errandOrder: { findUnique: jest.fn().mockResolvedValue(order) },
      orderAppeal: { findFirst: jest.fn().mockResolvedValue(appeal) },
    };
    const service = new ErrandService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    jest.spyOn(service as any, 'formatMiniOrders').mockResolvedValue([{ id: order.id }]);
    jest.spyOn(service as any, 'getDeliveryTrack').mockResolvedValue({});
    const result = await service.getOrderDetail(order.id, viewer as string);
    expect(result.data.order_lifecycle.fulfillment_status).toBe(status);
    expect(result.data.order_lifecycle.receipt_action).toEqual({ allowed, reason: expect.stringContaining(reason as string) });
    if (appeal) expect(prisma.orderAppeal.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ orderId: order.id, orderType: { in: ['errand', 'errand_order'] } }),
    }));
  });
});
