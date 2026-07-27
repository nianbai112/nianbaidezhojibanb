import { TrackingService } from './tracking.service';

const createService = () => {
  const prisma = {
    userProfile: { findUnique: jest.fn().mockResolvedValue({ regionId: 'region-server' }) },
    trackingEvent: { create: jest.fn(), createMany: jest.fn() },
  };
  return { prisma, service: new TrackingService(prisma as any) };
};

describe('TrackingService trusted attribution', () => {
  it('uses the authenticated user and server profile region instead of client values', async () => {
    const { prisma, service } = createService();

    await service.trackEvent({
      eventName: 'search',
      userId: 'forged-user',
      regionId: 'forged-region',
      params: { keyword: '  library  ', type: 'post' },
      ip: '127.0.0.1',
      ua: 'test-agent',
    }, 'user-server');

    expect(prisma.trackingEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-server',
        regionId: 'region-server',
        params: expect.objectContaining({ keyword: 'library' }),
      }),
    });
  });

  it('drops anonymous search events and strips forged identity values from a batch', async () => {
    const { prisma, service } = createService();

    await expect(service.trackEvent({ eventName: 'search', params: { keyword: 'spam' } }))
      .resolves.toEqual({ success: true, dropped: true });
    await service.trackBatch([
      { eventName: 'page_view', userId: 'forged-user', regionId: 'forged-region' },
      { eventName: 'search', params: { keyword: 'campus' }, userId: 'forged-user', regionId: 'forged-region' },
    ], '127.0.0.1', 'test-agent', 'user-server');

    expect(prisma.trackingEvent.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ userId: 'user-server', regionId: 'region-server' }),
      ]),
    });
  });
});
