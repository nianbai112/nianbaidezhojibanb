import { ErrandLifecycleService } from './errand-lifecycle.service';

describe('ErrandLifecycleService auto receipt', () => {
  const now = new Date('2026-07-22T04:00:00.000Z');
  const dueOrder = {
    id: 'order-1',
    userId: 'user-1',
    regionId: 'region-1',
    orderNo: 'ERR-1',
    status: 'arrived',
    refundStatus: 'none',
    receiptConfirmDeadline: new Date('2026-07-22T03:00:00.000Z'),
  };
  const prisma: any = {
    errandOrder: { findMany: jest.fn() },
    orderAppeal: { findMany: jest.fn() },
    deliveryRiskEvent: { findMany: jest.fn() },
    config: { findMany: jest.fn() },
  };

  let service: ErrandLifecycleService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.errandOrder.findMany.mockResolvedValue([dueOrder]);
    prisma.orderAppeal.findMany.mockResolvedValue([]);
    prisma.deliveryRiskEvent.findMany.mockResolvedValue([]);
    prisma.config.findMany.mockResolvedValue([]);
    service = new ErrandLifecycleService(prisma);
  });

  it('auto-confirms an arrived order after its deadline', async () => {
    jest.spyOn(service, 'confirmReceipt').mockResolvedValue({ ...dueOrder, status: 'completed' } as any);

    const result = await service.autoConfirmDueOrders(now);

    expect(result).toEqual({ checked: 1, completed: 1, held: 0 });
    expect(service.confirmReceipt).toHaveBeenCalledWith('order-1', 'user-1', 'system');
  });

  it.each([
    ['open appeal', { appeal: true }],
    ['refunding', { refunding: true }],
    ['blocking risk', { risk: true }],
  ])('holds auto receipt for %s', async (_label, hold) => {
    const flags = hold as { appeal?: boolean; refunding?: boolean; risk?: boolean };
    if (flags.appeal) prisma.orderAppeal.findMany.mockResolvedValueOnce([{ orderId: 'order-1' }]);
    if (flags.risk) prisma.deliveryRiskEvent.findMany.mockResolvedValueOnce([{ orderId: 'order-1' }]);
    if (flags.refunding) {
      prisma.errandOrder.findMany.mockResolvedValueOnce([{ ...dueOrder, refundStatus: 'refunding' }]);
    }
    const confirm = jest.spyOn(service, 'confirmReceipt');

    const result = await service.autoConfirmDueOrders(now);

    expect(result).toEqual({ checked: 1, completed: 0, held: 1 });
    expect(confirm).not.toHaveBeenCalled();
  });

  it('keeps due orders pending when auto receipt is disabled for their region', async () => {
    prisma.config.findMany.mockResolvedValueOnce([{
      key: 'errand.extended_config.region-1',
      value: { autoReceiptEnabled: false },
    }]);
    const confirm = jest.spyOn(service, 'confirmReceipt');

    await expect(service.autoConfirmDueOrders(now)).resolves.toEqual({ checked: 1, completed: 0, held: 1 });
    expect(confirm).not.toHaveBeenCalled();
  });

  it('creates actionable open risk events for acceptance, delivery and refund failures', async () => {
    const alertPrisma: any = {
      errandOrder: { findMany: jest.fn().mockResolvedValue([
        {
          id: 'waiting-1', orderNo: 'ERR-WAIT', regionId: 'region-1', riderId: null,
          status: 'pending_accept', createdAt: new Date('2026-07-22T03:20:00.000Z'),
        },
        {
          id: 'late-1', orderNo: 'ERR-LATE', regionId: 'region-1', riderId: 'rider-1',
          status: 'in_progress', pickupTime: new Date('2026-07-22T03:00:00.000Z'), createdAt: new Date('2026-07-22T02:50:00.000Z'),
        },
        {
          id: 'held-1', orderNo: 'ERR-HELD', regionId: 'region-1', riderId: 'rider-2',
          status: 'arrived', receiptConfirmDeadline: new Date('2026-07-20T03:59:00.000Z'), createdAt: new Date('2026-07-19T03:00:00.000Z'),
        },
      ]) },
      errandRewardPunish: { findMany: jest.fn().mockResolvedValue([{ regionId: 'region-1', timeoutMinutes: 30 }]) },
      paymentRefund: { findMany: jest.fn().mockResolvedValue([{
        id: 'refund-1', status: 'failed', failReason: '微信退款失败', payment: { bizId: 'refund-order-1', orderNo: 'ERR-REFUND' },
      }]) },
      deliveryRiskEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: `risk-${data.eventType}`, ...data })),
      },
    };
    const alertService = new ErrandLifecycleService(alertPrisma);

    await expect((alertService as any).scanActionableRisks(now)).resolves.toEqual({ checked: 4, created: 4 });
    expect(alertPrisma.deliveryRiskEvent.create.mock.calls.map((call: any[]) => call[0].data.eventType)).toEqual([
      'unaccepted_timeout', 'delivery_overdue', 'auto_receipt_hold', 'refund_failed',
    ]);
  });
});
