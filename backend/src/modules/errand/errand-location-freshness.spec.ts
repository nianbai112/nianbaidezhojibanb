import { ErrandService } from './errand.service';

describe('ErrandService location freshness', () => {
  function createService(updatedCount = 1) {
    const prisma: any = {
      errandOrder: {
        findFirst: jest.fn().mockResolvedValue({ id: 'order-1' }),
      },
      order: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      regionRider: {
        updateMany: jest.fn().mockResolvedValue({ count: updatedCount }),
        update: jest.fn().mockResolvedValue({
          id: 'rider-1',
          userId: 'user-1',
          lat: 30,
          lng: 120,
        }),
      },
    };
    prisma.$transaction = jest.fn(async (callback: any) => callback(prisma));
    const redis = {
      hsetIfNewer: jest.fn().mockResolvedValue(true),
      hset: jest.fn().mockResolvedValue(true),
    };
    const service = new ErrandService(
      prisma as any,
      redis as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, prisma, redis };
  }

  it('atomically updates the live rider location only when the point is newer', async () => {
    const { service, prisma, redis } = createService(1);
    const recordedAt = new Date('2026-07-28T12:00:00.000Z');

    await expect(service.updateLocationIfNewer(
      'user-1', { lat: 30, lng: 120 }, recordedAt,
      { orderId: 'order-1', orderType: 'errand' },
    )).resolves.toEqual({ success: true, updated: true });

    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'Serializable' },
    );
    expect(prisma.errandOrder.findFirst).toHaveBeenCalledWith({
      where: {
        riderId: 'user-1',
        status: { in: ['accepted', 'in_progress'] },
        refundStatus: { notIn: ['refunding', 'refunded'] },
        id: 'order-1',
      },
      select: { id: true },
    });

    expect(prisma.regionRider.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        OR: [{ locationUpdatedAt: null }, { locationUpdatedAt: { lt: recordedAt } }],
      },
      data: { lat: 30, lng: 120, locationUpdatedAt: recordedAt },
    });
    expect(redis.hsetIfNewer).toHaveBeenCalledWith(
      'rider:location',
      'user-1',
      { lat: 30, lng: 120, time: recordedAt.getTime() },
    );
  });

  it('does not let a stale cached point overwrite the current live location', async () => {
    const { service, redis } = createService(0);

    await expect(service.updateLocationIfNewer(
      'user-1', { lat: 30, lng: 120 }, new Date('2026-07-28T11:00:00.000Z'),
      { orderId: 'order-1', orderType: 'errand' },
    )).resolves.toEqual({ success: true, updated: false });
    expect(redis.hsetIfNewer).not.toHaveBeenCalled();
  });

  it('does not update the database or cache after the bound order becomes inactive', async () => {
    const { service, prisma, redis } = createService();
    prisma.errandOrder.findFirst.mockResolvedValue(null);

    await expect(service.updateLocationIfNewer(
      'user-1', { lat: 30, lng: 120 }, new Date('2026-07-28T12:00:00.000Z'),
      { orderId: 'order-1', orderType: 'errand' },
    )).resolves.toEqual({ success: true, updated: false });

    expect(prisma.regionRider.updateMany).not.toHaveBeenCalled();
    expect(redis.hsetIfNewer).not.toHaveBeenCalled();
  });

  it('rejects the generic location endpoint when the rider has no active order', async () => {
    const { service, prisma, redis } = createService();
    prisma.errandOrder.findFirst.mockResolvedValue(null);
    prisma.order.findFirst.mockResolvedValue(null);

    await expect(service.updateLocation(
      'user-1', { lat: 30, lng: 120 },
    )).rejects.toThrow('没有配送中的订单');

    expect(prisma.regionRider.update).not.toHaveBeenCalled();
    expect(redis.hset).not.toHaveBeenCalled();
  });

  it('updates the generic live location inside the active-order transaction', async () => {
    const { service, prisma, redis } = createService();

    await expect(service.updateLocation(
      'user-1', { lat: 30, lng: 120 },
    )).resolves.toMatchObject({ success: true });

    expect(prisma.regionRider.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: {
        lat: 30,
        lng: 120,
        locationUpdatedAt: expect.any(Date),
      },
      include: {
        User: { select: { id: true, nickname: true, avatar: true, phone: true } },
      },
    });
    expect(redis.hset).toHaveBeenCalledWith(
      'rider:location',
      'user-1',
      expect.any(String),
    );
  });
});
