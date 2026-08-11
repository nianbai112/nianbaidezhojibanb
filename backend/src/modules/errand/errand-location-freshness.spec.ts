import { ErrandService } from './errand.service';

describe('ErrandService location freshness', () => {
  function createService(updatedCount: number) {
    const prisma = {
      regionRider: { updateMany: jest.fn().mockResolvedValue({ count: updatedCount }) },
    };
    const redis = { hsetIfNewer: jest.fn().mockResolvedValue(true) };
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
    )).resolves.toEqual({ success: true, updated: true });

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
    )).resolves.toEqual({ success: true, updated: false });
    expect(redis.hsetIfNewer).not.toHaveBeenCalled();
  });
});
