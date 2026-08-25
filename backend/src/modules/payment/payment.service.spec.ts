import { PaymentService } from './payment.service';

const createService = () => {
  const tx = {
    paymentRefund: {
      updateMany: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    paymentOrder: { findUnique: jest.fn(), update: jest.fn() },
    platformLedger: { create: jest.fn() },
    order: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    },
    orderLog: { create: jest.fn() },
    product: { updateMany: jest.fn() },
    sKU: { updateMany: jest.fn() },
    productModifierOption: { updateMany: jest.fn() },
    errandOrder: { count: jest.fn().mockResolvedValue(0), update: jest.fn() },
    regionRider: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    couponReceive: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    coupon: { update: jest.fn() },
    subsidyLedger: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    merchantSettlement: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn(),
    },
    riderSettlement: { update: jest.fn() },
    riderSettlementItem: {
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    riderLiability: { upsert: jest.fn() },
    deliveryRiskEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'risk-1' }),
    },
    orderAppeal: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    orderAppealEvent: { create: jest.fn() },
    mallOrder: { update: jest.fn() },
    mallRefund: { updateMany: jest.fn() },
    membershipOrder: { update: jest.fn() },
    wallet: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({ balance: 20 }),
      upsert: jest.fn().mockResolvedValue({ balance: 32.5 }),
    },
    walletTransaction: { create: jest.fn() },
    recharge: { findUnique: jest.fn(), update: jest.fn() },
  };
  const prisma = {
    order: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
    errandOrder: { update: jest.fn(), findUnique: jest.fn() },
    orderLog: { create: jest.fn() },
    paymentOrder: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn(),
    },
    paymentRefund: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    paymentReservationRelease: { upsert: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn((handler: any) => handler(tx)),
    adminOperationLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const membershipService = {
    revokeMembershipOrder: jest.fn().mockResolvedValue({ revoked: true }),
    restoreBenefitUsagesForTarget: jest.fn().mockResolvedValue({ restored: 1 }),
  };
  const notifyService = { createAndDispatch: jest.fn().mockResolvedValue({}) };
  const service = new PaymentService(
    { get: jest.fn() } as any,
    prisma as any,
    {
      getLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    } as any,
    notifyService as any,
    membershipService as any,
  );
  return { prisma, service, tx, membershipService, notifyService };
};

