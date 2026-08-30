import { ShopService } from "./shop.service";

describe("ShopService SKU checkout bridge", () => {
  const createService = () => {
    const prisma = {
      product: { findUnique: jest.fn(), findFirst: jest.fn() },
      merchant: { findUnique: jest.fn() },
      cart: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      productModifierGroup: { findMany: jest.fn() },
      order: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
      orderLog: { create: jest.fn(), findFirst: jest.fn() },
      deliveryOrderNode: { findMany: jest.fn() },
      uploadRecord: { findMany: jest.fn() },
      review: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    return {
      prisma,
      service: new ShopService(prisma as any, {} as any, {} as any),
    };
  };

  it("returns SKU as the mini-program spec option contract", async () => {
    const { prisma, service } = createService();
    prisma.product.findUnique.mockResolvedValue({
      skus: [
        {
          id: "sku-1",
          specs: "大杯",
          price: 12.5,
          stock: 8,
          status: "on_sale",
        },
      ],
    });

    await expect(service.getAllOptions("product-1")).resolves.toEqual({
      specs: [
        expect.objectContaining({
          id: 1,
          options: [
            expect.objectContaining({
              id: "sku-1",
              option_name: "大杯",
              external_price: 12.5,
              daily_stock: 8,
            }),
          ],
        }),
      ],
      attributes: [],
      extras: [],
    });
  });

  it("uses the merchant delivery fee and records a real coordinate distance", () => {
    const { service } = createService();

    expect(
      (service as any).getDeliveryFee({
        businessType: "takeaway",
        deliveryFee: 4.5,
      }),
    ).toBe(4.5);
    // FIN-P0-005: 商家显式设置 0 元配送费必须生效（免配送费），只有未设置时才回退默认 2 元。
    expect(
      (service as any).getDeliveryFee({
        businessType: "takeaway",
        deliveryFee: 0,
      }),
    ).toBe(0);
    expect((service as any).getDeliveryFee({ businessType: "takeaway" })).toBe(
      2,
    );
    expect(
      (service as any).getDeliveryFee({
        businessType: "takeaway",
        deliveryFee: null,
      }),
    ).toBe(2);
    expect(
      (service as any).deliveryDistanceMeters(
        { latitude: 30.0, longitude: 114.0 },
        { latitude: 30.001, longitude: 114.0 },
      ),
    ).toBeGreaterThan(100);
  });

  it("prefers AMap walking distance and falls back to straight-line distance", async () => {
    const amapWalkingDistance = jest.fn().mockResolvedValue(520);
    const service = new ShopService(
      {} as any,
      {} as any,
      {} as any,
      undefined as any,
      { amapWalkingDistance } as any,
    );
    await expect(
      (service as any).resolveDeliveryDistance(
        { latitude: 30, longitude: 114 },
        { latitude: 30.001, longitude: 114 },
      ),
    ).resolves.toEqual({ meters: 520, source: "road" });

    amapWalkingDistance.mockResolvedValue(null);
    await expect(
      (service as any).resolveDeliveryDistance(
        { latitude: 30, longitude: 114 },
        { latitude: 30.001, longitude: 114 },
      ),
    ).resolves.toEqual(expect.objectContaining({ source: "straight" }));
  });

  it("offers a ready order to nearby fresh riders before the rest of the region", async () => {
    const createAndDispatch = jest.fn().mockResolvedValue({});
    const prisma: any = {
      regionRider: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { userId: "far" },
            { userId: "near" },
            { userId: "stale" },
          ]),
      },
    };
    const redis: any = {
      hgetall: jest.fn().mockResolvedValue({
        far: JSON.stringify({ lat: 30.1, lng: 114.1, time: Date.now() }),
        near: JSON.stringify({ lat: 30.001, lng: 114.001, time: Date.now() }),
        stale: JSON.stringify({
          lat: 30.0001,
          lng: 114.0001,
          time: Date.now() - 11 * 60 * 1000,
        }),
      }),
    };
    const service = new ShopService(
      prisma,
      { createAndDispatch } as any,
      {} as any,
      redis,
    );

    await (service as any).notifyAvailableShopRiders(
      {
        id: "order-1",
        orderNo: "ORD-1",
        merchantId: "merchant-1",
        refundStatus: "none",
        merchant: {
          regionId: "region-1",
          name: "食堂",
          latitude: 30,
          longitude: 114,
        },
      },
      2,
    );

    expect(createAndDispatch.mock.calls.map(([input]) => input.userId)).toEqual(
      ["near", "far"],
    );
  });

  it("keeps out-of-stock food from entering the cart before checkout", async () => {
    const { prisma, service } = createService();
    prisma.product.findFirst.mockResolvedValue({
      id: "product-1",
      status: "on_sale",
      stock: 0,
      skus: [],
    });

    await expect(
      service.addToCart("user-1", { product_id: "product-1" }),
    ).rejects.toThrow("商品已售罄");
    expect(prisma.cart.findFirst).not.toHaveBeenCalled();
  });

  it("requires a SKU selection when an on-sale product has specifications", async () => {
    const { prisma, service } = createService();
    prisma.product.findFirst.mockResolvedValue({
      id: "product-1",
      status: "on_sale",
      stock: 10,
      skus: [{ id: "sku-1", status: "on_sale", stock: 10 }],
    });

    await expect(
      service.addToCart("user-1", { product_id: "product-1" }),
    ).rejects.toThrow("请选择商品规格");
    expect(prisma.cart.create).not.toHaveBeenCalled();
  });

  it("includes dorm-shop orders in the 30-minute unaccepted auto-refund scan", async () => {
    const { prisma, service } = createService();
    (prisma.order as any).findMany = jest.fn().mockResolvedValue([]);

    await (service as any).autoCancelUnacceptedOrdersUnlocked();

    expect((prisma.order as any).findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ businessType: expect.anything() }),
      }),
    );
  });

  it("projects a rider's pickup phase and user id to the buyer order list", () => {
    const { service } = createService();

    expect(
      (service as any).formatDeliveryOrder({
        id: "order-1",
        orderNo: "ORD-1",
        status: "SHIPPED",
        businessType: "takeaway",
        deliveryMode: "platform_rider",
        items: [],
        rider: {
          userId: "rider-1",
          User: { nickname: "骑手小王", avatar: null, phone: "13800000000" },
        },
      }),
    ).toEqual(
      expect.objectContaining({
        status: "delivering",
        rider: expect.objectContaining({
          id: "rider-1",
          user_id: "rider-1",
          delivery_status: "pending",
        }),
      }),
    );

    expect(
      (service as any).formatDeliveryOrder({
        id: "order-1",
        orderNo: "ORD-1",
        status: "SHIPPED",
        businessType: "takeaway",
        deliveryMode: "platform_rider",
        pickupTime: new Date(),
        items: [],
        rider: { userId: "rider-1", User: { nickname: "骑手小王" } },
      }).rider.delivery_status,
    ).toBe("picked_up");
  });

  it("marks a cart item unavailable when stock changed after it was added", async () => {
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          businessType: "takeaway",
          deliveryFee: 0,
          packagingFee: 0,
        }),
      },
      cart: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "cart-1",
            productId: "product-1",
            skuId: null,
            quantity: 1,
            modifierSelections: [],
            product: {
              id: "product-1",
              name: "盖饭",
              status: "on_sale",
              stock: 0,
              price: 12,
              images: [],
            },
            sku: null,
          },
        ]),
      },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      address: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    const cart = await service.getCart("merchant-1", "user-1");

    expect(cart.items[0]).toEqual(
      expect.objectContaining({
        is_available: false,
        unavailable_reason: "商品已售罄",
      }),
    );
  });

  it("returns the merchant closing state and notice with checkout data", async () => {
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          businessType: "takeaway",
          deliveryFee: 0,
          packagingFee: 0,
          status: "closed",
          closedNotice: "今日打烊",
        }),
      },
      cart: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      address: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    await expect(service.getCart("merchant-1", "user-1")).resolves.toEqual(
      expect.objectContaining({
        status_value: "closed",
        is_open: 1,
        closed_notice: "今日打烊",
      }),
    );
  });

  it("returns an approved merchant as closed outside its business hours before checkout", async () => {
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          businessType: "takeaway",
          deliveryFee: 0,
          packagingFee: 0,
          status: "approved",
          businessHours: "09:00-22:00",
        }),
      },
      cart: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      address: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new ShopService(prisma, {} as any, {} as any);
    jest.spyOn(service as any, "isMerchantOpenAt").mockReturnValue(false);

    await expect(service.getCart("merchant-1", "user-1")).resolves.toEqual(
      expect.objectContaining({
        status_value: "approved",
        is_open: 1,
        closed_notice: "商家当前不在营业时间，请稍后再试",
      }),
    );
    expect(
      (service as any).formatMerchantForMini({
        id: "merchant-1",
        status: "approved",
        businessHours: "09:00-22:00",
      }),
    ).toEqual(
      expect.objectContaining({
        is_open: 1,
        closed_notice: "商家当前不在营业时间，请稍后再试",
      }),
    );
  });

  it("marks a cart item unavailable when its selected extra has sold out", async () => {
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          businessType: "takeaway",
          deliveryFee: 0,
          packagingFee: 0,
        }),
      },
      cart: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "cart-1",
            productId: "product-1",
            skuId: null,
            quantity: 1,
            modifierSelections: [{ optionId: "extra-1", optionName: "加蛋" }],
            product: {
              id: "product-1",
              name: "盖饭",
              status: "on_sale",
              stock: 8,
              price: 12,
              images: [],
            },
            sku: null,
          },
        ]),
      },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      address: { findFirst: jest.fn().mockResolvedValue(null) },
      productModifierOption: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "extra-1",
            name: "加蛋",
            status: "on_sale",
            stock: 0,
            group: { productId: "product-1", status: "on_sale" },
          },
        ]),
      },
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    const cart = await service.getCart("merchant-1", "user-1");

    expect(cart.items[0]).toEqual(
      expect.objectContaining({
        is_available: false,
        unavailable_reason: "加蛋已下架或售罄",
      }),
    );
  });

  it("returns the merchant dashboard contract with live fulfillment to-dos", async () => {
    const now = new Date();
    const orders = [
      {
        id: "paid-1",
        userId: "user-1",
        status: "PAID",
        totalAmount: 20,
        originalFreightAmount: 2,
        refundAmount: null,
        createdAt: now,
        merchantAcceptTime: null,
        readyTime: null,
        riderId: null,
      },
      {
        id: "prep-1",
        userId: "user-2",
        status: "PAID",
        totalAmount: 22,
        originalFreightAmount: 2,
        refundAmount: null,
        createdAt: now,
        merchantAcceptTime: now,
        readyTime: null,
        riderId: null,
      },
      {
        id: "ready-1",
        userId: "user-3",
        status: "PAID",
        totalAmount: 24,
        originalFreightAmount: 2,
        refundAmount: null,
        createdAt: now,
        merchantAcceptTime: now,
        readyTime: now,
        riderId: null,
      },
    ];
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          userId: "merchant-user",
          region: { commissionRate: 0.1 },
        }),
      },
      order: { findMany: jest.fn().mockResolvedValue(orders) },
      merchantSettlement: {
        findMany: jest.fn().mockResolvedValue([
          {
            settlementNo: "MST-1",
            amount: 60,
            platformFee: 6,
            status: "completed",
            startAt: now,
            endAt: now,
            processedAt: now,
          },
        ]),
      },
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    const result = await service.getMerchantDashboard(
      "merchant-1",
      { type: "today" },
      "merchant-user",
    );

    expect(result.overview.today).toEqual(
      expect.objectContaining({
        orders: 3,
        income: "60.00",
        commission_amount: "6.00",
      }),
    );
    expect(result.actionable).toEqual({
      pending_accept: 1,
      preparing: 1,
      waiting_rider: 1,
    });
    expect(result.settlement).toEqual(
      expect.objectContaining({
        settlementNo: "MST-1",
        status: "completed",
        netAmount: 54,
      }),
    );
  });

  it("returns only the authenticated owner's paged merchant settlements", async () => {
    const now = new Date();
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          userId: "merchant-user",
        }),
      },
      merchantSettlement: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "settlement-1",
            settlementNo: "MST-1",
            amount: 100,
            platformFee: 5,
            orderCount: 8,
            status: "completed",
            startAt: now,
            endAt: now,
            processedAt: now,
            transferNo: "PAY-1",
            remark: null,
            periodKey: "merchant-1:2026-08",
            createdAt: now,
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    await expect(
      service.getMerchantSettlements(
        "merchant-1",
        { page: 1, pageSize: 20 },
        "merchant-user",
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        total: 1,
        list: [
          expect.objectContaining({
            settlementNo: "MST-1",
            amount: 100,
            platformFee: 5,
            netAmount: 95,
          }),
        ],
      }),
    );
    expect(prisma.merchantSettlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { merchantId: "merchant-1" } }),
    );
  });

  it("keeps delivery fees and refunding orders out of merchant expected income", async () => {
    const now = new Date();
    const orderFindMany = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: "completed",
          userId: "user-1",
          status: "COMPLETED",
          totalAmount: 30,
          originalFreightAmount: 5,
          createdAt: now,
        },
        {
          id: "partial",
          userId: "user-2",
          status: "COMPLETED",
          totalAmount: 30,
          originalFreightAmount: 5,
          refundStatus: "partial",
          refundAmount: 8,
          createdAt: now,
        },
        {
          id: "refunding",
          userId: "user-3",
          status: "PAID",
          totalAmount: 30,
          originalFreightAmount: 5,
          refundStatus: "refunding",
          refundAmount: 25,
          createdAt: now,
        },
      ])
      .mockResolvedValueOnce([]);
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          userId: "merchant-user",
          region: { commissionRate: 0.1 },
        }),
      },
      order: { findMany: orderFindMany },
      merchantSettlement: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    const result = await service.getMerchantDashboard(
      "merchant-1",
      { type: "today" },
      "merchant-user",
    );

    expect(result.overview.today).toEqual(
      expect.objectContaining({
        income: "42.00",
        orders: 2,
        processing: 0,
        refund_orders: 2,
        refund_amount: "33.00",
        commission_amount: "4.20",
      }),
    );
    expect(result.actionable).toEqual({
      pending_accept: 0,
      preparing: 0,
      waiting_rider: 0,
    });
    expect(orderFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          refundStatus: { notIn: ["refunding", "refunded"] },
        }),
      }),
    );
  });

  it("counts self-delivery fees in a dorm-shop owner's expected income", async () => {
    const now = new Date();
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          userId: "merchant-user",
          region: { commissionRate: 0.1 },
        }),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "dorm-order",
            userId: "user-1",
            status: "COMPLETED",
            businessType: "dorm_shop",
            deliveryMode: "self_delivery",
            payAmount: 12,
            subsidyAmount: 1,
            originalFreightAmount: 2,
            refundStatus: "none",
            createdAt: now,
          },
        ]),
      },
      merchantSettlement: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    const result = await service.getMerchantDashboard(
      "merchant-1",
      { type: "today" },
      "merchant-user",
    );

    expect(result.overview.today).toEqual(
      expect.objectContaining({
        income: "13.00",
        commission_amount: "1.30",
      }),
    );
  });

  it("keeps the merchant order-page transaction total aligned with refunds", async () => {
    const { prisma, service } = createService();
    const testPrisma: any = prisma;
    testPrisma.order.findMany = jest.fn().mockResolvedValue([
      {
        status: "COMPLETED",
        payAmount: 30,
        refundStatus: "partial",
        refundAmount: 8,
        userId: "user-1",
      },
      {
        status: "SHIPPED",
        payAmount: 20,
        refundStatus: "none",
        refundAmount: 0,
        userId: "user-2",
      },
      {
        status: "SHIPPED",
        payAmount: 20,
        refundStatus: "refunding",
        refundAmount: 20,
        userId: "user-3",
      },
      {
        status: "REFUNDED",
        payAmount: 10,
        refundStatus: "refunded",
        refundAmount: 10,
        userId: "user-4",
      },
    ]);

    await expect(
      (service as any).getMerchantOrderStatistics(["merchant-1"]),
    ).resolves.toEqual({
      total_orders: 4,
      effective_amount: "42.00",
      unique_customers: 2,
      completion_rate: 25,
      cancellation_rate: 25,
      avg_order_amount: "21.00",
    });
    expect(testPrisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          refundStatus: true,
          refundAmount: true,
        }),
      }),
    );
  });

  it("returns the merchant refund eligibility fields from the order state", () => {
    const { service } = createService();
    const result = (service as any).formatMerchantOrderForMini({
      id: "order-1",
      orderNo: "ORD-1",
      businessType: "dorm_shop",
      status: "PAID",
      refundStatus: "none",
      merchantAcceptTime: null,
      riderId: null,
      payAmount: 12,
      freightAmount: 0,
      packagingAmount: 0,
      merchant: { region: { commissionRate: 0.05 } },
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    });

    expect(result).toEqual(
      expect.objectContaining({
        business_type: "dorm_shop",
        raw_status: "PAID",
        merchant_accept_time: null,
        rider_id: null,
        refund_status: "none",
        commission_rate: 5,
      }),
    );
  });

  it("shows the assigned rider contact only on the merchant's own order list", async () => {
    const { prisma: testPrisma, service } = createService();
    const prisma: any = testPrisma;
    const now = new Date();
    prisma.order.findMany = jest.fn().mockResolvedValue([
      {
        id: "order-1",
        orderNo: "ORD-1",
        merchantId: "merchant-1",
        riderId: "rider-user",
        status: "SHIPPED",
        refundStatus: "none",
        payAmount: 12,
        freightAmount: 0,
        packagingAmount: 0,
        createdAt: now,
        updatedAt: now,
        items: [],
        user: {},
        merchant: {},
      },
    ]);
    prisma.order.count = jest.fn().mockResolvedValue(1);
    prisma.regionRider = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "rider-1",
          userId: "rider-user",
          realName: "小李",
          phone: "13800138000",
          anonymous: false,
          User: {
            nickname: "骑手小李",
            avatar: "/rider.png",
            phone: "13900139000",
          },
        },
      ]),
    };
    jest
      .spyOn(service as any, "resolveManageMerchantIds")
      .mockResolvedValue(["merchant-1"]);
    jest
      .spyOn(service as any, "getMerchantOrderStatistics")
      .mockResolvedValue({});

    const result = await service.getMerchantOrders(
      "merchant-1",
      {},
      "merchant-user",
    );

    expect(prisma.regionRider.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: { in: ["rider-user"] } } }),
    );
    expect(result.orders[0].delivery.rider).toEqual(
      expect.objectContaining({ name: "小李", phone: "13800138000" }),
    );
  });

  it("shows a processing refund before the paid fulfillment state on both order surfaces", () => {
    const { service } = createService();
    const order = {
      id: "order-1",
      orderNo: "ORD-1",
      status: "PAID",
      refundStatus: "refunding",
      businessType: "takeaway",
      payAmount: 12,
      freightAmount: 0,
      packagingAmount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    };

    expect((service as any).formatDeliveryOrder(order).status).toBe(
      "refunding",
    );
    expect((service as any).formatMerchantOrderForMini(order).status).toBe(
      "refunding",
    );
  });

  it("keeps a partial refund on its actual fulfillment status so the order can continue", () => {
    const { service } = createService();
    const order = {
      id: "order-1",
      orderNo: "ORD-1",
      status: "PAID",
      merchantAcceptTime: new Date(),
      refundStatus: "partial",
      refundAmount: 3.5,
      businessType: "takeaway",
      payAmount: 12,
      freightAmount: 0,
      packagingAmount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    };

    expect((service as any).formatDeliveryOrder(order)).toEqual(
      expect.objectContaining({
        raw_status: "PAID",
        status: "preparing",
        refund_amount: 3.5,
      }),
    );
    expect((service as any).formatMerchantOrderForMini(order)).toEqual(
      expect.objectContaining({
        raw_status: "PAID",
        status: "preparing",
        refund_amount: 3.5,
        payment: expect.objectContaining({ refund_amount: "3.50" }),
      }),
    );
  });

  it("finds refunding orders by either legacy status or the current refund state without losing keyword filtering", () => {
    const { service } = createService();

    expect(
      (service as any).buildDeliveryOrderWhere("user-1", "refunding", "ORD-1"),
    ).toEqual({
      userId: "user-1",
      AND: [
        {
          OR: [
            { status: { in: ["REFUNDING"] } },
            { refundStatus: "refunding" },
          ],
        },
      ],
      OR: expect.arrayContaining([{ orderNo: { contains: "ORD-1" } }]),
    });
  });

  it("keeps merchant fulfillment tabs aligned with acceptance and preparation timestamps", () => {
    const { service } = createService();
    const awaiting: any = {};
    const preparing: any = {};
    const ready: any = {};

    (service as any).applyDeliveryStatusFilter(awaiting, "awaiting_delivery");
    (service as any).applyDeliveryStatusFilter(preparing, "preparing");
    (service as any).applyDeliveryStatusFilter(ready, "ready_for_pickup");

    expect(awaiting).toEqual(
      expect.objectContaining({ status: "PAID", merchantAcceptTime: null }),
    );
    expect(preparing).toEqual(
      expect.objectContaining({
        status: "PAID",
        merchantAcceptTime: { not: null },
        readyTime: null,
      }),
    );
    expect(ready).toEqual(
      expect.objectContaining({ status: "PAID", readyTime: { not: null } }),
    );
  });

  it("projects errand refund state over its legacy fulfillment status for buyer filters", () => {
    const { service } = createService();

    expect(
      (service as any).buildErrandOrderWhere("user-1", "refunding", ""),
    ).toEqual({
      userId: "user-1",
      AND: [
        {
          OR: [
            { status: { in: ["refunding"] } },
            { refundStatus: "refunding" },
          ],
        },
      ],
    });
    expect(
      (service as any).formatErrandOrder({
        id: "errand-1",
        orderNo: "ERR-1",
        status: "pending_accept",
        refundStatus: "refunding",
        payAmount: 8,
        createdAt: new Date(),
        updatedAt: new Date(),
        tasks: [],
      }),
    ).toEqual(
      expect.objectContaining({
        status: "refunding",
        refund_status: "refunding",
      }),
    );
  });

  it("keeps refunding orders out of active fulfillment filters", () => {
    const { service } = createService();

    expect(
      (service as any).buildDeliveryOrderWhere("user-1", "paid", ""),
    ).toEqual({
      userId: "user-1",
      status: { in: ["PAID"] },
      refundStatus: { notIn: ["refunding", "refunded"] },
    });
  });

  it("keeps order tab counts aligned with the refunding filter", async () => {
    const prisma: any = {
      order: {
        count: jest
          .fn()
          .mockResolvedValueOnce(8)
          .mockResolvedValueOnce(2)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(3)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(1),
      },
      errandOrder: { count: jest.fn().mockResolvedValue(4) },
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    await expect(
      (service as any).getOrderStatistics("user-1"),
    ).resolves.toEqual({
      delivery: {
        total: 8,
        paid: 2,
        delivering: 1,
        completed: 3,
        refunding: 1,
        refunded: 1,
      },
      errand: { total: 4 },
    });
    expect(prisma.order.count).toHaveBeenNthCalledWith(2, {
      where: {
        userId: "user-1",
        status: "PAID",
        refundStatus: { notIn: ["refunding", "refunded"] },
      },
    });
    expect(prisma.order.count).toHaveBeenNthCalledWith(5, {
      where: {
        userId: "user-1",
        OR: [{ status: "REFUNDING" }, { refundStatus: "refunding" }],
      },
    });
  });

  it("uses the same refunding filter in the merchant order list", async () => {
    const { prisma: basePrisma, service } = createService();
    const prisma: any = basePrisma;
    prisma.order.findMany = jest.fn().mockResolvedValue([]);
    prisma.order.count = jest.fn().mockResolvedValue(0);
    prisma.regionRider = { findMany: jest.fn().mockResolvedValue([]) };
    jest
      .spyOn(service as any, "resolveManageMerchantIds")
      .mockResolvedValue(["merchant-1"]);
    jest
      .spyOn(service as any, "getMerchantOrderStatistics")
      .mockResolvedValue({});

    await service.getMerchantOrders(
      "merchant-1",
      { status: "refunding" },
      "merchant-user",
    );

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              OR: [
                { status: { in: ["REFUNDING"] } },
                { refundStatus: "refunding" },
              ],
            },
          ],
        }),
      }),
    );
  });

  it("filters merchant orders by partial-refund state without replacing fulfillment status", async () => {
    const { prisma: basePrisma, service } = createService();
    const prisma: any = basePrisma;
    prisma.order.findMany = jest.fn().mockResolvedValue([]);
    prisma.order.count = jest.fn().mockResolvedValue(0);
    prisma.regionRider = { findMany: jest.fn().mockResolvedValue([]) };
    jest
      .spyOn(service as any, "resolveManageMerchantIds")
      .mockResolvedValue(["merchant-1"]);
    jest
      .spyOn(service as any, "getMerchantOrderStatistics")
      .mockResolvedValue({});

    await service.getMerchantOrders(
      "merchant-1",
      { status: "partial_refund" },
      "merchant-user",
    );

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ refundStatus: "partial" }),
      }),
    );
  });

  it("uses the merchant business hours for immediate and scheduled checkout validation", () => {
    const { service } = createService();
    expect(
      (service as any).isMerchantOpenAt(
        "09:00-22:00",
        new Date(2026, 6, 16, 8, 59),
      ),
    ).toBe(false);
    expect(
      (service as any).isMerchantOpenAt(
        "09:00-22:00",
        new Date(2026, 6, 16, 9, 0),
      ),
    ).toBe(true);
    expect(
      (service as any).isMerchantOpenAt(
        "09:00-22:00",
        new Date(2026, 6, 16, 22, 0),
      ),
    ).toBe(false);
  });

  it("supports dorm-shop business hours that cross midnight", () => {
    const { service } = createService();
    expect((service as any).normalizeBusinessHours("18:00-01:00")).toBe(
      "18:00-01:00",
    );
    expect(
      (service as any).isMerchantOpenAt(
        "18:00-01:00",
        new Date(2026, 6, 16, 23, 30),
      ),
    ).toBe(true);
    expect(
      (service as any).isMerchantOpenAt(
        "18:00-01:00",
        new Date(2026, 6, 17, 0, 30),
      ),
    ).toBe(true);
    expect(
      (service as any).isMerchantOpenAt(
        "18:00-01:00",
        new Date(2026, 6, 17, 1, 0),
      ),
    ).toBe(false);
  });

  it("carries only the previous day's overnight weekly schedule past midnight", () => {
    const { service } = createService();
    const weeklyHours = [
      { day: "Sunday", open: "Closed", close: "Closed" },
      { day: "Monday", open: "18:00", close: "01:00" },
      { day: "Tuesday", open: "Closed", close: "Closed" },
      { day: "Wednesday", open: "Closed", close: "Closed" },
      { day: "Thursday", open: "Closed", close: "Closed" },
      { day: "Friday", open: "Closed", close: "Closed" },
      { day: "Saturday", open: "Closed", close: "Closed" },
    ];
    const stored = (service as any).normalizeBusinessHours(weeklyHours);

    expect(
      (service as any).isMerchantOpenAt(stored, new Date(2026, 6, 13, 23, 30)),
    ).toBe(true);
    expect(
      (service as any).isMerchantOpenAt(stored, new Date(2026, 6, 14, 0, 30)),
    ).toBe(true);
    expect(
      (service as any).isMerchantOpenAt(stored, new Date(2026, 6, 15, 0, 30)),
    ).toBe(false);
  });

  it("preserves the merchant weekly schedule and checks the requested service day", () => {
    const { service } = createService();
    const weeklyHours = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ].map((day) => ({
      day,
      open: day === "Sunday" ? "Closed" : "09:00",
      close: day === "Sunday" ? "Closed" : "22:00",
    }));
    const stored = (service as any).normalizeBusinessHours(weeklyHours);

    expect(stored.length).toBeLessThan(191);
    expect((service as any).parseBusinessHours(stored)).toEqual(weeklyHours);
    expect(
      (service as any).isMerchantOpenAt(stored, new Date(2026, 6, 13, 12, 0)),
    ).toBe(true);
    expect(
      (service as any).isMerchantOpenAt(stored, new Date(2026, 6, 12, 12, 0)),
    ).toBe(false);
  });

  it("saves a validated weekly schedule when a regional manager syncs merchants", async () => {
    const prisma: any = {
      region: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ managerUserId: "region-manager" }),
      },
      merchant: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const service = new ShopService(prisma, {} as any, {} as any);
    const weeklyHours = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ].map((day) => ({ day, open: "09:00", close: "22:00" }));

    await service.syncToRegion("region-1", "region-manager", {
      business_hours: weeklyHours,
    });

    expect(prisma.merchant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { regionId: "region-1" },
        data: {
          businessHours: expect.stringMatching(/^\[\[0,"09:00","22:00"\]/),
        },
      }),
    );
  });

  it("persists the merchant location shape sent by the management page", async () => {
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          userId: "merchant-user",
          businessType: "takeaway",
          status: "approved",
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    await service.updateMerchant("merchant-1", "merchant-user", {
      location: { lat: 30.2741, lng: 120.1551 },
    });

    expect(prisma.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { latitude: 30.2741, longitude: 120.1551 },
      }),
    );
  });

  it("keeps the mini-program is_open contract consistent for merchant and regional updates", async () => {
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          userId: "merchant-user",
          businessType: "takeaway",
          status: "approved",
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      region: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ managerUserId: "region-manager" }),
      },
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    await service.updateMerchant("merchant-1", "merchant-user", { is_open: 0 });
    await service.updateMerchant("merchant-1", "merchant-user", { is_open: 1 });
    await service.syncToRegion("region-1", "region-manager", { is_open: 0 });
    await service.syncToRegion("region-1", "region-manager", { is_open: 1 });

    expect(prisma.merchant.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: { status: "approved" } }),
    );
    expect(prisma.merchant.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: { status: "closed" } }),
    );
    expect(prisma.merchant.updateMany).toHaveBeenNthCalledWith(1, {
      where: { regionId: "region-1" },
      data: { status: "approved" },
    });
    expect(prisma.merchant.updateMany).toHaveBeenNthCalledWith(2, {
      where: { regionId: "region-1" },
      data: { status: "closed" },
    });
  });

  it("checks a scheduled delivery against the merchant service time, not the displayed arrival time", async () => {
    const scheduled = new Date();
    scheduled.setDate(scheduled.getDate() + 1);
    scheduled.setHours(21, 30, 0, 0);
    const deliveryTime = `${scheduled.getFullYear()}-${String(scheduled.getMonth() + 1).padStart(2, "0")}-${String(scheduled.getDate()).padStart(2, "0")} 21:30:00`;
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          status: "approved",
          businessType: "takeaway",
          businessHours: "09:00-22:00",
          deliveryTimeMinutes: 30,
        }),
      },
      cart: { findMany: jest.fn().mockResolvedValue([]) },
      address: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: "address-1", regionId: null }),
      },
    };
    const service = new ShopService(prisma, {} as any, {} as any);
    const isOpenAt = jest
      .spyOn(service as any, "isMerchantOpenAt")
      .mockReturnValue(false);

    await expect(
      service.createOrder("merchant-1", "user-1", {
        address_id: "address-1",
        specified_address_id: "address-1",
        delivery_time: deliveryTime,
      }),
    ).rejects.toThrow("商家当前不在营业时间");
    expect(isOpenAt).toHaveBeenCalledWith(
      "09:00-22:00",
      new Date(
        scheduled.getFullYear(),
        scheduled.getMonth(),
        scheduled.getDate(),
        21,
        0,
      ),
    );
  });

  it("settles a fully discounted order without payment and claims its cart once", async () => {
    const merchant = {
      id: "merchant-1",
      userId: "merchant-user",
      regionId: "region-1",
      status: "approved",
      businessType: "dorm_shop",
      deliveryMode: "self_delivery",
      deliveryFee: 0,
      packagingFee: 0,
      minOrderAmount: 0,
      businessHours: null,
    };
    const cartItem = {
      id: "cart-1",
      productId: "product-1",
      skuId: null,
      quantity: 1,
      product: { id: "product-1", name: "试吃装", price: 0, images: [] },
      sku: null,
    };
    const created = {
      id: "order-1",
      orderNo: "ORD-1",
      merchantId: "merchant-1",
      businessType: "dorm_shop",
      payAmount: 0,
      fulfillmentStartTime: null,
      items: [],
    };
    const tx: any = {
      cart: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      product: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      order: { create: jest.fn().mockResolvedValue(created) },
      orderLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      merchant: { findUnique: jest.fn().mockResolvedValue(merchant) },
      cart: { findMany: jest.fn().mockResolvedValue([cartItem]) },
      address: {
        findFirst: jest.fn().mockResolvedValue({
          id: "address-1",
          regionId: "region-1",
          specifiedAddressId: "region-1",
          name: "小明",
          phone: "13800000000",
          fullAddress: "宿舍 101",
        }),
      },
      $transaction: jest.fn((handler: any) => handler(tx)),
    };
    const notifyService: any = {
      createAndDispatch: jest.fn().mockResolvedValue({}),
    };
    const service = new ShopService(prisma, notifyService, {
      getUserBenefits: jest.fn(),
    } as any);

    await expect(
      service.createOrder("merchant-1", "user-1", {
        address_id: "address-1",
      }),
    ).resolves.toEqual(
      expect.objectContaining({ order_id: "order-1", payment_required: false }),
    );

    expect(tx.cart.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", id: { in: ["cart-1"] }, selected: true },
    });
    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PAID",
          payTime: expect.any(Date),
        }),
      }),
    );
    expect(tx.orderLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orderId: "order-1", action: "PAID" }),
      }),
    );
    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "merchant-user",
        scene: "new_dorm_shop_order",
      }),
    );
  });

  it("writes takeaway delivery details from the selected verified address instead of client fields", async () => {
    const merchant = {
      id: "merchant-1",
      userId: "merchant-user",
      regionId: "region-1",
      status: "approved",
      businessType: "takeaway",
      deliveryMode: "platform_rider",
      deliveryFee: 0,
      packagingFee: 0,
      minOrderAmount: 0,
      businessHours: null,
    };
    const cartItem = {
      id: "cart-1",
      productId: "product-1",
      skuId: null,
      quantity: 1,
      product: { id: "product-1", name: "试吃装", price: 0, images: [] },
      sku: null,
    };
    const created = {
      id: "order-1",
      orderNo: "ORD-1",
      merchantId: "merchant-1",
      businessType: "takeaway",
      payAmount: 0,
      fulfillmentStartTime: null,
      items: [],
    };
    const tx: any = {
      cart: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      product: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      order: { create: jest.fn().mockResolvedValue(created) },
      orderLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      merchant: { findUnique: jest.fn().mockResolvedValue(merchant) },
      cart: { findMany: jest.fn().mockResolvedValue([cartItem]) },
      address: {
        findFirst: jest.fn().mockResolvedValue({
          id: "address-1",
          regionId: "region-1",
          specifiedAddressId: "region-1",
          name: "小明",
          phone: "13800000000",
          detail: "3 栋 101",
          fullAddress: "校区 3 栋 101",
          dormitoryNumber: "3-101",
        }),
      },
      $transaction: jest.fn((handler: any) => handler(tx)),
    };
    const service = new ShopService(
      prisma,
      { createAndDispatch: jest.fn() } as any,
      { getUserBenefits: jest.fn().mockResolvedValue({ list: [] }) } as any,
    );

    await service.createOrder("merchant-1", "user-1", {
      address_id: "address-1",
      specified_address_id: "region-1",
      receiver_name: "伪造姓名",
      receiver_phone: "13900000000",
      receiver_address: "校外地址",
    });

    expect(prisma.address.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", id: "address-1" } }),
    );

    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          receiverName: "小明",
          receiverPhone: "13800000000",
          receiverAddress: "校区 3 栋 101",
        }),
      }),
    );
  });

  it("rejects a takeaway address whose specified region differs from the merchant region", async () => {
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          businessType: "takeaway",
          status: "approved",
          regionId: "region-a",
        }),
      },
      cart: { findMany: jest.fn().mockResolvedValue([]) },
      address: {
        findFirst: jest.fn().mockResolvedValue({
          id: "address-1",
          userId: "user-1",
          regionId: null,
          specifiedAddressId: "region-b",
        }),
      },
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    await expect(
      service.createOrder("merchant-1", "user-1", {
        address_id: "address-1",
        specified_address_id: "region-b",
      }),
    ).rejects.toThrow("收货地址不属于当前商家服务区域");
  });

  it("rejects a selected address when its supplied delivery region does not match", async () => {
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          businessType: "takeaway",
          status: "approved",
        }),
      },
      cart: { findMany: jest.fn().mockResolvedValue([]) },
      address: {
        findFirst: jest.fn().mockResolvedValue({
          id: "address-1",
          userId: "user-1",
          specifiedAddressId: "region-a",
        }),
      },
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    await expect(
      service.createOrder("merchant-1", "user-1", {
        address_id: "address-1",
        specified_address_id: "region-b",
      }),
    ).rejects.toThrow("收货地址与指定配送区域不一致");
  });

  it("rechecks required SKU selection at order creation", async () => {
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          regionId: "region-1",
          businessType: "dorm_shop",
          status: "approved",
          businessHours: null,
        }),
      },
      cart: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "cart-1",
            productId: "product-1",
            skuId: null,
            quantity: 1,
            product: {
              id: "product-1",
              name: "可乐",
              price: 3,
              skus: [{ id: "sku-1" }],
            },
            sku: null,
          },
        ]),
      },
      address: {
        findFirst: jest.fn().mockResolvedValue({
          id: "address-1",
          regionId: "region-1",
          specifiedAddressId: "region-1",
        }),
      },
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    await expect(
      service.createOrder("merchant-1", "user-1", {
        address_id: "address-1",
      }),
    ).rejects.toThrow("商品「可乐」请先选择规格");
  });

  it("requires a stored address for dorm-shop checkout", async () => {
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          businessType: "dorm_shop",
          status: "approved",
        }),
      },
      cart: { findMany: jest.fn().mockResolvedValue([]) },
      address: { findFirst: jest.fn() },
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    await expect(
      service.createOrder("merchant-1", "user-1", {}),
    ).rejects.toThrow("请选择收货地址");
    expect(prisma.address.findFirst).not.toHaveBeenCalled();
  });

  it("does not let a merchant start a scheduled order before its fulfillment window", async () => {
    const { prisma, service } = createService();
    jest.spyOn(service as any, "getOwnedMerchantOrder").mockResolvedValue({
      id: "order-1",
      status: "PAID",
      businessType: "takeaway",
      merchantAcceptTime: null,
      fulfillmentStartTime: new Date(Date.now() + 10 * 60 * 1000),
      items: [],
      merchant: { userId: "merchant-user" },
    });

    await expect(
      service.acceptMerchantOrder("order-1", "merchant-user"),
    ).rejects.toThrow("预约订单尚未到履约时间");
    expect((prisma as any).$transaction).toBeUndefined();
  });

  it("uses the print service for an explicit merchant reprint", async () => {
    const { prisma } = createService();
    const reprintOrder = jest
      .fn()
      .mockResolvedValue({ success: true, queued: 1 });
    const service = new ShopService(
      prisma as any,
      {} as any,
      {} as any,
      undefined as any,
      undefined as any,
      { reprintOrder, enqueueAutomaticOrder: jest.fn() } as any,
    );
    jest
      .spyOn(service as any, "getOwnedMerchantOrder")
      .mockResolvedValue({ id: "order-1", merchantId: "merchant-1" });

    await expect(
      service.printOrder("merchant-user", { orderId: "order-1" }),
    ).resolves.toEqual({ success: true, queued: 1 });
    expect(reprintOrder).toHaveBeenCalledWith("order-1", "merchant-1");
  });

  it("reminds an unaccepted order once and records the idempotency log", async () => {
    const { prisma, service } = createService();
    const notifyService: any = {
      createAndDispatch: jest.fn().mockResolvedValue({}),
    };
    (service as any).notifyService = notifyService;
    (prisma as any).order.findMany = jest.fn().mockResolvedValue([
      {
        id: "order-1",
        orderNo: "ORD-1",
        merchantId: "merchant-1",
        merchant: {
          userId: "merchant-user",
          name: "测试商家",
          regionId: "region-1",
        },
        items: [],
      },
    ]);

    await service.remindUnacceptedOrders();

    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "merchant-user",
        scene: "takeaway_accept_reminder",
      }),
    );
    expect(prisma.orderLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "MERCHANT_ACCEPT_REMINDER",
          orderId: "order-1",
        }),
      }),
    );
  });

  it("measures scheduled-order acceptance delays from fulfillment start, not expected arrival", async () => {
    const { prisma, service } = createService();
    (prisma as any).order.findMany = jest.fn().mockResolvedValue([]);

    await service.remindUnacceptedOrders();

    const [merchantReminder, buyerNotice] = (
      prisma as any
    ).order.findMany.mock.calls.map(([args]: any[]) => args.where);
    const overdueAt = (cutoff: any) =>
      expect.arrayContaining([
        { fulfillmentStartTime: { lte: cutoff } },
        expect.objectContaining({
          fulfillmentStartTime: null,
          createdAt: { lte: cutoff },
        }),
      ]);
    expect(merchantReminder.OR).toEqual(overdueAt(expect.any(Date)));
    expect(buyerNotice.OR).toEqual(overdueAt(expect.any(Date)));
    expect(merchantReminder.refundStatus).toEqual({
      notIn: ["refunding", "refunded"],
    });
    expect(buyerNotice.refundStatus).toEqual({
      notIn: ["refunding", "refunded"],
    });
  });

  it("keeps a scheduled order eligible for retry when its merchant notification fails", async () => {
    const { prisma, service } = createService();
    const notifyService: any = {
      createAndDispatch: jest
        .fn()
        .mockRejectedValue(new Error("push unavailable")),
    };
    (service as any).notifyService = notifyService;
    (prisma as any).order.findMany = jest.fn().mockResolvedValue([
      {
        id: "order-1",
        orderNo: "ORD-1",
        merchantId: "merchant-1",
        businessType: "takeaway",
        payAmount: 12,
        user: { nickname: "用户" },
        merchant: { userId: "merchant-user", regionId: "region-1" },
        items: [],
      },
    ]);

    await service.notifyScheduledMerchantOrders();

    expect((prisma as any).order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          refundStatus: { notIn: ["refunding", "refunded"] },
        }),
      }),
    );
    expect(notifyService.createAndDispatch).toHaveBeenCalled();
    expect(prisma.orderLog.create).not.toHaveBeenCalled();
  });

  it("notifies a due zero-pay scheduled order without requiring a payment record", async () => {
    const { prisma, service } = createService();
    const notifyService: any = {
      createAndDispatch: jest.fn().mockResolvedValue({}),
    };
    (service as any).notifyService = notifyService;
    (prisma as any).order.findMany = jest.fn().mockResolvedValue([
      {
        id: "order-free",
        orderNo: "ORD-FREE",
        merchantId: "merchant-1",
        businessType: "takeaway",
        payAmount: 0,
        user: { nickname: "用户" },
        merchant: { userId: "merchant-user", regionId: "region-1" },
        items: [],
      },
    ]);

    await service.notifyScheduledMerchantOrders();

    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "merchant-user",
        scene: "new_takeaway_order",
        data: expect.objectContaining({ orderId: "order-free", amount: 0 }),
      }),
    );
    expect(prisma.orderLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: "order-free",
          action: "SCHEDULED_MERCHANT_NOTIFY",
        }),
      }),
    );
  });

  it("tells the buyer once when a takeaway merchant has not accepted after 20 minutes", async () => {
    const { prisma, service } = createService();
    const notifyService: any = {
      createAndDispatch: jest.fn().mockResolvedValue({}),
    };
    (service as any).notifyService = notifyService;
    (prisma as any).order.findMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "order-1",
          orderNo: "ORD-1",
          userId: "buyer-1",
          merchantId: "merchant-1",
          merchant: { name: "测试商家", regionId: "region-1" },
        },
      ]);

    await service.remindUnacceptedOrders();

    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "buyer-1",
        scene: "takeaway_accept_delay",
        title: "商家暂未接单",
        linkValue: "/pagesA/order/order-detail/order-detail?id=order-1",
      }),
    );
    expect(prisma.orderLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "USER_ACCEPT_DELAY_NOTICE",
          orderId: "order-1",
        }),
      }),
    );
  });

  it("retries rider notification for a ready takeaway order and tells the buyer about a continued delay", async () => {
    const { prisma, service } = createService();
    const notifyService: any = {
      createAndDispatch: jest.fn().mockResolvedValue({}),
    };
    (service as any).notifyService = notifyService;
    (prisma as any).order.findMany = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: "order-1",
          orderNo: "ORD-1",
          merchantId: "merchant-1",
          merchant: { name: "测试商家", regionId: "region-1" },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "order-1",
          orderNo: "ORD-1",
          userId: "buyer-1",
          merchantId: "merchant-1",
          merchant: { name: "测试商家", regionId: "region-1" },
        },
      ]);
    jest
      .spyOn(service as any, "notifyAvailableShopRiders")
      .mockResolvedValue(1);

    await service.remindUnassignedReadyOrders();

    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "buyer-1",
        scene: "takeaway_rider_delay",
        title: "餐品已备好，等待骑手接单",
      }),
    );
    expect(prisma.orderLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "RIDER_ASSIGNMENT_REMINDER",
          orderId: "order-1",
        }),
      }),
    );
    expect(prisma.orderLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "USER_RIDER_DELAY_NOTICE",
          orderId: "order-1",
        }),
      }),
    );
  });

  it("keeps a ready order eligible for rider reminder retry when no rider can be reached", async () => {
    const { prisma, service } = createService();
    (prisma as any).order.findMany = jest
      .fn()
      .mockResolvedValueOnce([
        { id: "order-1", merchant: { regionId: "region-1" } },
      ])
      .mockResolvedValueOnce([]);
    jest
      .spyOn(service as any, "notifyAvailableShopRiders")
      .mockResolvedValue(0);

    await service.remindUnassignedReadyOrders();

    expect(prisma.orderLog.create).not.toHaveBeenCalled();
  });

  it("reminds a rider once before an unpicked takeaway order needs reassignment", async () => {
    const { prisma, service } = createService();
    const notifyService: any = {
      createAndDispatch: jest.fn().mockResolvedValue({}),
    };
    (service as any).notifyService = notifyService;
    (prisma as any).order.findMany = jest.fn().mockResolvedValue([
      {
        id: "order-1",
        orderNo: "ORD-1",
        riderId: "rider-1",
        merchantId: "merchant-1",
        merchant: { name: "测试商家", regionId: "region-1" },
      },
    ]);

    await service.remindUnpickedRiderOrders();

    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "rider-1",
        scene: "takeaway_pickup_reminder",
      }),
    );
    expect(prisma.orderLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "RIDER_PICKUP_REMINDER",
          orderId: "order-1",
        }),
      }),
    );
  });

  it("reminds a rider about an overdue delivery and tells the buyer after a continued delay", async () => {
    const { prisma, service } = createService();
    const notifyService: any = {
      createAndDispatch: jest.fn().mockResolvedValue({}),
    };
    (service as any).notifyService = notifyService;
    (prisma as any).order.findMany = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: "order-1",
          orderNo: "ORD-1",
          riderId: "rider-1",
          merchantId: "merchant-1",
          merchant: { name: "测试商家", regionId: "region-1" },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "order-1",
          orderNo: "ORD-1",
          userId: "buyer-1",
          riderId: "rider-1",
          merchantId: "merchant-1",
          merchant: { name: "测试商家", regionId: "region-1" },
        },
      ]);

    await service.remindOverdueRiderDeliveries();

    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "rider-1",
        scene: "takeaway_delivery_reminder",
      }),
    );
    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "buyer-1",
        scene: "takeaway_delivery_delay",
        content: expect.stringContaining("持续跟进"),
      }),
    );
    expect(prisma.orderLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "RIDER_DELIVERY_REMINDER" }),
      }),
    );
    expect(prisma.orderLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "USER_DELIVERY_DELAY_NOTICE" }),
      }),
    );
  });

  it("auto-confirms a takeaway order delivered for over 24 hours and notifies the buyer", async () => {
    const prisma: any = {
      order: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "order-1",
            orderNo: "ORD-1",
            userId: "user-1",
            merchantId: "merchant-1",
            merchant: { userId: "merchant-user", regionId: "region-1" },
          },
        ]),
      },
    };
    const tx = {
      order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      orderLog: { create: jest.fn().mockResolvedValue({}) },
      deliveryOrderNode: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction = jest.fn((callback: any) => callback(tx));
    const notifyService: any = {
      createAndDispatch: jest.fn().mockResolvedValue({}),
    };
    const service = new ShopService(prisma, notifyService, {} as any);

    await service.autoCompleteDeliveredOrders();

    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "order-1",
          status: "DELIVERED",
          refundStatus: { notIn: ["refunding", "refunded"] },
          deliverTime: { lte: expect.any(Date) },
        }),
        data: expect.objectContaining({
          status: "COMPLETED",
          receiveTime: expect.any(Date),
          completeTime: expect.any(Date),
        }),
      }),
    );
    expect(tx.orderLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "AUTO_RECEIPT",
          toStatus: "COMPLETED",
        }),
      }),
    );
    expect(tx.deliveryOrderNode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nodeType: "completed",
          operatorType: "system",
        }),
      }),
    );
    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        scene: "shop_order_auto_received",
        title: "订单已自动确认收货",
      }),
    );
    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "merchant-user",
        scene: "shop_order_auto_received_merchant",
      }),
    );
  });

  it("does not auto-confirm or notify when a delivered order loses the claim to a refund", async () => {
    const prisma: any = {
      order: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "order-1",
            orderNo: "ORD-1",
            userId: "user-1",
            merchantId: "merchant-1",
          },
        ]),
      },
    };
    const tx = {
      order: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      orderLog: { create: jest.fn() },
      deliveryOrderNode: { create: jest.fn() },
    };
    prisma.$transaction = jest.fn((callback: any) => callback(tx));
    const notifyService: any = { createAndDispatch: jest.fn() };
    const service = new ShopService(prisma, notifyService, {} as any);

    await service.autoCompleteDeliveredOrders();

    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          refundStatus: { notIn: ["refunding", "refunded"] },
        }),
      }),
    );
    expect(tx.orderLog.create).not.toHaveBeenCalled();
    expect(tx.deliveryOrderNode.create).not.toHaveBeenCalled();
    expect(notifyService.createAndDispatch).not.toHaveBeenCalled();
  });

  it("opens the exact order when notifying the buyer of a merchant status change", async () => {
    const { service } = createService();
    const notifyService: any = {
      createAndDispatch: jest.fn().mockResolvedValue({}),
    };
    (service as any).notifyService = notifyService;

    await (service as any).notifyBuyerOrderStatus(
      {
        id: "order-1",
        orderNo: "ORD-1",
        userId: "buyer-1",
        merchantId: "merchant-1",
        status: "PAID",
        merchant: { regionId: "region-1" },
      },
      "商家已接单",
      "商家正在备餐",
    );

    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "buyer-1",
        scene: "takeaway_order_status",
        linkValue: "/pagesA/order/order-detail/order-detail?id=order-1",
      }),
    );
  });

  it("lets a merchant re-notify riders only for a ready, unassigned takeaway order", async () => {
    const { prisma, service } = createService();
    prisma.order.findUnique.mockResolvedValue({
      id: "order-1",
      status: "PAID",
      businessType: "takeaway",
      readyTime: new Date(),
      riderId: null,
      items: [],
      merchant: {
        id: "merchant-1",
        userId: "merchant-user",
        name: "测试商家",
        regionId: "region-1",
      },
    });
    prisma.orderLog.findFirst.mockResolvedValue(null);
    const notifyRiders = jest
      .spyOn(service as any, "notifyAvailableShopRiders")
      .mockResolvedValue(1);

    await expect(
      service.sendOrderNotification("merchant-user", { order_id: "order-1" }),
    ).resolves.toEqual({ success: true, message: "已提醒骑手接单" });
    expect(notifyRiders).toHaveBeenCalledWith(
      expect.objectContaining({ id: "order-1" }),
    );
    expect(prisma.orderLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "MERCHANT_RIDER_REMINDER",
          operatorType: "merchant",
        }),
      }),
    );
  });

  it("does not throttle a merchant reminder when no rider notification is delivered", async () => {
    const { prisma, service } = createService();
    prisma.order.findUnique.mockResolvedValue({
      id: "order-1",
      status: "PAID",
      businessType: "takeaway",
      readyTime: new Date(),
      riderId: null,
      items: [],
      merchant: {
        id: "merchant-1",
        userId: "merchant-user",
        name: "测试商家",
        regionId: "region-1",
      },
    });
    prisma.orderLog.findFirst.mockResolvedValue(null);
    jest
      .spyOn(service as any, "notifyAvailableShopRiders")
      .mockResolvedValue(0);

    await expect(
      service.sendOrderNotification("merchant-user", { order_id: "order-1" }),
    ).resolves.toEqual({
      success: true,
      message: "当前没有可通知的在线骑手，请稍后再试",
    });
    expect(prisma.orderLog.create).not.toHaveBeenCalled();
  });

  it("does not notify riders again for a takeaway order that is refunding", async () => {
    const { service } = createService();
    jest.spyOn(service as any, "getOwnedMerchantOrder").mockResolvedValue({
      id: "order-1",
      status: "PAID",
      businessType: "takeaway",
      readyTime: new Date(),
      riderId: null,
      refundStatus: "refunding",
    });
    const notifyRiders = jest.spyOn(
      service as any,
      "notifyAvailableShopRiders",
    );

    await expect(
      service.sendOrderNotification("merchant-user", { order_id: "order-1" }),
    ).resolves.toEqual({
      success: true,
      message: "订单退款处理中，暂不能通知骑手",
    });

    expect(notifyRiders).not.toHaveBeenCalled();
  });

  it("uses the selected option as skuId when adding to cart", async () => {
    const { prisma, service } = createService();
    prisma.product.findFirst.mockResolvedValue({
      id: "product-1",
      status: "on_sale",
      skus: [{ id: "sku-1", status: "on_sale" }],
    });
    prisma.productModifierGroup.findMany.mockResolvedValue([]);
    prisma.cart.findFirst.mockResolvedValue(null);
    prisma.cart.create.mockResolvedValue({ id: "cart-1" });

    await service.addToCart("user-1", {
      product_id: "product-1",
      option_id: "sku-1",
      quantity: 1,
    });

    expect(prisma.cart.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        productId: "product-1",
        skuId: "sku-1",
        selectionKey: "",
        modifierSelections: [],
        quantity: 1,
        selected: true,
      },
    });
  });

  it("prices selected modifiers server-side and keeps them as a distinct cart item", async () => {
    const { prisma, service } = createService();
    prisma.product.findFirst.mockResolvedValue({
      id: "product-1",
      status: "on_sale",
      skus: [],
    });
    prisma.productModifierGroup.findMany.mockResolvedValue([
      {
        id: "group-1",
        name: "甜度",
        type: "attribute",
        isRequired: true,
        maxSelect: 1,
        options: [
          { id: "option-1", name: "全糖", price: 1, status: "on_sale" },
        ],
      },
    ]);
    prisma.cart.findFirst.mockResolvedValue(null);
    prisma.cart.create.mockResolvedValue({ id: "cart-1" });

    await service.addToCart("user-1", {
      product_id: "product-1",
      attribute_ids: ["option-1"],
    });

    expect(prisma.cart.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          selectionKey: "option-1",
          modifierSelections: [
            expect.objectContaining({ optionName: "全糖", additionalPrice: 1 }),
          ],
        }),
      }),
    );
  });

  it("reserves a stock-managed modifier option with the order inventory", async () => {
    const { service } = createService();
    const db = {
      product: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      sKU: { updateMany: jest.fn() },
      productModifierOption: {
        findUnique: jest.fn().mockResolvedValue({
          id: "extra-1",
          name: "煎蛋",
          stock: 2,
          status: "on_sale",
          group: { productId: "product-1", status: "on_sale" },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const item: any = {
      productId: "product-1",
      productName: "盖饭",
      quantity: 1,
      modifierSelections: [{ optionId: "extra-1" }],
    };

    await (service as any).reserveOrderInventory(db, [item]);

    expect(db.productModifierOption.updateMany).toHaveBeenCalledWith({
      where: { id: "extra-1", status: "on_sale", stock: { gte: 1 } },
      data: { stock: { decrement: 1 } },
    });
    expect(item.modifierSelections[0].stockManaged).toBe(true);
  });

  it("restores only modifier inventory that the order reserved", async () => {
    const { service } = createService();
    const db = {
      product: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      sKU: { updateMany: jest.fn() },
      productModifierOption: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    await (service as any).restoreOrderInventory(db, {
      stockReserved: true,
      items: [
        {
          productId: "product-1",
          quantity: 2,
          skuId: null,
          modifierSelections: [
            { optionId: "extra-1", stockManaged: true },
            { optionId: "attr-1", stockManaged: false },
          ],
        },
      ],
    });

    expect(db.productModifierOption.updateMany).toHaveBeenCalledTimes(1);
    expect(db.productModifierOption.updateMany).toHaveBeenCalledWith({
      where: { id: "extra-1", stock: { not: null } },
      data: { stock: { increment: 2 } },
    });
  });

  it("keeps a self-delivery order in preparation after the owner accepts it", async () => {
    const { prisma, service } = createService();
    const order = {
      id: "order-1",
      status: "PAID",
      businessType: "dorm_shop",
      deliveryMode: "self_delivery",
      refundStatus: "partial",
      merchant: { id: "merchant-1", name: "宿舍小店", userId: "merchant-user" },
      user: { id: "user-1" },
      items: [],
    };
    const tx = {
      order: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ ...order, merchantAcceptTime: new Date() }),
      },
      orderLog: { create: jest.fn() },
      deliveryOrderNode: { create: jest.fn().mockResolvedValue({}) },
    };
    (prisma as any).$transaction = jest.fn((callback: any) => callback(tx));
    jest
      .spyOn(service as any, "getOwnedMerchantOrder")
      .mockResolvedValue(order);
    jest
      .spyOn(service as any, "notifyBuyerOrderStatus")
      .mockResolvedValue(undefined);

    await service.acceptMerchantOrder("order-1", "merchant-user");

    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "order-1",
          status: "PAID",
          merchantAcceptTime: null,
          refundStatus: { notIn: ["refunding", "refunded"] },
        },
      }),
    );
    expect(tx.orderLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ toStatus: "PAID" }),
      }),
    );
  });

  it("does not let a merchant accept an order while its refund is processing", async () => {
    const { service } = createService();
    jest.spyOn(service as any, "getOwnedMerchantOrder").mockResolvedValue({
      id: "order-1",
      status: "PAID",
      refundStatus: "refunding",
      businessType: "takeaway",
      merchantAcceptTime: null,
      items: [],
      merchant: { userId: "merchant-user" },
    });

    await expect(
      service.acceptMerchantOrder("order-1", "merchant-user"),
    ).rejects.toThrow("只有已付款待接单的订单才能确认接单");
  });

  it("marks self-delivery as delivered so the buyer can still confirm receipt", async () => {
    const { prisma, service } = createService();
    const order = {
      id: "order-1",
      status: "SHIPPED",
      businessType: "dorm_shop",
      deliveryMode: "self_delivery",
      refundStatus: "partial",
      merchant: { id: "merchant-1", name: "宿舍小店", userId: "merchant-user" },
      user: { id: "user-1" },
      items: [],
    };
    const tx = {
      order: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ ...order, status: "DELIVERED" }),
      },
      orderLog: { create: jest.fn() },
      deliveryOrderNode: { create: jest.fn().mockResolvedValue({}) },
    };
    (prisma as any).$transaction = jest.fn((callback: any) => callback(tx));
    prisma.order.findUnique.mockResolvedValue(order);
    prisma.uploadRecord.findMany.mockResolvedValue([
      { url: "https://cdn.example.com/proof.jpg" },
    ]);
    jest
      .spyOn(service as any, "notifyBuyerOrderStatus")
      .mockResolvedValue(undefined);

    await service.completeMerchantOrder("order-1", "merchant-user", {
      proof_images: ["https://cdn.example.com/proof.jpg"],
    });

    expect(prisma.uploadRecord.findMany).toHaveBeenCalledWith({
      where: {
        userId: "merchant-user",
        scene: "delivery-proof",
        hash: {
          contains: "users/merchant-user/delivery-proofs/orders/order-1/",
        },
        url: { in: ["https://cdn.example.com/proof.jpg"] },
        createdAt: { gte: expect.any(Date) },
      },
      select: { url: true },
    });

    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "order-1",
          status: "SHIPPED",
          refundStatus: { notIn: ["refunding", "refunded"] },
        },
        data: expect.objectContaining({ status: "DELIVERED" }),
      }),
    );
    expect(tx.orderLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ toStatus: "DELIVERED" }),
      }),
    );
    expect(tx.deliveryOrderNode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          proofImages: ["https://cdn.example.com/proof.jpg"],
        }),
      }),
    );
  });

  it("does not let a dorm-shop owner complete delivery without photo proof", async () => {
    const { prisma, service } = createService();
    prisma.order.findUnique.mockResolvedValue({
      id: "order-1",
      status: "SHIPPED",
      businessType: "dorm_shop",
      refundStatus: "none",
      merchant: { userId: "merchant-user" },
    });

    await expect(
      service.completeMerchantOrder("order-1", "merchant-user", {}),
    ).rejects.toThrow("请上传照片或输入用户提供的六位收货码");
  });

  it("rejects a delivery photo that was not uploaded by the current account", async () => {
    const { prisma, service } = createService();
    prisma.order.findUnique.mockResolvedValue({
      id: "order-1",
      status: "SHIPPED",
      businessType: "dorm_shop",
      refundStatus: "none",
      merchant: { userId: "merchant-user" },
    });
    prisma.uploadRecord.findMany.mockResolvedValue([]);

    await expect(
      service.completeMerchantOrder("order-1", "merchant-user", {
        proof_images: ["https://cdn.example.com/not-owned.jpg"],
      }),
    ).rejects.toThrow("送达凭证必须由当前账号为本订单在两小时内上传");
  });

  it("keeps a regular takeaway out of the rider pool until the merchant marks it ready", async () => {
    const { prisma, service } = createService();
    const order = {
      id: "order-1",
      status: "PAID",
      businessType: "takeaway",
      deliveryMode: "platform_rider",
      merchantAcceptTime: new Date(),
      readyTime: null,
      refundStatus: "partial",
      merchant: {
        id: "merchant-1",
        name: "测试商家",
        userId: "merchant-user",
        regionId: "region-1",
      },
      user: { id: "user-1" },
      items: [],
    };
    const tx = {
      order: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ ...order, readyTime: new Date() }),
      },
      orderLog: { create: jest.fn() },
      deliveryOrderNode: { create: jest.fn().mockResolvedValue({}) },
    };
    (prisma as any).$transaction = jest.fn((callback: any) => callback(tx));
    jest
      .spyOn(service as any, "getOwnedMerchantOrder")
      .mockResolvedValue(order);
    jest
      .spyOn(service as any, "notifyBuyerOrderStatus")
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, "notifyAvailableShopRiders")
      .mockResolvedValue(undefined);

    await service.readyMerchantOrder("order-1", "merchant-user");

    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "order-1",
          status: "PAID",
          merchantAcceptTime: { not: null },
          readyTime: null,
          refundStatus: { notIn: ["refunding", "refunded"] },
        },
        data: { readyTime: expect.any(Date) },
      }),
    );
    expect(tx.orderLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "MERCHANT_READY" }),
      }),
    );
  });

  it("does not let a merchant mark a refunding takeaway ready for pickup", async () => {
    const { service } = createService();
    jest.spyOn(service as any, "getOwnedMerchantOrder").mockResolvedValue({
      id: "order-1",
      status: "PAID",
      businessType: "takeaway",
      merchantAcceptTime: new Date(),
      readyTime: null,
      refundStatus: "refunding",
    });

    await expect(
      service.readyMerchantOrder("order-1", "merchant-user"),
    ).rejects.toThrow("只有备餐中的订单才能标记备餐完成");
  });

  it("does not let a self-delivery merchant mark a refunding order delivered", async () => {
    const { prisma, service } = createService();
    prisma.order.findUnique.mockResolvedValue({
      id: "order-1",
      status: "SHIPPED",
      businessType: "dorm_shop",
      refundStatus: "refunding",
      merchant: { userId: "merchant-user" },
    });

    await expect(
      service.completeMerchantOrder("order-1", "merchant-user"),
    ).rejects.toThrow("只有配送中的订单才能标记送达");
  });

  it("returns a mini-program-ready order detail with merchant and items", async () => {
    const { prisma, service } = createService();
    prisma.order.findUnique.mockResolvedValue({
      id: "order-1",
      orderNo: "ORD-1",
      userId: "user-1",
      merchantId: "merchant-1",
      businessType: "takeaway",
      deliveryMode: "platform_rider",
      status: "PAID",
      refundStatus: "none",
      totalAmount: 14,
      payAmount: 14,
      freightAmount: 2,
      discountAmount: 0,
      receiverName: "小明",
      receiverPhone: "13800000000",
      receiverAddress: "宿舍 101",
      remark: "",
      createdAt: new Date(),
      updatedAt: new Date(),
      merchant: {
        id: "merchant-1",
        name: "测试商家",
        logo: null,
        phone: "10086",
        address: "校内",
        latitude: 30,
        longitude: 120,
      },
      items: [
        {
          id: "item-1",
          productId: "product-1",
          productName: "盖饭",
          productImage: "/food.png",
          skuId: null,
          skuSpecs: null,
          price: 12,
          quantity: 1,
          totalPrice: 12,
        },
      ],
      reviews: [
        {
          rating: 5,
          content: "好吃",
          images: ["/review.png"],
          tags: ["味道好"],
          reply: "感谢支持",
          replyAt: new Date("2026-07-17T10:00:00.000Z"),
          createdAt: new Date("2026-07-17T09:00:00.000Z"),
        },
      ],
    });
    prisma.deliveryOrderNode.findMany.mockResolvedValue([]);

    await expect(service.getOrderDetail("order-1", "user-1")).resolves.toEqual(
      expect.objectContaining({
        status: "paid",
        details: [expect.objectContaining({ product_name: "盖饭" })],
        product_amount: 12,
        delivery_fee: 2,
        package_fee: 0,
        box_fee: 0,
        actual_amount: 14,
        merchant: expect.objectContaining({
          name: "测试商家",
          location: { latitude: 30, longitude: 120 },
        }),
        review: expect.objectContaining({
          rating: 5,
          content: "好吃",
          images: ["/review.png"],
          tags: ["味道好"],
          merchant_reply: "感谢支持",
        }),
      }),
    );
  });

  it("only exposes a fresh official rider location through the buyer order detail", async () => {
    const { prisma, service } = createService();
    const now = new Date();
    prisma.order.findUnique.mockResolvedValue({
      id: "order-1",
      orderNo: "ORD-1",
      userId: "user-1",
      riderId: "rider-user",
      merchantId: "merchant-1",
      businessType: "takeaway",
      deliveryMode: "platform_rider",
      deliveryDisplayMode: "live_map",
      status: "SHIPPED",
      refundStatus: "none",
      totalAmount: 14,
      payAmount: 14,
      freightAmount: 2,
      discountAmount: 0,
      receiverName: "小明",
      receiverPhone: "13800000000",
      receiverAddress: "宿舍 101",
      remark: "",
      createdAt: now,
      updatedAt: now,
      merchant: {
        id: "merchant-1",
        name: "测试商家",
        logo: null,
        phone: "10086",
        address: "校内",
        latitude: 30,
        longitude: 120,
      },
      items: [],
    });
    (prisma as any).regionRider = {
      findUnique: jest.fn().mockResolvedValue({
        userId: "rider-user",
        riderType: "official",
        lat: 30.1,
        lng: 120.1,
        locationUpdatedAt: now,
        User: { nickname: "骑手", avatar: "", phone: "13800000001" },
      }),
    };
    prisma.deliveryOrderNode.findMany.mockResolvedValue([]);

    await expect(service.getOrderDetail("order-1", "user-1")).resolves.toEqual(
      expect.objectContaining({
        delivery_track: expect.objectContaining({
          can_show_live_map: true,
          current_location: expect.objectContaining({
            latitude: 30.1,
            longitude: 120.1,
          }),
        }),
      }),
    );
  });

  it("returns the recorded drop-off position without claiming it is live", () => {
    const { service } = createService();
    const track = (service as any).buildDeliveryTrack(
      { deliveryMode: "platform_rider", deliveryDisplayMode: "status_nodes" },
      [
        {
          nodeType: "arrived",
          lat: 30.1,
          lng: 120.1,
          createdAt: new Date(),
          proofImages: ["/proof.jpg"],
        },
      ],
    );

    expect(track).toEqual(
      expect.objectContaining({
        can_show_live_map: false,
        current_location: null,
        last_delivery_location: expect.objectContaining({
          latitude: 30.1,
          longitude: 120.1,
          label: "送达位置",
        }),
        nodes: [expect.objectContaining({ proof_images: ["/proof.jpg"] })],
      }),
    );
  });

  it("makes buyer receipt a completed order with a completion timestamp", async () => {
    const { prisma, service } = createService();
    const order = {
      id: "order-1",
      orderNo: "ORD-1",
      userId: "user-1",
      merchantId: "merchant-1",
      status: "DELIVERED",
      items: [],
      merchant: { userId: "merchant-user", regionId: "region-1" },
    };
    const tx = {
      order: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...order,
          status: "COMPLETED",
          completeTime: new Date(),
          reviews: [],
        }),
      },
      orderLog: { create: jest.fn() },
      deliveryOrderNode: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.order.findUnique.mockResolvedValue(order);
    (prisma as any).$transaction = jest.fn((callback: any) => callback(tx));
    const notifyService: any = {
      createAndDispatch: jest.fn().mockResolvedValue({}),
    };
    (service as any).notifyService = notifyService;

    await service.updateOrderStatus("order-1", "user-1", {
      status: "received",
    });

    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          refundStatus: { notIn: ["refunding", "refunded"] },
        }),
        data: expect.objectContaining({
          status: "COMPLETED",
          completeTime: expect.any(Date),
          receiveTime: expect.any(Date),
        }),
      }),
    );
    expect(tx.orderLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "COMPLETED" }),
      }),
    );
    expect(tx.deliveryOrderNode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nodeType: "completed",
          operatorType: "user",
        }),
      }),
    );
    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "merchant-user",
        scene: "shop_order_received_merchant",
      }),
    );
  });

  it("does not let the buyer confirm receipt while a full refund is processing", async () => {
    const { prisma, service } = createService();
    prisma.order.findUnique.mockResolvedValue({
      id: "order-1",
      userId: "user-1",
      status: "DELIVERED",
      refundStatus: "refunding",
      items: [],
    });

    await expect(
      service.updateOrderStatus("order-1", "user-1", { status: "received" }),
    ).rejects.toThrow("订单退款处理中，无法确认收货");
  });

  it("does not accept a review after a full refund enters the order state", async () => {
    const { prisma, service } = createService();
    prisma.order.findUnique.mockResolvedValue({
      id: "order-1",
      userId: "user-1",
      merchantId: "merchant-1",
      status: "COMPLETED",
      refundStatus: "refunded",
      items: [{ productId: "product-1" }],
    });

    await expect(
      service.submitReview("user-1", { order_id: "order-1", rating: 5 }),
    ).rejects.toThrow("订单退款处理中或已退款，无法评价");
    expect(prisma.review.findFirst).not.toHaveBeenCalled();
  });

  it("binds an order review to its merchant and rejects duplicate reviews", async () => {
    const { prisma, service } = createService();
    const notifyService: any = {
      createAndDispatch: jest.fn().mockResolvedValue({}),
    };
    (service as any).notifyService = notifyService;
    prisma.order.findUnique.mockResolvedValue({
      id: "order-1",
      orderNo: "ORD-1",
      userId: "user-1",
      merchantId: "merchant-1",
      status: "COMPLETED",
      items: [{ productId: "product-1" }],
      merchant: { userId: "merchant-user", regionId: "region-1" },
    });
    prisma.review.findFirst.mockResolvedValue(null);
    prisma.review.create.mockResolvedValue({ id: "review-1" });

    await expect(
      service.submitReview("user-1", {
        order_id: "order-1",
        rating: 5,
        content: "好吃",
      }),
    ).resolves.toEqual({ code: 0, data: { id: "review-1" } });
    expect(prisma.review.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          merchantId: "merchant-1",
          productId: "product-1",
          dedupeKey: "order-1:user-1",
          tags: [],
        }),
      }),
    );
    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "merchant-user",
        scene: "shop_order_review",
        linkValue:
          "/pagesA/merchantreview/merchantreview?merchant_id=merchant-1",
      }),
    );

    prisma.review.findFirst.mockResolvedValue({ id: "review-1" });
    await expect(
      service.submitReview("user-1", { order_id: "order-1", rating: 5 }),
    ).rejects.toThrow("该订单已评价");
  });

  it("rejects malformed review payloads before they can be persisted", async () => {
    const { prisma, service } = createService();
    prisma.order.findUnique.mockResolvedValue({
      id: "order-1",
      userId: "user-1",
      merchantId: "merchant-1",
      status: "COMPLETED",
      items: [{ productId: "product-1" }],
    });
    prisma.review.findFirst.mockResolvedValue(null);

    await expect(
      service.submitReview("user-1", {
        order_id: "order-1",
        rating: 5,
        content: "x".repeat(501),
      }),
    ).rejects.toThrow("评价内容不能超过500字");
    await expect(
      service.submitReview("user-1", {
        order_id: "order-1",
        rating: 5,
        images: ["file:///tmp/untrusted.jpg"],
      }),
    ).rejects.toThrow("评价图片格式不正确");
    await expect(
      service.submitReview("user-1", {
        order_id: "order-1",
        rating: 5,
        tags: ["x".repeat(21)],
      }),
    ).rejects.toThrow("单个评价标签不能超过20字");
    await expect(
      service.replyToReview("review-1", "merchant-user", {
        reply: "x".repeat(501),
      }),
    ).rejects.toThrow("回复内容不能超过500字");
    expect(prisma.review.create).not.toHaveBeenCalled();
    expect(prisma.review.findUnique).not.toHaveBeenCalled();
  });

  it("keeps concurrent duplicate reviews and hidden reviews out of the public surface", async () => {
    const { prisma, service } = createService();
    prisma.order.findUnique.mockResolvedValue({
      id: "order-1",
      userId: "user-1",
      merchantId: "merchant-1",
      status: "COMPLETED",
      items: [{ productId: "product-1" }],
    });
    prisma.review.findFirst.mockResolvedValue(null);
    prisma.review.create.mockRejectedValueOnce({ code: "P2002" });

    await expect(
      service.submitReview("user-1", { order_id: "order-1", rating: 5 }),
    ).rejects.toThrow("该订单已评价");

    prisma.review.findMany.mockResolvedValue([]);
    prisma.review.count.mockResolvedValue(0);
    await expect(
      service.getReviewStats("merchant-1", "region-1"),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 0,
        data: expect.objectContaining({
          total_reviews: 0,
          rating_stats: expect.any(Array),
        }),
      }),
    );
    await expect(
      service.getReviews("merchant-1", { page: 1, page_size: 10 }),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 0,
        data: expect.objectContaining({ reviews: [], total: 0 }),
      }),
    );
    expect(prisma.review.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { merchantId: "merchant-1", status: "active" },
      }),
    );
    expect(prisma.review.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { merchantId: "merchant-1", status: "active" },
      }),
    );
  });

  it("returns the exact review list and tag-stat contract consumed by the takeaway page", async () => {
    const { prisma, service } = createService();
    const review = {
      id: "review-1",
      rating: 5,
      content: "好吃",
      images: ["https://example.com/a.jpg"],
      tags: ["味道好"],
      isAnonymous: false,
      reply: "感谢支持",
      createdAt: new Date(),
      user: { nickname: "小明", avatar: "avatar.jpg" },
      order: { createdAt: new Date(), items: [{ productName: "盖饭" }] },
    };
    prisma.review.findMany.mockResolvedValue([review]);
    prisma.review.count.mockResolvedValue(1);

    await expect(
      service.getReviewStats("merchant-1", "region-1"),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 0,
        data: expect.objectContaining({
          average_rating: 5,
          total_reviews: 1,
          tags: expect.arrayContaining([
            expect.objectContaining({ id: "味道好", count: 1 }),
          ]),
        }),
      }),
    );
    await expect(
      service.getReviews("merchant-1", { tag_ids: "味道好" }),
    ).resolves.toEqual(
      expect.objectContaining({
        code: 0,
        data: expect.objectContaining({
          reviews: [
            expect.objectContaining({
              username: "小明",
              order_items: ["盖饭"],
              merchant_reply: "感谢支持",
            }),
          ],
          total: 1,
        }),
      }),
    );
    expect(prisma.review.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ tags: { array_contains: ["味道好"] } }],
        }),
      }),
    );
  });

  it("allows only the review merchant to reply", async () => {
    const { prisma, service } = createService();
    const notifyService: any = {
      createAndDispatch: jest.fn().mockResolvedValue({}),
    };
    (service as any).notifyService = notifyService;
    prisma.review.findUnique.mockResolvedValue({
      id: "review-1",
      merchantId: "merchant-1",
      userId: "buyer-1",
      orderId: "order-1",
      status: "active",
    });
    prisma.merchant.findUnique.mockResolvedValue({
      id: "merchant-1",
      userId: "merchant-user",
      name: "测试商家",
      regionId: "region-1",
    });
    prisma.review.update.mockResolvedValue({
      id: "review-1",
      reply: "感谢支持",
    });

    await expect(
      service.replyToReview("review-1", "merchant-user", { reply: "感谢支持" }),
    ).resolves.toEqual({ id: "review-1", reply: "感谢支持" });
    expect(prisma.review.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reply: "感谢支持",
          replyAt: expect.any(Date),
        }),
      }),
    );
    expect(notifyService.createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "buyer-1",
        scene: "shop_review_merchant_reply",
        linkValue: "/pagesA/order/order-detail/order-detail?id=order-1",
      }),
    );

    prisma.review.findUnique.mockResolvedValue({
      id: "review-1",
      merchantId: "merchant-1",
      userId: "buyer-1",
      orderId: "order-1",
      status: "hidden",
    });
    await expect(
      service.replyToReview("review-1", "merchant-user", { reply: "不应发送" }),
    ).rejects.toThrow("该评价已隐藏，无法回复");
  });
});

