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
    jest.spyOn(service, 'confirmReceipt').mockResolvedValue({ ...dueOrder, status: 'completed', receiptConfirmedBy: 'system' } as any);

    const result = await service.autoConfirmDueOrders(now);

    expect(result).toEqual({ checked: 1, completed: 1, held: 0 });
    expect(service.confirmReceipt).toHaveBeenCalledWith('order-1', 'user-1', 'system');
  });

  it.each(['user', 'admin', 'rider'])('扫描后已被%s确认的订单不计自动完成，也不误发系统通知', async source => {
    const notify: any = { createAndDispatch: jest.fn().mockResolvedValue({}) };
    service = new ErrandLifecycleService(prisma, undefined, notify);
    jest.spyOn(service, 'confirmReceipt').mockResolvedValue({ ...dueOrder, status: 'completed', receiptConfirmedBy: source } as any);
    await expect(service.autoConfirmDueOrders(now)).resolves.toEqual({ checked: 1, completed: 0, held: 0 });
    expect(notify.createAndDispatch).not.toHaveBeenCalled();
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

  function pagedDatabase(rows: any[]) {
    return {
      errandOrder: { findMany: jest.fn(async ({ where, take }: any) => rows.filter(row => {
        if (row.status !== 'arrived' || !row.receiptConfirmDeadline || row.receiptConfirmDeadline > where.receiptConfirmDeadline.lte) return false;
        if (!where.OR) return true;
        const after = where.OR[0].receiptConfirmDeadline.gt;
        return row.receiptConfirmDeadline > after || (+row.receiptConfirmDeadline === +after && row.id > where.OR[1].id.gt);
      }).slice(0, take)) },
      config: { findMany: jest.fn().mockResolvedValue([
        { key: 'errand.extended_config.disabled', value: { autoReceiptEnabled: false } },
      ]) },
      orderAppeal: { findMany: jest.fn(async ({ where }: any) => rows.filter(row => row.held && where.orderId.in.includes(row.id)).map(row => ({ orderId: row.id }))) },
      deliveryRiskEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
  }

  it('超过100个冻结或关闭校区的订单不会挡住后面的正常到期单', async () => {
    const rows = Array.from({ length: 202 }, (_, index) => ({
      ...dueOrder, id: `order-${String(index).padStart(4, '0')}`,
      held: index < 100, regionId: index >= 100 && index < 200 ? 'disabled' : 'region-1',
    }));
    rows.push({ ...dueOrder, id: 'legacy-null-deadline', receiptConfirmDeadline: null, held: false } as any);
    const db = pagedDatabase(rows);
    const scanner = new ErrandLifecycleService(db as any);
    const confirm = jest.spyOn(scanner, 'confirmReceipt').mockImplementation(async (id: string) => {
      const row = rows.find(row => row.id === id)!;
      row.status = 'completed';
      return { ...row, receiptConfirmedBy: 'system' } as any;
    });
    await expect(scanner.autoConfirmDueOrders(now)).resolves.toEqual({ checked: 202, completed: 2, held: 200 });
    expect(confirm.mock.calls.map(call => call[0])).toEqual(['order-0200', 'order-0201']);
    expect(rows.find(row => row.id === 'legacy-null-deadline')?.status).toBe('arrived');
    expect(db.errandOrder.findMany).toHaveBeenCalledTimes(3);
  });

  it('单轮上限1000条后把游标存入Redis，下一Worker实例继续处理后续并回到开头', async () => {
    const rows = Array.from({ length: 1002 }, (_, index) => ({
      ...dueOrder, id: `order-${String(index).padStart(4, '0')}`, held: index < 1001,
    }));
    const db = pagedDatabase(rows);
    let cursor: any = null;
    const redis: any = {
      getJson: jest.fn(async () => cursor),
      setJson: jest.fn(async (_key: string, value: any) => { cursor = value; }),
    };
    const first = new ErrandLifecycleService(db as any, redis);
    const firstConfirm = jest.spyOn(first, 'confirmReceipt').mockResolvedValue({ receiptConfirmedBy: 'system' } as any);
    await expect(first.autoConfirmDueOrders(now)).resolves.toEqual({ checked: 1000, completed: 0, held: 1000 });
    expect(firstConfirm).not.toHaveBeenCalled();
    expect(cursor.id).toBe('order-0999');
    const second = new ErrandLifecycleService(db as any, redis);
    const secondConfirm = jest.spyOn(second, 'confirmReceipt').mockResolvedValue({ receiptConfirmedBy: 'system' } as any);
    await expect(second.autoConfirmDueOrders(now)).resolves.toEqual({ checked: 2, completed: 1, held: 1 });
    expect(secondConfirm).toHaveBeenCalledWith('order-1001', 'user-1', 'system');
    expect(cursor).toBeNull();
    rows.splice(0, rows.length, { ...dueOrder, id: 'order-0001', held: false });
    await expect(second.autoConfirmDueOrders(now)).resolves.toEqual({ checked: 1, completed: 1, held: 0 });
    expect(secondConfirm).toHaveBeenLastCalledWith('order-0001', 'user-1', 'system');
  });

  it('配置读取失败时停止自动确认，不把暂时读取失败当成默认开启', async () => {
    prisma.config.findMany.mockRejectedValueOnce(new Error('config unavailable'));
    const confirm = jest.spyOn(service, 'confirmReceipt');
    await expect(service.autoConfirmDueOrders(now)).rejects.toThrow('config unavailable');
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
