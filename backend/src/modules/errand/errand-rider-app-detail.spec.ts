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

  it('shows the receipt code only to the order owner, never to a rider projection', async () => {
    const service: any = Object.create(ErrandService.prototype);
    service.prisma = {
      errandOrderTask: { findMany: jest.fn().mockResolvedValue([]) },
      errandItemSize: { findMany: jest.fn().mockResolvedValue([]) },
      errandPickupPoint: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const row = {
      id: 'errand-1', orderNo: 'E-1', userId: 'customer-1', riderId: 'rider-1',
      receiptCode: '123456', type: 'pickup', status: 'arrived', title: '取快递',
      pickupAddress: '东门', deliverAddress: '1号楼', price: 3, tip: 0,
      payAmount: 3, refundStatus: 'none', remark: '{}', tasks: [],
      User: { id: 'customer-1', nickname: '用户' }, RegionRider: null,
      createdAt: new Date('2026-07-28T00:00:00Z'),
      updatedAt: new Date('2026-07-28T00:00:00Z'),
    };

    const [ownerView] = await service.formatMiniOrders([row], {
      receiptCodeViewerId: 'customer-1',
    });
    const [riderView] = await service.formatMiniOrders([row], {
      receiptCodeViewerId: 'rider-1',
    });

    expect(ownerView.receipt_code).toBe('123456');
    expect(riderView).not.toHaveProperty('receipt_code');
  });

  it('repairs a legacy placeholder pickup address from the resolved pickup point', async () => {
    const service: any = Object.create(ErrandService.prototype);
    service.prisma = {
      errandOrderTask: { findMany: jest.fn().mockResolvedValue([]) },
      errandItemSize: { findMany: jest.fn().mockResolvedValue([]) },
      errandPickupPoint: { findMany: jest.fn().mockResolvedValue([{
        id: 'canteen-1', name: '学生餐厅', address: '学生餐厅',
      }]) },
    };

    const [formatted] = await service.formatMiniOrders([{
      id: 'meal-1', orderNo: 'E-MEAL-1', userId: 'customer-1', riderId: 'rider-1',
      type: 'meal', status: 'completed', title: '帮我取餐',
      pickupAddress: '待填写取件地址', deliverAddress: '2号宿舍', price: 2, tip: 0,
      payAmount: 2, refundStatus: 'none', remark: '{}',
      tasks: [{
        taskType: 'food_delivery', pickupPointId: 'canteen-1', itemSizeId: null,
        platform: '美团', code: '5678', imageUrls: [], metadata: {},
      }],
      User: { id: 'customer-1', nickname: '用户' }, RegionRider: null,
      createdAt: new Date('2026-08-31T00:00:00Z'),
      updatedAt: new Date('2026-08-31T00:00:00Z'),
    }]);

    expect(formatted.pickup_address).toBe('学生餐厅');
    expect(formatted.details[0].pickup_address).toBe('学生餐厅');
  });

  it('closes live rider tracking once an errand is completed', async () => {
    const service: any = Object.create(ErrandService.prototype);
    const track = await service.getDeliveryTrack({
      id: 'errand-1',
      status: 'completed',
      deliveryDisplayMode: 'live_map',
      RegionRider: {
        riderType: 'official',
        lat: 30.1,
        lng: 120.1,
        locationUpdatedAt: new Date(),
      },
    }, []);

    expect(track).toMatchObject({
      can_show_live_map: false,
      current_location: null,
      location_stale: false,
      estimated_arrival_text: '订单已完成，骑手定位已关闭',
    });
  });

  it('returns live completed-order counts instead of stale rider counters', async () => {
    const service: any = Object.create(ErrandService.prototype);
    service.prisma = {
      regionRider: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'rider-1', userId: 'user-1', regionId: 'region-1',
          totalOrders: 99, todayOrders: 99, status: 'online',
          riderType: 'official', verifyStatus: 'approved', User: {},
        }),
      },
      errandOrder: {
        count: jest.fn()
          .mockResolvedValueOnce(3)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(2),
      },
      order: {
        count: jest.fn()
          .mockResolvedValueOnce(2)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(2),
      },
    };

    await expect(service.getRiderInfo('user-1')).resolves.toMatchObject({
      total_orders: 5,
      today_orders: 2,
    });
  });

  it('uses Shanghai calendar boundaries independently of the server timezone', () => {
    const service: any = Object.create(ErrandService.prototype);
    const afterShanghaiMidnight = new Date('2026-08-31T17:30:00.000Z');

    expect(service.dayStart(afterShanghaiMidnight)).toEqual(
      new Date('2026-08-31T16:00:00.000Z'),
    );
    expect(service.monthStart(afterShanghaiMidnight)).toEqual(
      new Date('2026-08-31T16:00:00.000Z'),
    );
  });
});