describe("ShopService dorm-shop employee delivery closure", () => {
  it("moves an accepted dorm-shop order into the delivery queue and creates a six-digit code", async () => {
    const prisma: any = {};
    const service = new ShopService(
      prisma,
      { createAndDispatch: jest.fn() } as any,
      {} as any,
    );
    const order = {
      id: "order-1",
      merchantId: "merchant-1",
      status: "PAID",
      businessType: "dorm_shop",
      merchantAcceptTime: new Date(),
      readyTime: null,
      refundStatus: "none",
      merchant: { id: "merchant-1", userId: "owner-1", name: "学生小店" },
      user: { id: "buyer-1" },
      items: [],
    };
    const tx = {
      order: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ ...order, status: "SHIPPED" }),
      },
      orderLog: { create: jest.fn() },
      deliveryOrderNode: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction = jest.fn((callback: any) => callback(tx));
    jest
      .spyOn(service as any, "getOwnedMerchantOrder")
      .mockResolvedValue(order);
    jest
      .spyOn(service as any, "notifyBuyerOrderStatus")
      .mockResolvedValue(undefined);

    await service.readyMerchantOrder("order-1", "owner-1");

    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SHIPPED",
          deliveryReceiptCode: expect.stringMatching(/^\d{6}$/),
          deliveryCodeAttempts: 0,
        }),
      }),
    );
  });

  it("lets the owner assign an active phone-bound employee without granting shop management", async () => {
    const createAndDispatch = jest.fn().mockResolvedValue({});
    const prisma: any = {
      merchantStaff: {
        findFirst: jest.fn().mockResolvedValue({
          id: "staff-1",
          userId: "staff-user",
          merchantId: "merchant-1",
          status: "active",
          user: { id: "staff-user", nickname: "小李", phone: "13800000000" },
        }),
      },
      shopDeliveryAssignment: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: "assign-1",
          staffId: "staff-1",
          assigneeUserId: "staff-user",
          assigneeType: "staff",
          source: "manual",
          status: "pending_accept",
          attemptNo: 1,
          assignee: {
            id: "staff-user",
            nickname: "小李",
            phone: "13800000000",
          },
        }),
      },
      orderLog: { create: jest.fn() },
    };
    const service = new ShopService(
      prisma,
      { createAndDispatch } as any,
      {} as any,
    );
    jest.spyOn(service as any, "getOwnedMerchantOrder").mockResolvedValue({
      id: "order-1",
      merchantId: "merchant-1",
      status: "SHIPPED",
      businessType: "dorm_shop",
      readyTime: new Date(),
      refundStatus: "none",
      merchant: {
        id: "merchant-1",
        userId: "owner-1",
        name: "学生小店",
        staffAcceptSeconds: 90,
        staffMaxActiveOrders: 2,
      },
    });

    await service.assignDormShopOrder("order-1", "owner-1", {
      staff_id: "staff-1",
    });

    expect(prisma.shopDeliveryAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          staffId: "staff-1",
          assigneeUserId: "staff-user",
          status: "pending_accept",
        }),
      }),
    );
    expect(createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "staff-user",
        scene: "dorm_shop_staff_assignment",
      }),
    );
  });

  it("does not overwrite a pickup that happens while the owner is reassigning", async () => {
    const updatedAt = new Date();
    const prisma: any = {
      merchantStaff: {
        findFirst: jest.fn().mockResolvedValue({
          id: "staff-2",
          userId: "staff-user-2",
          merchantId: "merchant-1",
          status: "active",
          user: { id: "staff-user-2", nickname: "小王", phone: "13900000000" },
        }),
      },
      shopDeliveryAssignment: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue({
          id: "assign-1",
          orderId: "order-1",
          status: "picked_up",
          attemptNo: 1,
          updatedAt,
        }),
        updateMany: jest.fn(),
      },
    };
    const service = new ShopService(prisma, {} as any, {} as any);
    jest.spyOn(service as any, "getOwnedMerchantOrder").mockResolvedValue({
      id: "order-1",
      merchantId: "merchant-1",
      status: "SHIPPED",
      businessType: "dorm_shop",
      readyTime: new Date(),
      refundStatus: "none",
      shopDeliveryAssignment: {
        id: "assign-1",
        status: "accepted",
        attemptNo: 1,
        updatedAt: new Date(updatedAt.getTime() - 1000),
      },
      merchant: { staffMaxActiveOrders: 2 },
    });

    await expect(
      service.assignDormShopOrder("order-1", "owner-1", {
        staff_id: "staff-2",
      }),
    ).rejects.toThrow("配送员已取货，送达前不能改派");
    expect(prisma.shopDeliveryAssignment.updateMany).not.toHaveBeenCalled();
  });

  it("accepts a staff invitation only while the invitation is still active", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma: any = {
      merchantStaff: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: "staff-1" })
          .mockResolvedValueOnce({
            id: "staff-1",
            userId: "staff-user",
            merchantId: "merchant-1",
            status: "invited",
            inviteExpiresAt: expiresAt,
            merchant: { id: "merchant-1", name: "学生小店" },
          }),
        updateMany,
      },
    };
    const redis = {
      withLock: async (_key: string, _ttl: number, task: () => Promise<any>) =>
        task(),
    };
    const service = new ShopService(prisma, {} as any, {} as any, redis as any);

    await expect(
      service.acceptShopStaffInvitation("staff-1", "staff-user"),
    ).resolves.toMatchObject({ success: true, merchant_id: "merchant-1" });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "staff-1",
          userId: "staff-user",
          status: "invited",
          inviteExpiresAt: { gt: expect.any(Date) },
        }),
      }),
    );
  });

  it("does not resurrect an invitation that the owner already removed", async () => {
    const prisma: any = {
      merchantStaff: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: "staff-1" })
          .mockResolvedValueOnce({
            id: "staff-1",
            userId: "staff-user",
            merchantId: "merchant-1",
            status: "removed",
            inviteExpiresAt: new Date(Date.now() + 60_000),
            merchant: { id: "merchant-1", name: "学生小店" },
          }),
        updateMany: jest.fn(),
      },
    };
    const redis = {
      withLock: async (_key: string, _ttl: number, task: () => Promise<any>) =>
        task(),
    };
    const service = new ShopService(prisma, {} as any, {} as any, redis as any);

    await expect(
      service.acceptShopStaffInvitation("staff-1", "staff-user"),
    ).rejects.toThrow("该邀请已经处理");
    expect(prisma.merchantStaff.updateMany).not.toHaveBeenCalled();
  });

  it("lets the owner revoke a pending invitation with a conditional state update", async () => {
    const updatedAt = new Date();
    const staff = {
      id: "staff-1",
      merchantId: "merchant-1",
      status: "invited",
      acceptedAt: null,
      onDuty: false,
      updatedAt,
    };
    const prisma: any = {
      merchantStaff: {
        findFirst: jest.fn().mockResolvedValue(staff),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      shopDeliveryAssignment: {
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    prisma.$transaction = jest.fn((callback: any) => callback(prisma));
    const redis = {
      withLock: jest.fn(
        async (_key: string, _ttl: number, task: () => Promise<any>) => task(),
      ),
    };
    const service = new ShopService(prisma, {} as any, {} as any, redis as any);
    jest
      .spyOn(service as any, "assertMerchantOwner")
      .mockResolvedValue({ id: "merchant-1" });

    await expect(
      service.updateMerchantStaff("merchant-1", "staff-1", "owner-1", {
        status: "removed",
      }),
    ).resolves.toEqual({ success: true });
    expect(redis.withLock).toHaveBeenCalledWith(
      "shop:staff-state:staff-1",
      10,
      expect.any(Function),
    );
    expect(prisma.merchantStaff.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "staff-1", status: "invited", updatedAt },
        data: expect.objectContaining({ status: "removed", onDuty: false }),
      }),
    );
  });

  it("serializes duty changes with owner pause and removal operations", async () => {
    const updatedAt = new Date();
    const prisma: any = {
      merchantStaff: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: "staff-1" })
          .mockResolvedValueOnce({
            id: "staff-1",
            userId: "staff-user",
            merchantId: "merchant-1",
            status: "active",
            updatedAt,
          }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const redis = {
      withLock: jest.fn(
        async (_key: string, _ttl: number, task: () => Promise<any>) => task(),
      ),
    };
    const service = new ShopService(prisma, {} as any, {} as any, redis as any);

    await expect(
      service.updateShopStaffDuty("staff-user", {
        merchant_id: "merchant-1",
        on_duty: true,
      }),
    ).resolves.toEqual({ success: true, on_duty: true });
    expect(redis.withLock).toHaveBeenCalledWith(
      "shop:staff-state:staff-1",
      10,
      expect.any(Function),
    );
    expect(prisma.merchantStaff.updateMany).toHaveBeenCalledWith({
      where: { id: "staff-1", status: "active", updatedAt },
      data: { onDuty: true },
    });
  });

  it("counts an employee's active delivery capacity inside the current shop", async () => {
    const prisma: any = {
      shopDeliveryAssignment: {
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      orderLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new ShopService(prisma, {} as any, {} as any);
    jest
      .spyOn(service as any, "getOwnedShopStaffAssignment")
      .mockResolvedValue({
        id: "assign-1",
        staffId: "staff-1",
        orderId: "order-1",
        merchantId: "merchant-1",
        assigneeUserId: "staff-user",
        status: "pending_accept",
        acceptDeadline: new Date(Date.now() + 60_000),
        merchant: { staffMaxActiveOrders: 2 },
        order: { status: "SHIPPED", refundStatus: "none" },
      });

    await service.acceptShopStaffAssignment("assign-1", "staff-user");

    expect(prisma.shopDeliveryAssignment.count).toHaveBeenCalledWith({
      where: {
        merchantId: "merchant-1",
        assigneeUserId: "staff-user",
        status: { in: ["accepted", "picked_up"] },
      },
    });
    expect(prisma.shopDeliveryAssignment.updateMany).toHaveBeenCalledWith({
      where: {
        id: "assign-1",
        staffId: "staff-1",
        assigneeUserId: "staff-user",
        status: "pending_accept",
      },
      data: { status: "accepted", acceptedAt: expect.any(Date) },
    });
  });

  it("serializes staff pickup with refunds and claims the refundable order in the same transaction", async () => {
    const assignment = {
      id: "assign-1",
      staffId: "staff-1",
      orderId: "order-1",
      merchantId: "merchant-1",
      assigneeUserId: "staff-user",
      status: "accepted",
      order: { status: "SHIPPED", refundStatus: "none" },
    };
    const tx: any = {
      shopDeliveryAssignment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      orderLog: { create: jest.fn() },
      deliveryOrderNode: { create: jest.fn() },
    };
    const prisma: any = {
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const redis = {
      withLock: jest.fn(
        async (_key: string, _ttl: number, task: () => Promise<any>) => task(),
      ),
    };
    const service = new ShopService(prisma, {} as any, {} as any, redis as any);
    jest
      .spyOn(service as any, "getOwnedShopStaffAssignment")
      .mockResolvedValue(assignment);

    await expect(
      service.pickupShopStaffAssignment("assign-1", "staff-user"),
    ).rejects.toThrow("订单正在退款，请暂停配送");
    expect(redis.withLock).toHaveBeenCalledWith(
      "payment:refund:order:order-1",
      30,
      expect.any(Function),
    );
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: "order-1",
        status: "SHIPPED",
        refundStatus: { notIn: ["refunding", "refunded"] },
      },
      data: { pickupTime: expect.any(Date) },
    });
    expect(tx.orderLog.create).not.toHaveBeenCalled();
  });

  it("does not let the owner reassign an order after the employee picked it up", async () => {
    const service = new ShopService({} as any, {} as any, {} as any);
    jest.spyOn(service as any, "getOwnedMerchantOrder").mockResolvedValue({
      id: "order-1",
      merchantId: "merchant-1",
      status: "SHIPPED",
      businessType: "dorm_shop",
      readyTime: new Date(),
      refundStatus: "none",
      shopDeliveryAssignment: { status: "picked_up" },
    });

    await expect(
      service.assignDormShopOrder("order-1", "owner-1", {
        staff_id: "staff-2",
      }),
    ).rejects.toThrow("配送员已取货，送达前不能改派");
  });

  it("requires the employee to pick up before submitting delivery proof", async () => {
    const prisma: any = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: "order-1",
          merchantId: "merchant-1",
          status: "SHIPPED",
          businessType: "dorm_shop",
          refundStatus: "none",
          merchant: { id: "merchant-1", userId: "owner-1" },
          user: { id: "buyer-1" },
          items: [],
          shopDeliveryAssignment: {
            id: "assign-1",
            assigneeUserId: "staff-user",
            status: "accepted",
          },
        }),
      },
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    await expect(
      (service as any).completeDormShopDelivery(
        "order-1",
        "staff-user",
        { receipt_code: "123456" },
        "staff",
      ),
    ).rejects.toThrow("该订单未取货");
  });

  it("finishes immediately with the correct six-digit receipt code", async () => {
    const prisma: any = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: "order-1",
          merchantId: "merchant-1",
          userId: "buyer-1",
          status: "SHIPPED",
          businessType: "dorm_shop",
          refundStatus: "none",
          deliveryReceiptCode: "123456",
          deliveryCodeAttempts: 0,
          merchant: { id: "merchant-1", userId: "owner-1", name: "学生小店" },
          user: { id: "buyer-1" },
          items: [],
          shopDeliveryAssignment: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const tx = {
      order: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "order-1",
          merchantId: "merchant-1",
          userId: "buyer-1",
          status: "COMPLETED",
          businessType: "dorm_shop",
          merchant: { name: "学生小店" },
          user: { id: "buyer-1" },
          items: [],
        }),
      },
      orderLog: { create: jest.fn() },
      deliveryOrderNode: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction = jest.fn((callback: any) => callback(tx));
    const service = new ShopService(
      prisma,
      { createAndDispatch: jest.fn() } as any,
      {} as any,
    );
    jest
      .spyOn(service as any, "notifyBuyerOrderStatus")
      .mockResolvedValue(undefined);

    await expect(
      service.completeMerchantOrder("order-1", "owner-1", {
        receipt_code: "123456",
      }),
    ).resolves.toMatchObject({ success: true, method: "receipt_code" });
    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deliveryReceiptCode: "123456",
          deliveryCodeLockedAt: null,
          deliveryCodeAttempts: { lte: 5 },
        }),
        data: expect.objectContaining({
          status: "COMPLETED",
          receiveTime: expect.any(Date),
          completeTime: expect.any(Date),
        }),
      }),
    );
  });

  it("alerts the owner once when automatic dispatch has no available employee", async () => {
    const createAndDispatch = jest.fn().mockResolvedValue({});
    const orderLogCreate = jest.fn().mockResolvedValue({});
    const prisma: any = {
      order: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "order-1",
            merchantId: "merchant-1",
            readyTime: new Date(Date.now() - 2 * 60_000),
            merchant: {
              id: "merchant-1",
              userId: "owner-1",
              regionId: "region-1",
              name: "学生小店",
              autoDispatchMinutes: 1,
              staffMaxActiveOrders: 2,
            },
            shopDeliveryAssignment: null,
            orderLogs: [],
          },
        ]),
      },
      merchantStaff: { findMany: jest.fn().mockResolvedValue([]) },
      orderLog: { create: orderLogCreate },
    };
    const service = new ShopService(
      prisma,
      { createAndDispatch } as any,
      {} as any,
    );

    await (service as any).autoDispatchDormShopOrdersUnlocked();

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          merchant: {
            autoDispatchEnabled: true,
            status: { in: ["approved", "closed"] },
          },
        }),
      }),
    );
    expect(orderLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "SHOP_STAFF_NO_AVAILABLE" }),
      }),
    );
    expect(createAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "owner-1",
        scene: "dorm_shop_dispatch_attention",
        channelMask: { inApp: true, websocket: true, push: true },
      }),
    );
  });
});

