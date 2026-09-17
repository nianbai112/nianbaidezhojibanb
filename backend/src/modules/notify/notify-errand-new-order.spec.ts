import { NotifyService } from './notify.service';
import { loadErrandNotificationAudience } from '../errand/errand-new-order-notification';

function fixture() {
  const order: any = { id: 'o1', orderNo: 'E001', userId: 'buyer', regionId: 'campus', status: 'pending_accept', payTime: new Date(), createdAt: new Date(), type: 'pickup', payAmount: 8, tasks: [] };
  const riders = ['part_time', 'official'].map(riderType => ({ userId: riderType, riderType, status: 'online', notificationStatus: true, User: { profile: { gender: 'FEMALE' } } }));
  const rows = new Map<string, any>();
  const prisma: any = {
    errandOrder: { findUnique: jest.fn(async () => order), findMany: jest.fn(async () => [{ id: order.id }]), groupBy: jest.fn(async () => []) },
    order: { groupBy: jest.fn(async () => []) },
    config: { findUnique: jest.fn(async () => null) },
    region: { findUnique: jest.fn(async () => ({ name: '东校区' })) },
    regionRider: { findMany: jest.fn(async ({ where }) => riders.filter(rider =>
      (!where.userId.equals || rider.userId === where.userId.equals)
      && (!where.status || where.status.in.includes(rider.status))
      && (!where.notificationStatus || rider.notificationStatus)
    )) },
    notification: {
      create: jest.fn(async ({ data }) => {
        const key = `${data.userId}:${data.eventKey}`;
        if (rows.has(key)) throw Object.assign(new Error('unique'), { code: 'P2002' });
        const row = { ...data, id: `n${rows.size}`, createdAt: new Date() };
        rows.set(key, row); return row;
      }),
      findUnique: jest.fn(async ({ where }) => where.userId_eventKey ? rows.get(`${where.userId_eventKey.userId}:${where.userId_eventKey.eventKey}`) : [...rows.values()].find(row => row.id === where.id)),
      update: jest.fn(async ({ where, data }) => {
        const row = [...rows.values()].find(value => value.id === where.id);
        Object.assign(row, data); return row;
      }),
    },
  };
  const official = { sendNotificationTemplate: jest.fn(async () => ({ success: true })) };
  const subscribe = { sendSubscribeMessage: jest.fn(async () => ({ success: true })) };
  const service: any = new NotifyService(prisma, { delPattern: jest.fn().mockResolvedValue(undefined) } as any, undefined, {} as any, {} as any, {} as any, undefined, subscribe as any, undefined, official as any);
  service.getUnreadSummary = jest.fn(async () => ({}));
  return { order, riders, rows, prisma, service, official, subscribe };
}

