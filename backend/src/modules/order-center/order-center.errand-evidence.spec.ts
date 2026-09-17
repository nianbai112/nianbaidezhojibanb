import { OrderCenterService } from './order-center.service';

describe('errand admin delivery evidence', () => {
  const setup = () => {
    const service: any = Object.create(OrderCenterService.prototype);
    service.adminDataScope = { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, regionIds: ['r1'] }) };
    service.prisma = {
      errandOrder: { findUnique: jest.fn().mockResolvedValue({ id: 'e1', regionId: 'r1', receiptCode: '012345', receiptConfirmedBy: 'rider', User: { nickname: 'Buyer' } }) },
      deliveryOrderNode: { findMany: jest.fn().mockResolvedValue([{ nodeType: 'arrived', proofImages: ['proof.jpg'] }]) },
    };
    return service;
  };
  it('returns photos and confirmation records without exposing the code', async () => {
    const s = setup();
    const detail = await s.getOrderDetail('e1', 'errand', 'admin1');
    expect(detail.deliveryNodes[0].proofImages).toEqual(['proof.jpg']);
    expect(detail.receiptConfirmedBy).toBe('rider');
    expect(detail).not.toHaveProperty('receiptCode');
    expect(s.prisma.deliveryOrderNode.findMany).toHaveBeenCalledWith({ where: { orderId: 'e1', orderType: 'errand' }, orderBy: { createdAt: 'asc' } });
  });
  it('rejects orders from another region before querying photos', async () => {
    const s = setup(); s.adminDataScope.getAdminContext.mockResolvedValue({ isSuperAdmin: false, regionIds: ['r2'] });
    await expect(s.getOrderDetail('e1', 'errand', 'admin1')).rejects.toThrow('无权');
    expect(s.prisma.deliveryOrderNode.findMany).not.toHaveBeenCalled();
  });
  it('reports database failure instead of returning empty evidence', async () => {
    const s = setup(); s.prisma.deliveryOrderNode.findMany.mockRejectedValue(new Error('storage unavailable'));
    await expect(s.getOrderDetail('e1', 'errand', 'admin1')).rejects.toThrow('storage unavailable');
  });
});
