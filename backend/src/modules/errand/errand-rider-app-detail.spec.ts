import { BadRequestException } from '@nestjs/common';
import { ErrandService } from './errand.service';

describe('ErrandService dedicated rider App detail', () => {
  function createService(order: any) {
    const service: any = Object.create(ErrandService.prototype);
    service.prisma = {
      errandOrder: { findUnique: jest.fn().mockResolvedValue(null) },
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      deliveryOrderNode: { findMany: jest.fn().mockResolvedValue([{
        id: 'node-1', nodeType: 'exception', nodeLabel: '无法联系用户',
        remark: '电话无人接听', createdAt: new Date('2026-07-28T10:00:00.000Z'),
      }]) },
    };
    service.formatShopOrdersForRider = jest.fn().mockResolvedValue([{ id: order?.id, type: 'delivery' }]);
    return service;
  }

  it('returns an assigned shop-delivery order through the unified rider detail', async () => {
    const service = createService({ id: 'shop-1', riderId: 'user-1', merchant: {}, user: {}, items: [] });

    await expect(service.getRiderDeliveryOrderDetail('shop-1', 'user-1')).resolves.toEqual({
      success: true,
      data: {
        id: 'shop-1', type: 'delivery',
        delivery_track: expect.objectContaining({
          nodes: [expect.objectContaining({ id: 'node-1', label: '无法联系用户', remark: '电话无人接听' })],
        }),
      },
    });
  });

  it('does not expose another rider shop order', async () => {
    const service = createService({ id: 'shop-1', riderId: 'user-2', merchant: {}, user: {}, items: [] });

    await expect(service.getRiderDeliveryOrderDetail('shop-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exposes separate pickup and delivery coordinates plus the risk proof requirement', async () => {
    const service: any = Object.create(ErrandService.prototype);
    service.prisma = {
      errandOrderTask: { findMany: jest.fn().mockResolvedValue([]) },
      errandItemSize: { findMany: jest.fn().mockResolvedValue([]) },
      errandPickupPoint: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const [formatted] = await service.formatMiniOrders([{
      id: 'errand-1', orderNo: 'E-1', userId: 'customer-1', riderId: 'user-1',
      type: 'pickup', status: 'in_progress', title: '取快递', pickupAddress: '东门',
      pickupLat: 30.1, pickupLng: 120.1, deliverAddress: '1号楼', deliverLat: 30.2,
      deliverLng: 120.2, price: 3, tip: 0, payAmount: 3, refundStatus: 'none',
      remark: JSON.stringify({ risk_assessment: { required_evidence: ['delivery_photo'] } }),
      tasks: [], User: { id: 'customer-1', nickname: '用户', phone: '13800138000' },
      RegionRider: null, createdAt: new Date('2026-07-28T00:00:00Z'), updatedAt: new Date('2026-07-28T00:00:00Z'),
    }]);

    expect(formatted).toMatchObject({
      pickup_latitude: 30.1,
      pickup_longitude: 120.1,
      delivery_latitude: 30.2,
      delivery_longitude: 120.2,
      delivery_proof_required: true,
    });
  });
});