describe('rider new-order delivery', () => {
  it('queues both official and part-time riders once despite concurrent payment/recovery triggers', async () => {
    const f = fixture();
    await Promise.all([f.service.notifyAvailableErrandRiders('o1'), f.service.notifyAvailableErrandRiders('o1')]);
    expect(f.rows.size).toBe(2);
    expect([...f.rows.values()].map(row => row.userId)).toEqual(['part_time', 'official']);
    expect(f.prisma.regionRider.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      regionId: 'campus', verifyStatus: 'approved', notificationStatus: true,
      userId: { not: 'buyer' }, riderType: { not: 'ordinary_user' }, User: { status: 'ACTIVE' },
    }) }));
    const row: any = [...f.rows.values()][0];
    expect(row.channelMask.officialAccount).toBe(true);
    expect(row.linkValue).toContain('order_id=o1');
    expect(row.data).toMatchObject({ serviceAddress: '东校区', orderAmount: '8.00元' });
    expect(row.data).not.toHaveProperty('phone');
    expect(row.data).not.toHaveProperty('pickupCode');
  });

  it.each(['part_time', 'official'])('queues and delivers to an already offline %s rider', async riderType => {
    const f = fixture();
    f.riders.find(rider => rider.riderType === riderType)!.status = 'offline';
    await f.service.notifyAvailableErrandRiders('o1');
    const notice: any = [...f.rows.values()].find(row => row.userId === riderType);
    expect(notice).toBeDefined();
    const result = await f.service.deliverNotificationChannels(notice, { officialAccount: true });
    expect(result.deliveryStatus).toBe('delivered');
    expect(f.official.sendNotificationTemplate).toHaveBeenCalledWith(expect.objectContaining({ userId: riderType, scene: 'new_errand_order' }));
  });

  it('still respects an offline rider disabling new-order reminders', async () => {
    const f = fixture();
    f.riders[0].status = 'offline';
    f.riders[0].notificationStatus = false;
    await f.service.notifyAvailableErrandRiders('o1');
    expect([...f.rows.values()].map(row => row.userId)).toEqual(['official']);
  });

  it.each(['unpaid', 'cancelled', 'accepted', 'refunding', 'refunded'])('does not queue %s orders', async state => {
    const f = fixture();
    if (state === 'unpaid') f.order.payTime = null;
    else if (state.startsWith('refund')) f.order.refundStatus = state;
    else f.order.status = state;
    await f.service.notifyAvailableErrandRiders('o1');
    expect(f.prisma.notification.create).not.toHaveBeenCalled();
  });

  it('excludes gender mismatches and riders at capacity without an ineligible fallback', async () => {
    const f = fixture();
    f.order.remark = JSON.stringify({ rider_gender_requirement: 'female' });
    f.riders[0].User.profile.gender = 'MALE';
    f.prisma.errandOrder.groupBy.mockResolvedValue([{ riderId: 'official', _count: { _all: 2 } }]);
    expect((await loadErrandNotificationAudience(f.prisma, 'o1')).targets).toHaveLength(0);
    await f.service.notifyAvailableErrandRiders('o1');
    expect(f.prisma.notification.create).not.toHaveBeenCalled();
  });

  it('waits for ordinary-user protection to expire before notifying approved riders', async () => {
    const f = fixture();
    f.order.remark = JSON.stringify({ receiverType: 'ordinary_user', fallbackReleaseAt: new Date(Date.now() + 60000).toISOString() });
    f.prisma.config.findUnique.mockResolvedValue({ value: { orderTakingPolicy: { ordinaryUserEnabled: true, receiverChoiceEnabled: true, ordinaryUserFallbackEnabled: true, ordinaryUserFallbackMinutes: 10 } } } as any);
    await f.service.notifyAvailableErrandRiders('o1');
    expect(f.rows.size).toBe(0);
    f.order.remark = JSON.stringify({ receiverType: 'ordinary_user', fallbackReleaseAt: new Date(Date.now() - 60000).toISOString() });
    await f.service.notifyAvailableErrandRiders('o1');
    expect(f.rows.size).toBe(2);
  });

  it('propagates unavailable capacity checks for recovery rather than notifying unverified recipients', async () => {
    const f = fixture();
    f.prisma.order.groupBy.mockRejectedValue(new Error('database unavailable'));
    await expect(f.service.notifyAvailableErrandRiders('o1')).rejects.toThrow('database unavailable');
    expect(f.rows.size).toBe(0);
  });

  it('recovers a paid order for offline riders without duplicates after the immediate enqueue step was missed', async () => {
    const f = fixture();
    f.riders.forEach(rider => { rider.status = 'offline'; });
    await f.service.reconcileErrandNewOrderNotifications();
    await f.service.reconcileErrandNewOrderNotifications();
    expect(f.rows.size).toBe(2);
  });

  it('continues other recipients after one enqueue fails and recovers without duplicates', async () => {
    const f = fixture();
    f.prisma.notification.create.mockRejectedValueOnce(new Error('temporary failure'));
    await expect(f.service.notifyAvailableErrandRiders('o1')).rejects.toThrow('等待补偿');
    expect([...f.rows.values()].map(row => row.userId)).toEqual(['official']);
    await f.service.reconcileErrandNewOrderNotifications();
    expect(f.rows.size).toBe(2);
  });

  it('retries an interrupted delivery even if the rider has since gone offline', async () => {
    const f = fixture();
    await f.service.notifyAvailableErrandRiders('o1');
    const notice: any = [...f.rows.values()][0];
    notice.channelMask = { inApp: true, officialAccount: true };
    notice.deliveryReport = { worker: { status: 'failed', error: 'interrupted' } };
    f.riders[0].status = 'offline';
    await f.service.retryNotificationDelivery(notice.id);
    expect(f.official.sendNotificationTemplate).toHaveBeenCalledTimes(1);
    expect(notice.deliveryReport).not.toHaveProperty('worker');
    expect(notice.deliveryStatus).toBe('delivered');
  });

  it('stops retrying a failed delivery after the order has been accepted', async () => {
    const f = fixture();
    await f.service.notifyAvailableErrandRiders('o1');
    const notice: any = [...f.rows.values()][0];
    notice.deliveryReport = { officialAccount: { status: 'failed', error: 'timeout' } };
    f.order.status = 'accepted';
    await f.service.retryNotificationDelivery(notice.id);
    expect(notice.deliveryStatus).toBe('retired');
    expect(f.official.sendNotificationTemplate).not.toHaveBeenCalled();
  });

  it('retires a queued notification after cancellation without invoking external channels', async () => {
    const f = fixture();
    await f.service.notifyAvailableErrandRiders('o1');
    const notice: any = [...f.rows.values()][0];
    f.order.status = 'cancelled';
    const result = await f.service.deliverNotificationChannels(notice, notice.channelMask);
    expect(result.deliveryStatus).toBe('retired');
    expect(f.official.sendNotificationTemplate).not.toHaveBeenCalled();
    expect(f.subscribe.sendSubscribeMessage).not.toHaveBeenCalled();
  });

  it('delivers a queued notification when its recipient goes offline before delivery', async () => {
    const f = fixture();
    await f.service.notifyAvailableErrandRiders('o1');
    const notice: any = [...f.rows.values()][0];
    f.riders[0].status = 'offline';
    expect((await f.service.deliverNotificationChannels(notice, { officialAccount: true })).deliveryStatus).toBe('delivered');
    expect(f.official.sendNotificationTemplate).toHaveBeenCalledTimes(1);
  });

  it('retires a queued notification when its recipient disables reminders before delivery', async () => {
    const f = fixture();
    await f.service.notifyAvailableErrandRiders('o1');
    const notice: any = [...f.rows.values()][0];
    f.riders[0].notificationStatus = false;
    expect((await f.service.deliverNotificationChannels(notice, notice.channelMask)).deliveryStatus).toBe('retired');
    expect(f.official.sendNotificationTemplate).not.toHaveBeenCalled();
  });

  it.each([
    [{ success: true }, false],
    [{ success: false, error: '用户未绑定或未关注服务号' }, true],
    [{ success: false, skipped: true, error: 'official_notification_disabled' }, true],
    [{ success: false, error: 'network timeout' }, false],
  ])('uses a subscription fallback only for definite unavailability: %j', async (result, fallback) => {
    const f = fixture();
    await f.service.notifyAvailableErrandRiders('o1');
    const notice: any = [...f.rows.values()][0];
    f.official.sendNotificationTemplate.mockResolvedValue(result as any);
    await f.service.deliverNotificationChannels(notice, { officialAccount: true });
    expect(f.official.sendNotificationTemplate).toHaveBeenCalledTimes(1);
    expect(f.subscribe.sendSubscribeMessage).toHaveBeenCalledTimes(fallback ? 1 : 0);
  });
});