describe('PaymentService terminal state and retry identity', () => {
  it('credits recharge exactly once and stores the resulting wallet balance in the ledger', async () => {
    const { service, tx } = createService();
    tx.recharge.findUnique.mockResolvedValue({
      id: 'recharge-1',
      userId: 'user-1',
      amount: 12.5,
      orderNo: 'REC1',
      channel: 'WX_PAY',
    });

    await (service as any).updateBizOrder(tx, {
      bizType: 'recharge',
      bizId: 'recharge-1',
    });

    expect(tx.recharge.update).toHaveBeenCalledWith({
      where: { id: 'recharge-1' },
      data: expect.objectContaining({ status: 'success' }),
    });
    expect(tx.wallet.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        update: { balance: { increment: 12.5 }, totalIn: { increment: 12.5 } },
      }),
    );
    expect(tx.walletTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderNo: 'REC1',
        amount: 12.5,
        balance: 32.5,
        status: 'SUCCESS',
      }),
    });
  });

  it('cancels a zero-pay shop order without calling a payment channel', async () => {
    const { prisma, service, tx, membershipService, notifyService } = createService();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ORD-1',
      userId: 'user-1',
      status: 'PAID',
      payAmount: 0,
      merchantAcceptTime: null,
      refundStatus: 'none',
      stockReserved: true,
      items: [{ productId: 'product-1', quantity: 1, modifierSelections: [] }],
    });

    await expect(service.cancelFreeShopOrder('order-1', '用户取消', 'user-1', 'user')).resolves.toEqual({ success: true, message: '订单已取消，无需退款' });
    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'order-1',
          status: 'PAID',
          payAmount: 0,
          stockReserved: true,
        }),
        data: expect.objectContaining({
          status: 'CANCELLED',
          stockReserved: false,
        }),
      }),
    );
    expect(tx.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { stock: { increment: 1 }, saleCount: { decrement: 1 } },
      }),
    );
    expect(membershipService.restoreBenefitUsagesForTarget).toHaveBeenCalledWith('shop_order', 'order-1', tx);
    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        scene: 'shop_order_cancelled',
      }),
    );
  });

  it('notifies a regular takeaway merchant after payment succeeds', async () => {
    const { prisma, service, notifyService } = createService();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ORD-1',
      status: 'PAID',
      merchantAcceptTime: null,
      refundStatus: 'none',
      businessType: 'takeaway',
      payAmount: 12,
      user: { nickname: '用户' },
      merchant: {
        id: 'merchant-1',
        userId: 'merchant-user',
        regionId: 'region-1',
      },
      items: [{ id: 'item-1' }],
    });

    await (service as any).notifyShopMerchant('order-1');

    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'merchant-user',
        scene: 'new_takeaway_order',
        title: '商家有新外卖订单',
      }),
    );
  });

  it('marks a due scheduled order as notified when payment already reaches its fulfillment time', async () => {
    const { prisma, service } = createService();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ORD-1',
      status: 'PAID',
      merchantAcceptTime: null,
      refundStatus: 'none',
      businessType: 'takeaway',
      payAmount: 12,
      fulfillmentStartTime: new Date(Date.now() - 60 * 1000),
      user: { nickname: '用户' },
      merchant: {
        id: 'merchant-1',
        userId: 'merchant-user',
        regionId: 'region-1',
      },
      items: [],
    });

    await (service as any).notifyShopMerchant('order-1');

    expect(prisma.orderLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order-1',
          action: 'SCHEDULED_MERCHANT_NOTIFY',
        }),
      }),
    );
  });

  it('does not notify a merchant after the paid order has entered a refund state', async () => {
    const { prisma, service, notifyService } = createService();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ORD-1',
      status: 'PAID',
      merchantAcceptTime: null,
      refundStatus: 'refunding',
      businessType: 'takeaway',
      payAmount: 12,
      user: { nickname: '用户' },
      merchant: {
        id: 'merchant-1',
        userId: 'merchant-user',
        regionId: 'region-1',
      },
      items: [],
    });

    await (service as any).notifyShopMerchant('order-1');

    expect(notifyService.createAndDispatch).not.toHaveBeenCalled();
  });

  it('notifies the buyer after a takeaway refund succeeds', async () => {
    const { service, notifyService } = createService();

    await (service as any).notifyShopRefundSuccess(
      {
        bizType: 'order',
        bizId: 'order-1',
        paymentNo: 'PAY-1',
        userId: 'user-1',
      },
      12.5,
    );

    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        scene: 'shop_order_refund_success',
        title: '外卖退款成功',
        linkValue: '/pagesA/order/order-detail/order-detail?id=order-1',
      }),
    );
  });

  it('notifies the buyer after a run-errand refund succeeds', async () => {
    const { service, notifyService } = createService();

    await (service as any).notifyShopRefundSuccess(
      {
        bizType: 'errand_order',
        bizId: 'errand-1',
        paymentNo: 'PAY-1',
        userId: 'user-1',
      },
      8.8,
    );

    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        scene: 'errand_order_refund_success',
        linkValue: '/pagesA/order/errand-detail/errand-detail?id=errand-1',
      }),
    );
  });

  it('tells an assigned rider whether a run-errand partial refund resumes fulfillment', async () => {
    const { prisma, service, notifyService } = createService();
    prisma.errandOrder.findUnique.mockResolvedValue({
      id: 'errand-1',
      orderNo: 'ERR-1',
      riderId: 'rider-1',
      regionId: 'region-1',
      refundStatus: 'partial',
    });

    await (service as any).notifyShopRefundSuccess(
      {
        bizType: 'errand_order',
        bizId: 'errand-1',
        paymentNo: 'PAY-1',
        userId: 'user-1',
      },
      3.5,
    );

    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'rider-1',
        scene: 'errand_order_refund_rider_success',
        title: '跑腿订单部分退款完成',
        content: expect.stringContaining('继续履约'),
      }),
    );
  });

  it('also tells the merchant which refunded order may affect settlement', async () => {
    const { prisma, service, notifyService } = createService();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ORD-1',
      merchantId: 'merchant-1',
      riderId: 'rider-1',
      refundStatus: 'refunded',
      merchant: { userId: 'merchant-user', regionId: 'region-1' },
    });

    await (service as any).notifyShopRefundSuccess(
      {
        bizType: 'order',
        bizId: 'order-1',
        paymentNo: 'PAY-1',
        userId: 'user-1',
      },
      12.5,
    );

    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'merchant-user',
        scene: 'shop_order_refund_merchant_notice',
        content: expect.stringContaining('订单 ORD-1 已退款'),
        linkValue: '/pagesA/MerchantManagement/Order?merchant_id=merchant-1',
      }),
    );
    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'rider-1',
        scene: 'shop_order_refund_rider_success',
        title: '配送订单已退款',
      }),
    );
  });

  it('tells the buyer that the merchant could not accept when a merchant rejection refund succeeds', async () => {
    const { service, notifyService } = createService();

    await (service as any).notifyShopRefundSuccess(
      {
        bizType: 'order',
        bizId: 'order-1',
        paymentNo: 'PAY-1',
        userId: 'user-1',
      },
      12.5,
      '商家拒单：食材售罄',
    );

    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '商家无法接单，退款成功',
        data: expect.objectContaining({ merchantRejected: true }),
      }),
    );
  });

  it('refunds a takeaway payment that arrives after the buyer cancelled the pending order', async () => {
    const { prisma, service, tx, notifyService } = createService();
    const payment = {
      id: 'payment-1',
      paymentNo: 'PAY-1',
      bizType: 'order',
      bizId: 'order-1',
      amount: 12,
      status: 'pending',
    };
    prisma.paymentOrder.findUnique.mockResolvedValue(payment);
    tx.order.updateMany.mockResolvedValue({ count: 0 });
    tx.order.findUnique.mockResolvedValue({ status: 'CANCELLED' });
    const refund = jest.spyOn(service, 'refund').mockResolvedValue({
      success: true,
      refundNo: 'REF-1',
      status: 'processing',
    });

    await (service as any).handlePaymentSuccess('PAY-1', 'WX-1');

    expect(refund).toHaveBeenCalledWith({
      bizType: 'order',
      bizId: 'order-1',
      amount: 12,
      reason: '订单取消后支付成功自动退款',
    });
    expect(notifyService.createAndDispatch).not.toHaveBeenCalled();
  });

  it('tells the buyer when a failed takeaway refund is available to retry', async () => {
    const { service, notifyService } = createService();

    await (service as any).notifyShopRefundFailure({
      bizType: 'order',
      bizId: 'order-1',
      paymentNo: 'PAY-1',
      userId: 'user-1',
    });

    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        scene: 'shop_order_refund_failed',
        title: '外卖退款未完成',
        linkValue: '/pagesA/order/order-detail/order-detail?id=order-1',
      }),
    );
  });

  it('immediately tells the non-initiating merchant that a buyer refund has paused fulfillment', async () => {
    const { prisma, service, notifyService } = createService();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ORD-1',
      merchantId: 'merchant-1',
      riderId: 'rider-1',
      merchant: { userId: 'merchant-user', regionId: 'region-1' },
    });

    await (service as any).notifyShopRefundProcessing(
      {
        bizType: 'order',
        bizId: 'order-1',
        paymentNo: 'PAY-1',
        userId: 'user-1',
      },
      12.5,
      '用户取消',
      'user-1',
    );

    expect(notifyService.createAndDispatch).toHaveBeenCalledTimes(2);
    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'merchant-user',
        scene: 'shop_order_refund_processing',
        content: expect.stringContaining('暂停履约'),
      }),
    );
    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'rider-1',
        scene: 'shop_order_refund_rider_processing',
        content: expect.stringContaining('暂停取货'),
      }),
    );
  });

  it('publishes a processing notice only when WeChat has not yet returned a refund terminal state', async () => {
    const { prisma, service, tx } = createService();
    const payment = {
      id: 'payment-1',
      amount: 12.5,
      refundedAmount: 0,
      bizType: 'order',
      bizId: 'order-1',
      wxTransId: 'WX-1',
      status: 'paid',
      userId: 'user-1',
    };
    prisma.paymentOrder.findFirst.mockResolvedValue(payment);
    prisma.paymentRefund.create.mockResolvedValue({
      id: 'refund-1',
      refundNo: 'REF-1',
    });
    tx.paymentRefund.updateMany.mockResolvedValue({ count: 1 });
    jest.spyOn(service as any, 'getWxPayConfig').mockResolvedValue({ mchid: 'mch-id' });
    jest.spyOn(service as any, 'wxPayRequest').mockResolvedValue({ status: 'PROCESSING', refund_id: 'WX-REF-1' });
    const notify = jest.spyOn(service as any, 'notifyShopRefundProcessing').mockResolvedValue(undefined);

    await expect(
      (service as any).refundUnlocked({
        bizType: 'order',
        bizId: 'order-1',
        amount: 12.5,
        reason: '用户取消',
        operatorId: 'user-1',
      }),
    ).resolves.toEqual(expect.objectContaining({ success: true, status: 'processing' }));

    expect(notify).toHaveBeenCalledWith(payment, 12.5, '用户取消', 'user-1');
  });

  it('does not create another refund while the payment has an in-flight refund', async () => {
    const { prisma, service } = createService();
    prisma.paymentOrder.findFirst.mockResolvedValue({
      id: 'payment-1',
      amount: 20,
      refundedAmount: 0,
      bizType: 'order',
      bizId: 'order-1',
      status: 'refunding',
    });
    prisma.paymentRefund.count.mockResolvedValue(1);

    await expect(
      (service as any).refundUnlocked({
        bizType: 'order',
        bizId: 'order-1',
        amount: 10,
        reason: '用户取消',
        operatorId: 'user-1',
      }),
    ).rejects.toThrow('已有退款在处理中，请等待退款结果');

    expect(prisma.paymentRefund.create).not.toHaveBeenCalled();
  });

  it('refunds a balance payment without calling WeChat', async () => {
    const { prisma, service, tx } = createService();
    const payment = {
      id: 'payment-1',
      paymentNo: 'PAY-1',
      orderNo: 'ERR-1',
      amount: 8,
      refundedAmount: 0,
      bizType: 'errand_order',
      bizId: 'errand-1',
      status: 'paid',
      channel: 'balance',
      userId: 'user-1',
    };
    prisma.paymentOrder.findFirst.mockResolvedValue(payment);
    prisma.paymentRefund.create.mockResolvedValue({
      id: 'refund-1',
      refundNo: 'REF-1',
    });
    tx.paymentRefund.updateMany.mockResolvedValue({ count: 1 });
    tx.paymentOrder.update.mockResolvedValue({});
    tx.errandOrder.update.mockResolvedValue({});
    tx.platformLedger.create.mockResolvedValue({});
    const wxPayRequest = jest.spyOn(service as any, 'wxPayRequest');
    jest.spyOn(service as any, 'notifyShopRefundSuccess').mockResolvedValue(undefined);

    await expect(
      (service as any).refundUnlocked({
        bizType: 'errand_order',
        bizId: 'errand-1',
        amount: 8,
        reason: '用户取消',
        operatorId: 'user-1',
      }),
    ).resolves.toEqual(expect.objectContaining({ success: true, status: 'success' }));

    expect(wxPayRequest).not.toHaveBeenCalled();
    expect(tx.wallet.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { balance: { increment: 8 }, totalIn: { increment: 8 } },
    });
    expect(tx.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'REFUND',
          channel: 'BALANCE',
          amount: 8,
          balance: 20,
        }),
      }),
    );
  });

  it('only returns an expired payment for release after WeChat confirms NOTPAY', async () => {
    const { prisma, service } = createService();
    const candidate = {
      id: 'payment-1',
      paymentNo: 'PAY-1',
      status: 'paying',
      expireTime: new Date(Date.now() - 60_000),
    };
    prisma.paymentOrder.findMany.mockResolvedValue([candidate]);
    prisma.paymentOrder.findUnique.mockResolvedValueOnce(candidate).mockResolvedValueOnce({ ...candidate, status: 'closed' });
    jest.spyOn(service as any, 'getWxPayConfig').mockResolvedValue({ mchid: 'mch-id' });
    jest.spyOn(service as any, 'wxPayRequest').mockResolvedValue({ trade_state: 'NOTPAY' });

    await expect(service.reconcileExpiredPayments()).resolves.toEqual([expect.objectContaining({ id: 'payment-1', status: 'closed' })]);
    expect(prisma.paymentOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'payment-1', status: { in: ['pending', 'paying'] } },
      data: { status: 'closed' },
    });
  });

  it('does not close an unexpired NOTPAY order', async () => {
    const { prisma, service } = createService();
    prisma.paymentOrder.findUnique.mockResolvedValue({
      id: 'payment-1',
      paymentNo: 'PAY-1',
      bizType: 'mall_order',
      status: 'paying',
      expireTime: new Date(Date.now() + 60_000),
    });

    await (service as any).syncPaymentTerminalState('PAY-1', 'NOTPAY');

    expect(prisma.paymentOrder.update).not.toHaveBeenCalled();
  });

  it('closes an expired NOTPAY order', async () => {
    const { prisma, service } = createService();
    prisma.paymentOrder.findUnique.mockResolvedValue({
      id: 'payment-1',
      paymentNo: 'PAY-1',
      bizType: 'mall_order',
      status: 'paying',
      expireTime: new Date(Date.now() - 60_000),
    });

    await (service as any).syncPaymentTerminalState('PAY-1', 'NOTPAY');

    expect(prisma.paymentOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'payment-1', status: { in: ['pending', 'paying'] } },
      data: { status: 'closed' },
    });
    expect(prisma.paymentReservationRelease.upsert).toHaveBeenCalledWith({
      where: { paymentId: 'payment-1' },
      create: { paymentId: 'payment-1' },
      update: {},
    });
  });

  it('returns the existing active payment number during a retry', async () => {
    const { prisma, service } = createService();
    const expireTime = new Date(Date.now() + 5 * 60_000);
    prisma.paymentOrder.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'payment-1',
      paymentNo: 'PAY-EXISTING',
      status: 'paying',
      expireTime,
    });
    jest.spyOn(service as any, 'getWxPayConfig').mockResolvedValue({
      appid: 'app-id',
      mchid: 'mch-id',
      notifyUrl: 'https://example.test/notify',
    });
    jest.spyOn(service as any, 'wxPayRequest').mockResolvedValue({ prepay_id: 'prepay-id' });
    jest.spyOn(service as any, 'generatePaySign').mockReturnValue('pay-sign');

    const result = await (service as any).wxUnifiedOrderUnlocked({
      bizType: 'order',
      bizId: 'order-1',
      orderNo: 'ORDER-1',
      amount: 1,
      description: 'test',
      openid: 'openid',
      userId: 'user-1',
    });

    expect(result.paymentNo).toBe('PAY-EXISTING');
    expect(prisma.paymentOrder.create).not.toHaveBeenCalled();
    expect((service as any).wxPayRequest).toHaveBeenCalledWith(
      'POST',
      '/v3/pay/transactions/jsapi',
      expect.objectContaining({
        time_expire: (service as any).formatRfc3339(expireTime),
      }),
      expect.anything(),
    );
  });

  it('creates a new payment only after an expired payment is confirmed closed', async () => {
    const { prisma, service } = createService();
    const oldPayment = {
      id: 'payment-old',
      paymentNo: 'PAY-OLD',
      bizType: 'mall_order',
      status: 'paying',
      expireTime: new Date(Date.now() - 60_000),
    };
    const newPayment = {
      id: 'payment-new',
      paymentNo: 'PAY-NEW',
      status: 'pending',
      expireTime: new Date(Date.now() + 15 * 60_000),
    };
    prisma.paymentOrder.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(oldPayment);
    prisma.paymentOrder.findUnique.mockResolvedValueOnce(oldPayment).mockResolvedValueOnce({ ...oldPayment, status: 'closed' });
    prisma.paymentOrder.create.mockResolvedValue(newPayment);
    jest.spyOn(service as any, 'getWxPayConfig').mockResolvedValue({
      appid: 'app-id',
      mchid: 'mch-id',
      notifyUrl: 'https://example.test/notify',
    });
    jest
      .spyOn(service as any, 'wxPayRequest')
      .mockResolvedValueOnce({ trade_state: 'NOTPAY' })
      .mockResolvedValueOnce({ prepay_id: 'prepay-id' });
    jest.spyOn(service as any, 'generatePaySign').mockReturnValue('pay-sign');

    const result = await (service as any).wxUnifiedOrderUnlocked({
      bizType: 'mall_order',
      bizId: 'order-1',
      orderNo: 'ORDER-1',
      amount: 1,
      description: 'test',
      openid: 'openid',
      userId: 'user-1',
    });

    expect(result.paymentNo).toBe('PAY-NEW');
    expect(prisma.paymentOrder.create).toHaveBeenCalledTimes(1);
  });

  it('does not release a reservation when the terminal transition loses its race', async () => {
    const { prisma, service } = createService();
    prisma.paymentOrder.findUnique.mockResolvedValue({
      id: 'payment-1',
      paymentNo: 'PAY-1',
      bizType: 'mall_order',
      status: 'paying',
      expireTime: new Date(Date.now() - 60_000),
    });
    prisma.paymentOrder.updateMany.mockResolvedValue({ count: 0 });

    await (service as any).syncPaymentTerminalState('PAY-1', 'NOTPAY');

    expect(prisma.paymentReservationRelease.upsert).not.toHaveBeenCalled();
  });
});

