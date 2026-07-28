import { BadRequestException } from '@nestjs/common';
import { ErrandService } from './errand.service';

describe('ErrandService dedicated rider App detail', () => {
  function createService(order: any) {
    const service: any = Object.create(ErrandService.prototype);
    service.prisma = {
      errandOrder: { findUnique: jest.fn().mockResolvedValue(null) },
      order: { findUnique: jest.fn().mockResolvedValue(order) },
    };
    service.formatShopOrdersForRider = jest.fn().mockResolvedValue([{ id: order?.id, type: 'delivery' }]);
    return service;
  }

  it('returns an assigned shop-delivery order through the unified rider detail', async () => {
    const service = createService({ id: 'shop-1', riderId: 'user-1', merchant: {}, user: {}, items: [] });

    await expect(service.getRiderDeliveryOrderDetail('shop-1', 'user-1')).resolves.toEqual({
      success: true,
      data: { id: 'shop-1', type: 'delivery' },
    });
  });

  it('does not expose another rider shop order', async () => {
    const service = createService({ id: 'shop-1', riderId: 'user-2', merchant: {}, user: {}, items: [] });

    await expect(service.getRiderDeliveryOrderDetail('shop-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