describe("ShopService campus partner merchant boundaries", () => {
  it("requires a bound account phone but no business licence for student dorm-shop applications", async () => {
    const prisma: any = {
      studentVerify: {
        findUnique: jest.fn().mockResolvedValue({ status: "APPROVED" }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ phone: "" }) },
      category: { findFirst: jest.fn().mockResolvedValue(null) },
      merchant: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: "merchant-1" }),
      },
    };
    const service = new ShopService(prisma, {} as any, {} as any);
    const base = {
      business_type: "dorm_shop",
      name: "宿舍小店",
      contact_name: "小明",
      phone: "13900000000",
      region_id: "region-1",
      dorm_building: "3栋",
      dorm_room: "101",
      business_hours: "09:00-22:00",
    };

    await expect(service.applyMerchant("user-1", base)).rejects.toThrow(
      "请先在小程序绑定手机号",
    );

    prisma.user.findUnique.mockResolvedValue({ phone: "13800000000" });
    await expect(service.applyMerchant("user-1", base)).resolves.toEqual({
      id: "merchant-1",
    });
    expect(prisma.merchant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessType: "dorm_shop",
        phone: "13800000000",
        studentVerified: false,
        businessLicenseUrl: null,
        foodSafetyLicenseUrl: null,
      }),
    });
  });

  it("hides pending dorm shops and their product catalog from public routes", async () => {
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-pending",
          businessType: "dorm_shop",
          status: "pending",
          products: [],
        }),
      },
      category: { findMany: jest.fn() },
      product: { findMany: jest.fn() },
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    await expect(service.getDormShopDetail("merchant-pending")).rejects.toThrow(
      "宿舍小店不存在",
    );
    await expect(
      service.getCategoriesAndProducts("merchant-pending"),
    ).rejects.toThrow("商家不存在");
    expect(prisma.category.findMany).not.toHaveBeenCalled();
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it("rejects an invalid original product price at the service boundary", async () => {
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          userId: "merchant-user",
          businessType: "dorm_shop",
          status: "approved",
        }),
      },
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    await expect(
      (service as any).normalizeProductPayload(
        {
          merchant_id: "merchant-1",
          product_name: "矿泉水",
          sale_price: 2,
          original_price: "not-a-number",
        },
        "merchant-user",
      ),
    ).rejects.toThrow("商品划线价不正确");
  });

  it("does not let a pending merchant approve itself", async () => {
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          userId: "merchant-user",
          businessType: "dorm_shop",
          status: "pending",
        }),
        update: jest.fn(),
      },
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    await expect(
      service.updateMerchant("merchant-1", "merchant-user", {
        status: "approved",
      }),
    ).rejects.toThrow("审核状态只能由后台修改");
    expect(prisma.merchant.update).not.toHaveBeenCalled();
  });

  it("still lets an approved owner pause and reopen its shop", async () => {
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          userId: "merchant-user",
          businessType: "dorm_shop",
          status: "approved",
        }),
        update: jest
          .fn()
          .mockResolvedValue({ id: "merchant-1", status: "closed" }),
      },
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    await service.updateMerchant("merchant-1", "merchant-user", {
      status: "closed",
    });

    expect(prisma.merchant.update).toHaveBeenCalledWith({
      where: { id: "merchant-1" },
      data: expect.objectContaining({
        status: "closed",
        deliveryMode: "self_delivery",
      }),
    });
  });

  it("allows an operating student shop to clear legacy credentials but rejects unsafe URLs", async () => {
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          userId: "merchant-user",
          businessType: "dorm_shop",
          status: "approved",
          foodSafetyLicenseUrl: "/uploads/food-license.jpg",
        }),
        update: jest.fn().mockResolvedValue({ id: "merchant-1" }),
      },
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    await expect(
      service.updateMerchant("merchant-1", "merchant-user", {
        food_safety_license_url: "",
      }),
    ).resolves.toEqual({ id: "merchant-1" });
    await expect(
      service.updateMerchant("merchant-1", "merchant-user", {
        food_safety_license_url: "javascript:alert(1)",
      }),
    ).rejects.toThrow("食品许可或备案凭证图片地址不正确");
    expect(prisma.merchant.update).toHaveBeenCalledTimes(1);
  });

  it("creates a category inside the authenticated merchant only", async () => {
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          userId: "merchant-user",
          businessType: "dorm_shop",
          status: "approved",
        }),
      },
      category: { create: jest.fn().mockResolvedValue({ id: "category-1" }) },
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    await service.createCategory("merchant-user", {
      merchant_id: "merchant-1",
      category_name: "饮料",
    });

    expect(prisma.category.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        merchantId: "merchant-1",
        businessType: "dorm_shop",
        name: "饮料",
      }),
    });
  });

  it("does not let a merchant update another merchant category", async () => {
    const prisma: any = {
      category: {
        findUnique: jest.fn().mockResolvedValue({
          id: "category-2",
          merchantId: "merchant-2",
        }),
        update: jest.fn(),
      },
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-2",
          userId: "other-user",
          businessType: "dorm_shop",
          status: "approved",
        }),
      },
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    await expect(
      service.updateCategory("category-2", "merchant-user", {
        category_name: "越权改名",
      }),
    ).rejects.toThrow("只能管理自己小店的分类");
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it("loads only global or current-merchant categories in the owner workbench", async () => {
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          userId: "merchant-user",
          businessType: "dorm_shop",
          status: "approved",
        }),
      },
      category: { findMany: jest.fn().mockResolvedValue([]) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    await service.getManageCategoriesAndProducts("merchant-1", "merchant-user");

    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ merchantId: null }, { merchantId: "merchant-1" }],
        }),
      }),
    );
  });

  it("moves products to unclassified before deleting an owned category", async () => {
    const tx = {
      product: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      category: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      category: {
        findUnique: jest.fn().mockResolvedValue({
          id: "category-1",
          merchantId: "merchant-1",
          status: "active",
        }),
      },
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          userId: "merchant-user",
        }),
      },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    await service.deleteCategory("category-1", "merchant-user");

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { categoryId: "category-1" },
      data: { categoryId: null },
    });
    expect(tx.category.update).toHaveBeenCalledWith({
      where: { id: "category-1" },
      data: { status: "deleted", isShow: false },
    });
  });

  it("does not let a product use another shop's private category", async () => {
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          userId: "merchant-user",
          businessType: "dorm_shop",
          status: "approved",
        }),
      },
      category: { findFirst: jest.fn().mockResolvedValue(null) },
      product: { create: jest.fn() },
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    await expect(
      service.createProduct("merchant-user", {
        merchant_id: "merchant-1",
        category_id: "another-shop-category",
        product_name: "矿泉水",
        price: 2,
      }),
    ).rejects.toThrow("只能使用当前小店或平台公共分类");
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it("saves a product and its SKU inventory atomically", async () => {
    const tx = {
      product: {
        create: jest.fn().mockResolvedValue({
          id: "product-1",
          merchantId: "merchant-1",
          name: "牛奶",
          images: ["/uploads/milk.jpg"],
          price: 3,
          stock: 5,
          status: "on_sale",
        }),
      },
      sKU: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest
          .fn()
          .mockResolvedValueOnce({ id: "sku-1" })
          .mockResolvedValueOnce({ id: "sku-2" }),
        update: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          userId: "merchant-user",
          businessType: "dorm_shop",
          status: "approved",
        }),
      },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    const result = await service.saveProductWithOptions(null, "merchant-user", {
      product: {
        merchant_id: "merchant-1",
        product_name: "牛奶",
        product_image: "/uploads/milk.jpg",
        sale_price: 99,
        total_stock: 99,
      },
      specs: [
        {
          spec_name: "规格",
          options: [
            {
              option_name: "小盒",
              external_price: 3,
              daily_stock: 2,
            },
            {
              option_name: "大盒",
              external_price: 5,
              daily_stock: 3,
            },
          ],
        },
      ],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ price: 3, stock: 5 }),
    });
    expect(tx.sKU.create).toHaveBeenCalledTimes(2);
    expect(tx.sKU.deleteMany).toHaveBeenCalledWith({
      where: { productId: "product-1", id: { notIn: ["sku-1", "sku-2"] } },
    });
    expect(result.id).toBe("product-1");
  });

  it("rejects duplicate SKU names before publishing the product", async () => {
    const prisma: any = {
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "merchant-1",
          userId: "merchant-user",
          businessType: "dorm_shop",
          status: "approved",
        }),
      },
      $transaction: jest.fn(),
    };
    const service = new ShopService(prisma, {} as any, {} as any);

    await expect(
      service.saveProductWithOptions(null, "merchant-user", {
        product: {
          merchant_id: "merchant-1",
          product_name: "牛奶",
          sale_price: 3,
        },
        specs: [
          {
            options: [
              { option_name: "大盒", external_price: 3, daily_stock: 1 },
              { option_name: "大盒", external_price: 4, daily_stock: 1 },
            ],
          },
        ],
      }),
    ).rejects.toThrow("SKU 名称不能重复");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("keeps delivered self-delivery orders waiting for buyer confirmation", () => {
    const service = new ShopService({} as any, {} as any, {} as any);
    const order = {
      id: "order-1",
      orderNo: "DS-1",
      businessType: "dorm_shop",
      status: "DELIVERED",
      refundStatus: "none",
      payAmount: 12,
      freightAmount: 0,
      packagingAmount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    };

    expect((service as any).formatMerchantOrderForMini(order).status).toBe(
      "delivered",
    );
    expect(
      (service as any).merchantDeliveryStatusesForMini("completed"),
    ).toEqual(["RECEIVED", "COMPLETED"]);
  });
});