describe('PaymentService refund amount validation', () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid refund amount %p', (amount) => {
    const { service } = createService();

    expect(() => (service as any).validateRefundAmount(amount, 10_000)).toThrow('退款金额必须为正数');
  });

  it('rejects amounts with more than two decimal places', () => {
    const { service } = createService();

    expect(() => (service as any).validateRefundAmount(1.001, 10_000)).toThrow('退款金额最多支持两位小数');
  });

  it('rejects amounts above the remaining refundable amount', () => {
    const { service } = createService();

    expect(() => (service as any).validateRefundAmount(10.01, 1_000)).toThrow('退款金额超过可退金额');
  });

  it('returns a normalized two-decimal amount', () => {
    const { service } = createService();

    expect((service as any).validateRefundAmount(10.5, 2_000)).toBe(10.5);
  });
});

describe('PaymentService refund terminal failures', () => {
  it.each([
    ['order', 'order-1', 'shop_order_refund_rejected', 'order'],
    ['errand_order', 'errand-1', 'errand_order_refund_rejected', 'errandOrder'],
  ])('reopens a rejected %s refund and notifies its buyer', async (bizType, bizId, scene, model) => {
    const { prisma, service, notifyService } = createService();
    prisma.paymentRefund.findUnique.mockResolvedValue({
      id: 'refund-1',
      paymentId: 'payment-1',
      status: 'pending',
      payment: {
        bizType,
        bizId,
        paymentNo: 'PAY-1',
        userId: 'user-1',
        refundedAmount: 0,
      },
    });

    await expect(service.rejectRefundById('refund-1', '凭证不充分', 'admin-1')).resolves.toEqual({ success: true });

    expect(prisma.paymentRefund.updateMany).toHaveBeenCalledWith({
      where: { id: 'refund-1', status: 'pending' },
      data: { status: 'failed', failReason: '凭证不充分' },
    });
    expect((prisma as any)[model].update).toHaveBeenCalledWith({
      where: { id: bizId },
      data: { refundStatus: 'none', refundAmount: null },
    });
    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', scene }));
  });

  it('tells the merchant and assigned rider when a takeaway refund is rejected', async () => {
    const { prisma, service, notifyService } = createService();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ORD-1',
      merchantId: 'merchant-1',
      riderId: 'rider-1',
      merchant: { userId: 'merchant-user', regionId: 'region-1' },
    });

    await (service as any).notifyShopRefundRejected(
      {
        bizType: 'order',
        bizId: 'order-1',
        paymentNo: 'PAY-1',
        userId: 'user-1',
      },
      '凭证不充分',
    );

    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'merchant-user',
        scene: 'shop_order_refund_merchant_rejected',
        content: expect.stringContaining('恢复履约'),
      }),
    );
    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'rider-1',
        scene: 'shop_order_refund_rider_rejected',
        content: expect.stringContaining('恢复配送'),
      }),
    );
  });

  it.each(['ABNORMAL', 'CLOSED'])('marks a %s callback as failed and reopens an unrefunded takeaway', async (refundStatus) => {
    const { prisma, service, notifyService } = createService();
    prisma.paymentRefund.findFirst.mockResolvedValue({
      paymentId: 'payment-1',
      payment: {
        bizType: 'order',
        bizId: 'order-1',
        paymentNo: 'PAY-1',
        userId: 'user-1',
        refundedAmount: 0,
      },
    });

    await (service as any).handleRefundFailure('REF-1', refundStatus);

    expect(prisma.paymentRefund.updateMany).toHaveBeenCalledWith({
      where: { refundNo: 'REF-1', status: { in: ['pending', 'processing'] } },
      data: { status: 'failed', failReason: `微信退款${refundStatus}` },
    });
    expect(prisma.paymentOrder.update).not.toHaveBeenCalled();
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { refundStatus: 'none', refundAmount: null },
    });
    expect(prisma.orderLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'REFUND_FAILED',
          orderId: 'order-1',
        }),
      }),
    );
    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        scene: 'shop_order_refund_failed',
      }),
    );
  });

  it('tells the merchant when a takeaway refund fails and no settlement adjustment is created', async () => {
    const { prisma, service, notifyService } = createService();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ORD-1',
      merchantId: 'merchant-1',
      merchant: { userId: 'merchant-user', regionId: 'region-1' },
    });

    await (service as any).notifyShopRefundFailure({
      bizType: 'order',
      bizId: 'order-1',
      paymentNo: 'PAY-1',
      userId: 'user-1',
    });

    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'merchant-user',
        scene: 'shop_order_refund_merchant_failed',
        content: expect.stringContaining('本次不会产生退款调整'),
        linkValue: '/pagesA/MerchantManagement/Order?merchant_id=merchant-1',
      }),
    );
  });

  it('keeps the order refunding while another refund is still processing', async () => {
    const { prisma, service } = createService();
    prisma.paymentRefund.findFirst.mockResolvedValue({
      paymentId: 'payment-1',
      payment: { bizType: 'order', bizId: 'order-1', refundedAmount: 0 },
    });
    prisma.paymentRefund.count.mockResolvedValue(1);

    await (service as any).handleRefundFailure('REF-1', 'CLOSED');

    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('reopens an unrefunded errand and notifies its buyer when its refund callback fails', async () => {
    const { prisma, service, notifyService } = createService();
    prisma.paymentRefund.findFirst.mockResolvedValue({
      paymentId: 'payment-1',
      payment: {
        bizType: 'errand_order',
        bizId: 'errand-1',
        paymentNo: 'PAY-1',
        userId: 'user-1',
        refundedAmount: 0,
      },
    });

    await (service as any).handleRefundFailure('REF-1', 'CLOSED');

    expect(prisma.errandOrder.update).toHaveBeenCalledWith({
      where: { id: 'errand-1' },
      data: { refundStatus: 'none', refundAmount: null },
    });
    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        scene: 'errand_order_refund_failed',
      }),
    );
  });
});

