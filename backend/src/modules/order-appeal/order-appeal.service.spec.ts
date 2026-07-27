import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { OrderAppealService } from "./order-appeal.service";

const createPrisma = () => ({
  order: { findMany: jest.fn(), findUnique: jest.fn() },
  errandOrder: { findMany: jest.fn(), findUnique: jest.fn() },
  orderAppeal: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  orderAppealEvent: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
  paymentOrder: { findFirst: jest.fn() },
  paymentRefund: { findFirst: jest.fn() },
  wallet: { upsert: jest.fn() },
  walletTransaction: { create: jest.fn() },
  riderSettlementItem: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
  riderSettlement: { update: jest.fn() },
  riderLiability: { upsert: jest.fn() },
});

describe("OrderAppealService", () => {
  const ownerOrder = {
    id: "order-1",
    orderNo: "O-1",
    userId: "user-1",
    status: "PAID",
    refundStatus: "none",
    payAmount: 18,
    createdAt: new Date(),
    merchant: { regionId: "region-1", name: "食堂", userId: "merchant-1" },
    items: [],
  };

  it("rejects an appeal for another user order", async () => {
    const prisma: any = createPrisma();
    prisma.order.findUnique.mockResolvedValue(ownerOrder);
    const service = new OrderAppealService(
      prisma,
      { createAndDispatch: jest.fn() } as any,
      { getAdminContext: jest.fn() } as any,
    );

    await expect(
      service.createAppeal("user-2", {
        orderType: "order",
        orderId: "order-1",
        appealType: "delivery_issue",
        description: "未收到",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("creates one appeal event and notifies both the owner and the affected merchant", async () => {
    const prisma: any = createPrisma();
    prisma.order.findUnique.mockResolvedValue(ownerOrder);
    prisma.orderAppeal.findUnique.mockResolvedValue(null);
    prisma.orderAppeal.create.mockResolvedValue({
      ...ownerOrder,
      id: "appeal-1",
      appealNo: "AP202607110001",
      status: "pending",
    });
    const notify = { createAndDispatch: jest.fn().mockResolvedValue({}) };
    const service = new OrderAppealService(
      prisma,
      notify as any,
      { getAdminContext: jest.fn() } as any,
    );

    await service.createAppeal("user-1", {
      orderType: "order",
      orderId: "order-1",
      appealType: "delivery_issue",
      description: "未收到",
      evidenceImages: ["/uploads/a.jpg"],
    });

    expect(prisma.orderAppeal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          regionId: "region-1",
          status: "pending",
        }),
      }),
    );
    expect(prisma.orderAppealEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "created", actorType: "user" }),
      }),
    );
    expect(notify.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        scene: "order_appeal_created",
      }),
    );
    expect(notify.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "merchant-1",
        scene: "order_appeal_created_merchant",
        linkValue: "/pagesA/order/appeal/merchant-appeal?appealId=appeal-1",
      }),
    );
  });

  it("keeps a requested historical order selectable even when it falls outside the recent list", async () => {
    const prisma: any = createPrisma();
    prisma.order.findMany.mockResolvedValue([]);
    prisma.errandOrder.findMany.mockResolvedValue([]);
    prisma.order.findUnique.mockResolvedValue({
      ...ownerOrder,
      id: "old-order-1",
      status: "DELIVERED",
    });
    const service = new OrderAppealService(
      prisma,
      { createAndDispatch: jest.fn() } as any,
      { getAdminContext: jest.fn() } as any,
    );

    await expect(
      service.listEligibleOrders("user-1", {
        orderType: "order",
        orderId: "old-order-1",
      }),
    ).resolves.toEqual([
      expect.objectContaining({ orderId: "old-order-1", selectable: true }),
    ]);
  });

  it("does not expose a requested order owned by another user", async () => {
    const prisma: any = createPrisma();
    prisma.order.findMany.mockResolvedValue([]);
    prisma.errandOrder.findMany.mockResolvedValue([]);
    prisma.order.findUnique.mockResolvedValue({
      ...ownerOrder,
      id: "private-order-1",
      userId: "user-2",
    });
    const service = new OrderAppealService(
      prisma,
      { createAndDispatch: jest.fn() } as any,
      { getAdminContext: jest.fn() } as any,
    );

    await expect(
      service.listEligibleOrders("user-1", {
        orderType: "order",
        orderId: "private-order-1",
      }),
    ).resolves.toEqual([]);
  });

  it("updates an appeal only inside the administrator region and records the reply", async () => {
    const prisma: any = createPrisma();
    prisma.orderAppeal.findUnique.mockResolvedValue({
      id: "appeal-1",
      appealNo: "AP1",
      userId: "user-1",
      regionId: "region-1",
      status: "pending",
    });
    prisma.orderAppeal.update.mockResolvedValue({
      id: "appeal-1",
      status: "processing",
    });
    const notify = { createAndDispatch: jest.fn().mockResolvedValue({}) };
    const scope = {
      getAdminContext: jest
        .fn()
        .mockResolvedValue({ isSuperAdmin: false, regionIds: ["region-1"] }),
    };
    const service = new OrderAppealService(prisma, notify as any, scope as any);

    await service.updateAppeal("admin-1", "appeal-1", {
      status: "processing",
      reply: "正在联系配送方",
    });

    expect(prisma.orderAppealEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "updated",
          actorType: "admin",
          content: "正在联系配送方",
        }),
      }),
    );
    expect(notify.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        scene: "order_appeal_updated",
      }),
    );
  });

  it("requires a user-facing explanation before requesting more material or closing an appeal", async () => {
    const prisma: any = createPrisma();
    prisma.orderAppeal.findUnique.mockResolvedValue({
      id: "appeal-1",
      appealNo: "AP1",
      userId: "user-1",
      regionId: "region-1",
      status: "pending",
    });
    const scope = {
      getAdminContext: jest
        .fn()
        .mockResolvedValue({ isSuperAdmin: true, regionIds: [] }),
    };
    const service = new OrderAppealService(
      prisma,
      { createAndDispatch: jest.fn() } as any,
      scope as any,
    );

    await expect(
      service.updateAppeal("admin-1", "appeal-1", { status: "waiting_user" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("keeps a refund resolution processing until the payment refund reaches success", async () => {
    const prisma: any = createPrisma();
    prisma.orderAppeal.findUnique.mockResolvedValue({
      id: "appeal-1", appealNo: "AP1", orderType: "errand", orderId: "errand-1",
      userId: "user-1", regionId: "region-1", status: "pending",
    });
    prisma.paymentRefund.findFirst.mockResolvedValue(null);
    prisma.paymentOrder.findFirst.mockResolvedValue({ amount: 8, refundedAmount: 0 });
    prisma.orderAppeal.updateMany.mockResolvedValue({ count: 1 });
    prisma.orderAppeal.update.mockResolvedValue({ id: "appeal-1", status: "processing" });
    prisma.orderAppealEvent.create.mockResolvedValue({ id: "event-1" });
    const paymentService = { refund: jest.fn().mockResolvedValue({ refundNo: "REF-1", status: "processing" }) };
    const service = new OrderAppealService(
      prisma,
      { createAndDispatch: jest.fn().mockResolvedValue({}) } as any,
      { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: true, regionIds: [] }) } as any,
      paymentService as any,
    );

    await expect(service.updateAppeal("admin-1", "appeal-1", {
      status: "resolved", reply: "证据核验后同意退款", resolutionAction: "full_refund", refundAmount: 8,
    })).resolves.toEqual(expect.objectContaining({ status: "processing" }));
    expect(paymentService.refund).toHaveBeenCalledWith(expect.objectContaining({
      bizType: "errand_order", bizId: "errand-1", amount: 8,
      sourceType: "order_appeal", sourceId: "appeal-1",
    }));
    expect(prisma.orderAppealEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ actionKey: "appeal-resolution:appeal-1:full_refund" }),
    }));
  });

  it("credits one idempotent platform compensation without changing order refund totals", async () => {
    const prisma: any = createPrisma();
    const tx: any = createPrisma();
    prisma.$transaction = jest.fn((fn: any) => fn(tx));
    prisma.orderAppeal.findUnique.mockResolvedValue({
      id: "appeal-1", appealNo: "AP1", orderType: "errand", orderId: "errand-1",
      userId: "user-1", regionId: "region-1", status: "pending", orderSnapshot: { amount: 8 },
    });
    tx.orderAppealEvent.findUnique.mockResolvedValue(null);
    tx.orderAppeal.updateMany.mockResolvedValue({ count: 1 });
    tx.orderAppealEvent.create.mockResolvedValue({ id: "event-1" });
    tx.wallet.upsert.mockResolvedValue({ balance: 13 });
    tx.walletTransaction.create.mockResolvedValue({ id: "wallet-tx-1" });
    tx.orderAppeal.update.mockResolvedValue({ id: "appeal-1", status: "resolved" });
    const paymentService = { refund: jest.fn() };
    const service = new OrderAppealService(
      prisma,
      { createAndDispatch: jest.fn().mockResolvedValue({}) } as any,
      { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: true, regionIds: [] }) } as any,
      paymentService as any,
    );

    await expect(service.updateAppeal("admin-1", "appeal-1", {
      status: "resolved", reply: "平台补偿", resolutionAction: "compensate_user", refundAmount: 3,
    })).resolves.toEqual(expect.objectContaining({ status: "resolved" }));
    expect(tx.walletTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: "user-1", type: "REWARD", amount: 3,
      orderNo: "appeal-resolution:appeal-1:compensate_user",
    }) });
    expect(paymentService.refund).not.toHaveBeenCalled();
    expect(prisma.paymentOrder.findFirst).not.toHaveBeenCalled();
  });

  it("deducts an unpaid rider settlement once for an evidence-backed rider penalty", async () => {
    const prisma: any = createPrisma();
    const tx: any = createPrisma();
    prisma.$transaction = jest.fn((fn: any) => fn(tx));
    prisma.orderAppeal.findUnique.mockResolvedValue({
      id: "appeal-1", appealNo: "AP1", orderType: "errand", orderId: "errand-1",
      userId: "user-1", regionId: "region-1", status: "processing",
    });
    prisma.riderSettlementItem.findUnique.mockResolvedValue({
      id: "item-1", settlementId: "settlement-1", riderId: "rider-1", payableAmount: 8,
      settlement: { id: "settlement-1", status: "PENDING" },
    });
    tx.orderAppealEvent.findUnique.mockResolvedValue(null);
    tx.orderAppealEvent.create.mockResolvedValue({ id: "event-1" });
    tx.riderSettlementItem.update.mockResolvedValue({});
    tx.riderSettlement.update.mockResolvedValue({});
    tx.orderAppeal.update.mockResolvedValue({ id: "appeal-1", status: "resolved" });
    const service = new OrderAppealService(
      prisma,
      { createAndDispatch: jest.fn().mockResolvedValue({}) } as any,
      { getAdminContext: jest.fn().mockResolvedValue({ isSuperAdmin: true, regionIds: [] }) } as any,
    );

    await service.updateAppeal("admin-1", "appeal-1", {
      status: "resolved", reply: "核验送达凭证后处罚", resolutionAction: "penalize_rider", riderPenaltyAmount: 2,
    });

    expect(tx.riderSettlementItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { penaltyAmount: { increment: 2 }, payableAmount: { decrement: 2 }, status: "adjusted" },
    });
    expect(tx.riderSettlement.update).toHaveBeenCalledWith({
      where: { id: "settlement-1" }, data: { penaltyAmount: { increment: 2 }, payableAmount: { decrement: 2 } },
    });
  });

  it("lets the owner supplement a waiting appeal once and returns it to the operator queue", async () => {
    const prisma: any = createPrisma();
    prisma.orderAppeal.findUnique.mockResolvedValue({
      id: "appeal-1",
      userId: "user-1",
      status: "waiting_user",
      evidenceImages: ["/uploads/original.jpg"],
    });
    prisma.orderAppeal.updateMany.mockResolvedValue({ count: 1 });
    const service = new OrderAppealService(
      prisma,
      { createAndDispatch: jest.fn() } as any,
      { getAdminContext: jest.fn() } as any,
    );

    await expect(
      service.supplementAppeal("user-1", "appeal-1", {
        content: "已补充门口照片",
        evidenceImages: ["/uploads/new.jpg"],
      }),
    ).resolves.toEqual({ success: true });
    expect(prisma.orderAppeal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "appeal-1", userId: "user-1", status: "waiting_user" },
        data: expect.objectContaining({
          status: "pending",
          evidenceImages: ["/uploads/original.jpg", "/uploads/new.jpg"],
        }),
      }),
    );
    expect(prisma.orderAppealEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "supplemented",
          actorType: "user",
          status: "pending",
        }),
      }),
    );
  });

  it("does not let another user supplement or race-reopen an appeal", async () => {
    const prisma: any = createPrisma();
    prisma.orderAppeal.findUnique.mockResolvedValue({
      id: "appeal-1",
      userId: "user-2",
      status: "waiting_user",
      evidenceImages: [],
    });
    const service = new OrderAppealService(
      prisma,
      { createAndDispatch: jest.fn() } as any,
      { getAdminContext: jest.fn() } as any,
    );
    await expect(
      service.supplementAppeal("user-1", "appeal-1", { content: "补充说明" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.orderAppeal.updateMany).not.toHaveBeenCalled();
  });

  it("lets only the affected merchant supplement an active appeal and returns it to the operator queue", async () => {
    const prisma: any = createPrisma();
    prisma.orderAppeal.findUnique.mockResolvedValue({
      id: "appeal-1",
      orderType: "order",
      orderId: "order-1",
      status: "processing",
    });
    prisma.order.findUnique.mockResolvedValue(ownerOrder);
    prisma.orderAppeal.updateMany.mockResolvedValue({ count: 1 });
    const service = new OrderAppealService(
      prisma,
      { createAndDispatch: jest.fn() } as any,
      { getAdminContext: jest.fn() } as any,
    );

    await expect(
      service.replyMerchantAppeal("merchant-1", "appeal-1", {
        content: "已核查备餐和交接记录",
      }),
    ).resolves.toEqual({ success: true });
    expect(prisma.orderAppeal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "appeal-1",
          status: { in: ["pending", "processing"] },
        },
        data: { status: "pending" },
      }),
    );
    expect(prisma.orderAppealEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorType: "merchant",
          action: "merchant_replied",
          status: "pending",
        }),
      }),
    );
  });

  it("returns the merchant only the minimum appeal context needed for verification", async () => {
    const prisma: any = createPrisma();
    prisma.orderAppeal.findUnique.mockResolvedValue({
      id: "appeal-1",
      appealNo: "AP1",
      orderType: "order",
      orderId: "order-1",
      orderNo: "O-1",
      status: "pending",
      appealType: "delivery_issue",
      description: "未收到餐品",
      contactPhone: "13800000000",
      evidenceImages: ["/uploads/private.jpg"],
      events: [{ actorType: "admin", content: "内部备注" }],
    });
    prisma.order.findUnique.mockResolvedValue(ownerOrder);
    const service = new OrderAppealService(
      prisma,
      { createAndDispatch: jest.fn() } as any,
      { getAdminContext: jest.fn() } as any,
    );

    await expect(
      service.getMerchantAppeal("merchant-1", "appeal-1"),
    ).resolves.toEqual({
      id: "appeal-1",
      appealNo: "AP1",
      orderNo: "O-1",
      status: "pending",
      appealType: "delivery_issue",
      description: "未收到餐品",
    });
  });

  it("does not let another merchant view an appeal or add an internal note", async () => {
    const prisma: any = createPrisma();
    prisma.orderAppeal.findUnique.mockResolvedValue({
      id: "appeal-1",
      orderType: "order",
      orderId: "order-1",
      status: "pending",
    });
    prisma.order.findUnique.mockResolvedValue(ownerOrder);
    const service = new OrderAppealService(
      prisma,
      { createAndDispatch: jest.fn() } as any,
      { getAdminContext: jest.fn() } as any,
    );

    await expect(
      service.getMerchantAppeal("merchant-2", "appeal-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.replyMerchantAppeal("merchant-2", "appeal-1", {
        content: "伪造说明",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.orderAppeal.updateMany).not.toHaveBeenCalled();
  });

  it("does not expose merchant-only appeal events to the user history", async () => {
    const prisma: any = createPrisma();
    prisma.orderAppeal.findMany.mockResolvedValue([]);
    const service = new OrderAppealService(
      prisma,
      { createAndDispatch: jest.fn() } as any,
      { getAdminContext: jest.fn() } as any,
    );

    await service.listMyAppeals("user-1");
    expect(prisma.orderAppeal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          events: {
            where: { actorType: { not: "merchant" } },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
    );
  });
});