describe('PaymentService refund settlement races', () => {
  it('does not settle again when executeRefund loses the refund-state transition', async () => {
    const { prisma, service, tx } = createService();
    prisma.paymentRefund.findUnique.mockResolvedValue({
      id: 'refund-1',
      refundNo: 'REF-1',
      paymentId: 'payment-1',
      amount: 10,
      status: 'pending',
      payment: {
        id: 'payment-1',
        amount: 100,
        refundedAmount: 0,
        bizType: 'order',
        bizId: 'order-1',
        wxTransId: 'WX-1',
        status: 'paid',
      },
    });
    tx.paymentRefund.updateMany.mockResolvedValue({ count: 0 });
    jest.spyOn(service as any, 'getWxPayConfig').mockResolvedValue({ mchid: 'mch-id' });
    jest.spyOn(service as any, 'wxPayRequest').mockResolvedValue({ status: 'SUCCESS', refund_id: 'WX-REF-1' });

    await service.executeRefund('refund-1');

    expect(tx.paymentOrder.update).not.toHaveBeenCalled();
    expect(tx.platformLedger.create).not.toHaveBeenCalled();
  });

  it('notifies both parties only after an audited refund claims the pending state', async () => {
    const { prisma, service, tx } = createService();
    const payment = {
      id: 'payment-1',
      amount: 100,
      refundedAmount: 0,
      bizType: 'order',
      bizId: 'order-1',
      wxTransId: 'WX-1',
      status: 'paid',
      userId: 'user-1',
    };
    prisma.paymentRefund.findUnique.mockResolvedValue({
      id: 'refund-1',
      refundNo: 'REF-1',
      paymentId: 'payment-1',
      amount: 10,
      status: 'pending',
      reason: '配送异常',
      payment,
    });
    tx.paymentRefund.updateMany.mockResolvedValue({ count: 1 });
    tx.paymentOrder.update.mockResolvedValue({});
    tx.order.update.mockResolvedValue({});
    tx.orderLog.create.mockResolvedValue({});
    tx.platformLedger.create.mockResolvedValue({});
    jest.spyOn(service as any, 'getWxPayConfig').mockResolvedValue({ mchid: 'mch-id' });
    jest.spyOn(service as any, 'wxPayRequest').mockResolvedValue({ status: 'SUCCESS', refund_id: 'WX-REF-1' });
    const notify = jest.spyOn(service as any, 'notifyShopRefundSuccess').mockResolvedValue(undefined);

    await service.executeRefund('refund-1');

    expect(notify).toHaveBeenCalledWith(payment, 10, '配送异常');
  });

  it('reopens the business order when an audited pending refund cannot be executed', async () => {
    const { prisma, service } = createService();
    prisma.paymentRefund.findUnique.mockResolvedValue({
      id: 'refund-1',
      refundNo: 'REF-1',
      paymentId: 'payment-1',
      amount: 10,
      status: 'pending',
      payment: {
        id: 'payment-1',
        amount: 10,
        refundedAmount: 0,
        bizType: 'order',
        bizId: 'order-1',
        status: 'paid',
      },
    });
    prisma.paymentRefund.findFirst.mockResolvedValue({
      paymentId: 'payment-1',
      payment: {
        bizType: 'order',
        bizId: 'order-1',
        paymentNo: 'PAY-1',
        userId: 'user-1',
        refundedAmount: 0,
      },
    });
    jest.spyOn(service as any, 'getWxPayConfig').mockRejectedValue(new Error('微信退款配置不可用'));

    await expect(service.executeRefund('refund-1')).rejects.toThrow('退款失败: 微信退款配置不可用');

    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { refundStatus: 'none', refundAmount: null },
    });
  });

  it('records one platform refund ledger when a processing refund succeeds by callback', async () => {
    const { prisma, service, tx } = createService();
    prisma.paymentRefund.findFirst.mockResolvedValue({
      id: 'refund-1',
      refundNo: 'REF-1',
      paymentId: 'payment-1',
      amount: 10,
      reason: 'test',
      status: 'processing',
    });
    tx.paymentRefund.updateMany.mockResolvedValue({ count: 1 });
    tx.paymentOrder.findUnique.mockResolvedValue({
      id: 'payment-1',
      amount: 100,
      refundedAmount: 0,
      bizType: 'order',
      bizId: 'order-1',
    });

    await (service as any).handleRefundSuccess('REF-1', 'WX-REF-1');

    expect(tx.platformLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderNo: 'REF-1',
        channel: 'wx_pay',
        status: 'completed',
      }),
    });
  });
});

describe('AUD-P1-051 membership refund closure', () => {
  it('marks the membership order refunded and revokes only its linked membership', async () => {
    const { service, tx, membershipService } = createService();

    await (service as any).markBizRefunded(tx, 'membership_order', 'membership-order-1', 19.9);

    expect(tx.membershipOrder.update).toHaveBeenCalledWith({
      where: { id: 'membership-order-1' },
      data: { status: 'refunded' },
    });
    expect(membershipService.revokeMembershipOrder).toHaveBeenCalledWith('membership-order-1', '退款成功', tx);
  });
});

describe('PaymentService mall after-sale closure', () => {
  it('marks only a processing mall after-sale record refunded after payment settlement', async () => {
    const { service, tx } = createService();

    await (service as any).markBizRefunded(tx, 'mall_order', 'mall-order-1', 10);

    expect(tx.mallRefund.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: 'mall-order-1', status: 'processing' },
        data: expect.objectContaining({ status: 'refunded' }),
      }),
    );
  });
});

describe('PaymentService manual refund completion', () => {
  it('settles the refund, payment, ledger, business order, and audit log together', async () => {
    const { prisma, service, tx } = createService();
    prisma.paymentRefund.findUnique.mockResolvedValue({
      id: 'refund-1',
      refundNo: 'REF-1',
      paymentId: 'payment-1',
      amount: 10,
      status: 'processing',
    });
    tx.paymentRefund.updateMany.mockResolvedValue({ count: 1 });
    tx.paymentOrder.findUnique.mockResolvedValue({
      id: 'payment-1',
      amount: 100,
      refundedAmount: 0,
      bizType: 'order',
      bizId: 'order-1',
    });
    tx.paymentOrder.update.mockResolvedValue({});
    tx.platformLedger.create.mockResolvedValue({});
    tx.order.update.mockResolvedValue({});
    tx.orderLog.create.mockResolvedValue({});
    const notify = jest.spyOn(service as any, 'notifyShopRefundSuccess').mockResolvedValue(undefined);

    await expect(service.completeRefundById('refund-1', 'admin-1', 'TRANSFER-1')).resolves.toEqual(expect.objectContaining({ success: true, refundNo: 'REF-1' }));

    expect(tx.paymentOrder.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: { refundedAmount: 10, status: 'refunding' },
    });
    expect(tx.platformLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderNo: 'REF-1',
        channel: 'admin_manual',
        status: 'completed',
      }),
    });
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { refundStatus: 'partial', refundAmount: 10 },
    });
    expect(tx.paymentRefund.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'refund-1', status: 'processing' },
      }),
    );
    expect(prisma.adminOperationLog.create).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ id: 'payment-1' }), 10, undefined);
  });

  it('keeps a partially refunded takeaway order in refunding', async () => {
    const { service, tx } = createService();

    await (service as any).markBizRefunded(tx, 'order', 'order-1', 6, false, 6);

    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { refundStatus: 'partial', refundAmount: 6 },
    });
  });

  it('keeps a partially refunded errand order on its fulfillment state', async () => {
    const { service, tx } = createService();

    await (service as any).markBizRefunded(tx, 'errand_order', 'errand-1', 6, false, 6);

    expect(tx.errandOrder.update).toHaveBeenCalledWith({
      where: { id: 'errand-1' },
      data: { refundStatus: 'partial', refundAmount: 6 },
    });
  });

  it('creates an idempotent rider liability when a settled errand is refunded', async () => {
    const { service, tx } = createService();
    tx.riderSettlementItem.findUnique.mockResolvedValue({
      id: 'item-1',
      riderId: 'rider-1',
      payableAmount: 8,
      status: 'included',
      settlement: { id: 'settlement-1', status: 'PAID' },
    });

    await (service as any).markBizRefunded(tx, 'errand_order', 'errand-1', 8, true, 8, 'refund-1');

    expect(tx.riderSettlementItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item-1', status: { in: ['included', 'adjusted'] } },
        data: expect.objectContaining({
          status: 'reversed',
          reversalAmount: 8,
        }),
      }),
    );
    expect(tx.riderLiability.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orderId_refundId: { orderId: 'errand-1', refundId: 'refund-1' },
        },
        create: expect.objectContaining({
          riderId: 'rider-1',
          orderId: 'errand-1',
          refundId: 'refund-1',
          amount: 8,
        }),
        update: {},
      }),
    );
  });

  it('keeps the user refund successful and opens a risk event when settlement reversal loses its race', async () => {
    const { service, tx } = createService();
    tx.riderSettlementItem.findUnique.mockResolvedValue({
      id: 'item-1',
      riderId: 'rider-1',
      payableAmount: 8,
      status: 'included',
      settlement: { id: 'settlement-1', status: 'PAID' },
    });
    tx.riderSettlementItem.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect((service as any).markBizRefunded(tx, 'errand_order', 'errand-1', 8, true, 8, 'refund-1')).resolves.toBeUndefined();
    expect(tx.deliveryRiskEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'errand-1',
        orderType: 'errand',
        eventType: 'settlement_reversal_failed',
        eventLevel: 'critical',
      }),
    });
  });

  it('closes the linked appeal only after its payment refund succeeds', async () => {
    const { service, tx } = createService();
    tx.paymentRefund.findUnique.mockResolvedValue({
      sourceType: 'order_appeal',
      sourceId: 'appeal-1',
    });
    tx.orderAppeal.updateMany.mockResolvedValue({ count: 1 });

    await (service as any).markBizRefunded(tx, 'errand_order', 'errand-1', 8, true, 8, 'refund-1');

    expect(tx.orderAppeal.updateMany).toHaveBeenCalledWith({
      where: { id: 'appeal-1', status: 'processing' },
      data: { status: 'resolved', resolvedAt: expect.any(Date) },
    });
    expect(tx.orderAppealEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        appealId: 'appeal-1',
        action: 'refund_succeeded',
        status: 'resolved',
      }),
    });
  });

  it('deducts a completed order refund from its not-yet-paid merchant settlement', async () => {
    const { service, tx } = createService();
    const completeTime = new Date('2026-07-17T10:00:00.000Z');
    tx.order.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ORD-1',
      merchantId: 'merchant-1',
      status: 'COMPLETED',
      completeTime,
      totalAmount: 22,
      originalFreightAmount: 2,
      items: [],
    });
    tx.merchantSettlement.findFirst.mockResolvedValue({
      id: 'settlement-1',
      amount: 20,
      platformFee: 2,
      status: 'completed',
    });

    await (service as any).markBizRefunded(tx, 'order', 'order-1', 10, false, 10, 'refund-1');

    expect(tx.merchantSettlement.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'settlement-1',
        status: { in: ['pending', 'processing', 'completed', 'failed'] },
      },
      data: { amount: { decrement: 10 }, platformFee: { decrement: 1 } },
    });
    expect(tx.merchantSettlement.create).not.toHaveBeenCalled();
  });

  it('removes the full goods settlement for a full refund even when a coupon reduced the paid amount', async () => {
    const { service, tx } = createService();
    const completeTime = new Date('2026-07-17T10:00:00.000Z');
    tx.order.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ORD-1',
      merchantId: 'merchant-1',
      status: 'COMPLETED',
      completeTime,
      totalAmount: 22,
      originalFreightAmount: 2,
      items: [],
    });
    tx.merchantSettlement.findFirst.mockResolvedValue({
      id: 'settlement-1',
      amount: 20,
      platformFee: 2,
      status: 'completed',
    });

    await (service as any).markBizRefunded(tx, 'order', 'order-1', 10, true, 10, 'refund-1');

    expect(tx.merchantSettlement.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'settlement-1',
        status: { in: ['pending', 'processing', 'completed', 'failed'] },
      },
      data: {
        amount: { decrement: 20 },
        platformFee: { decrement: 2 },
        orderCount: { decrement: 1 },
      },
    });
  });

  it('only deducts the settlement balance left after an earlier partial refund becomes full', async () => {
    const { service, tx } = createService();
    const completeTime = new Date('2026-07-17T10:00:00.000Z');
    tx.order.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ORD-1',
      merchantId: 'merchant-1',
      status: 'COMPLETED',
      completeTime,
      totalAmount: 22,
      originalFreightAmount: 2,
      items: [],
    });
    tx.merchantSettlement.findFirst.mockResolvedValue({
      id: 'settlement-1',
      amount: 20,
      platformFee: 2,
      status: 'completed',
    });

    await (service as any).markBizRefunded(tx, 'order', 'order-1', 5, false, 5, 'refund-1');
    await (service as any).markBizRefunded(tx, 'order', 'order-1', 5, true, 10, 'refund-2');

    expect(tx.merchantSettlement.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: { amount: { decrement: 5 }, platformFee: { decrement: 0.5 } },
      }),
    );
    expect(tx.merchantSettlement.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: {
          amount: { decrement: 15 },
          platformFee: { decrement: 1.5 },
          orderCount: { decrement: 1 },
        },
      }),
    );
  });

  it('creates an auditable negative adjustment when a completed order was already paid to the merchant', async () => {
    const { service, tx } = createService();
    const completeTime = new Date('2026-07-17T10:00:00.000Z');
    tx.order.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ORD-1',
      merchantId: 'merchant-1',
      status: 'COMPLETED',
      completeTime,
      totalAmount: 22,
      originalFreightAmount: 2,
      items: [],
    });
    tx.merchantSettlement.findFirst.mockResolvedValue({
      id: 'settlement-1',
      amount: 20,
      platformFee: 2,
      status: 'paid',
    });

    await (service as any).markBizRefunded(tx, 'order', 'order-1', 10, false, 10, 'refund-1');

    expect(tx.merchantSettlement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          merchantId: 'merchant-1',
          amount: -10,
          platformFee: -1,
          status: 'pending',
          periodKey: 'refund-adjustment:refund-1',
        }),
      }),
    );
  });

  it('creates the refund adjustment when payout wins the settlement update race', async () => {
    const { service, tx } = createService();
    const completeTime = new Date('2026-07-17T10:00:00.000Z');
    tx.order.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ORD-1',
      merchantId: 'merchant-1',
      status: 'COMPLETED',
      completeTime,
      totalAmount: 22,
      originalFreightAmount: 2,
      items: [],
    });
    tx.merchantSettlement.findFirst
      .mockResolvedValueOnce({
        id: 'settlement-1',
        amount: 20,
        platformFee: 2,
        status: 'completed',
      })
      .mockResolvedValueOnce({
        id: 'settlement-1',
        amount: 20,
        platformFee: 2,
        status: 'paid',
      });
    tx.merchantSettlement.updateMany.mockResolvedValue({ count: 0 });

    await (service as any).markBizRefunded(tx, 'order', 'order-1', 10, false, 10, 'refund-1');

    expect(tx.merchantSettlement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: -10,
          platformFee: -1,
          periodKey: 'refund-adjustment:refund-1',
        }),
      }),
    );
  });

  it('moves a fully refunded takeaway order to REFUNDED and restores reserved benefits', async () => {
    const { service, tx, membershipService } = createService();
    tx.order.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ORD-1',
      userId: 'user-1',
      status: 'PAID',
      merchantAcceptTime: null,
      stockReserved: true,
      items: [
        {
          productId: 'product-1',
          skuId: 'sku-1',
          quantity: 2,
          modifierSelections: [{ optionId: 'extra-1', stockManaged: true }],
        },
      ],
    });
    tx.couponReceive.findFirst.mockResolvedValue({
      id: 'receive-1',
      couponId: 'coupon-1',
    });

    await (service as any).markBizRefunded(tx, 'order', 'order-1', 10, true, 10);

    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { status: 'REFUNDED', refundStatus: 'refunded', refundAmount: 10 },
    });
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', stockReserved: true },
      data: { stockReserved: false },
    });
    expect(tx.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'product-1' },
        data: { stock: { increment: 2 }, saleCount: { decrement: 2 } },
      }),
    );
    expect(tx.sKU.updateMany).toHaveBeenCalledWith({
      where: { id: 'sku-1' },
      data: { stock: { increment: 2 } },
    });
    expect(tx.productModifierOption.updateMany).toHaveBeenCalledWith({
      where: { id: 'extra-1', stock: { not: null } },
      data: { stock: { increment: 2 } },
    });
    expect(membershipService.restoreBenefitUsagesForTarget).toHaveBeenCalledWith('shop_order', 'order-1', tx);
    expect(tx.couponReceive.updateMany).toHaveBeenCalledWith({
      where: { id: 'receive-1', status: 'used' },
      data: { status: 'unused', usedAt: null, orderNo: null },
    });
    expect(tx.coupon.update).toHaveBeenCalledWith({
      where: { id: 'coupon-1' },
      data: { usedCount: { decrement: 1 } },
    });
  });

  it('does not release benefits or restock a partially refunded takeaway order that can still be fulfilled', async () => {
    const { service, tx, membershipService } = createService();
    tx.order.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ORD-1',
      userId: 'user-1',
      status: 'PAID',
      merchantAcceptTime: null,
      stockReserved: true,
      items: [{ productId: 'product-1', quantity: 1 }],
    });

    await (service as any).markBizRefunded(tx, 'order', 'order-1', 5, false, 5);

    expect(membershipService.restoreBenefitUsagesForTarget).not.toHaveBeenCalled();
    expect(tx.couponReceive.findFirst).not.toHaveBeenCalled();
    expect(tx.subsidyLedger.updateMany).not.toHaveBeenCalled();
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it('returns an assigned rider online after a full refund when no delivery remains', async () => {
    const { service, tx } = createService();
    tx.order.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ORD-1',
      riderId: 'rider-1',
      status: 'SHIPPED',
      items: [],
    });
    await (service as any).markBizRefunded(tx, 'order', 'order-1', 10, true, 10);

    expect(tx.regionRider.updateMany).toHaveBeenCalledWith({
      where: { userId: 'rider-1', verifyStatus: 'approved', status: 'busy' },
      data: { status: 'online' },
    });
  });

  it('does not restock an accepted order when an operator issues a compensating refund', async () => {
    const { service, tx } = createService();
    tx.order.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ORD-1',
      userId: 'user-1',
      status: 'SHIPPED',
      merchantAcceptTime: null,
      stockReserved: true,
      items: [{ productId: 'product-1', quantity: 1 }],
    });

    await (service as any).markBizRefunded(tx, 'order', 'order-1', 10, true, 10);

    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.couponReceive.findFirst).not.toHaveBeenCalled();
  });

  it('does not restock a delivered order after a full delivery-compensation refund', async () => {
    const { service, tx } = createService();
    tx.order.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ORD-1',
      userId: 'user-1',
      status: 'DELIVERED',
      merchantAcceptTime: new Date(),
      stockReserved: true,
      items: [{ productId: 'product-1', quantity: 1 }],
    });

    await (service as any).markBizRefunded(tx, 'order', 'order-1', 10, true, 10);

    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });
});
